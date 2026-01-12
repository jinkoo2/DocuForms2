import React, { useState, useEffect, useRef } from 'react';
import { fetchForm, submitForm, fetchBaselineSubmission, BACKEND_URL } from '../utils/api';
import { fixFormHtml, getFormValues, getControlMetadata, getResultForSubmit } from '../utils/formUtils';
import { eval_form } from '../utils/testFunctions';
import SubmissionsList from './SubmissionsList';

// Make BACKEND_URL available globally for form scripts
if (typeof window !== 'undefined') {
  window.BACKEND_URL = BACKEND_URL;
}

function FormRunner({ formId }) {
  const [formDef, setFormDef] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [liveResult, setLiveResult] = useState('—');
  const [serverResponse, setServerResponse] = useState('');
  const [comments, setComments] = useState('');
  const [baselineSubmission, setBaselineSubmission] = useState(null);
  const fieldsRef = useRef(null);
  const formRef = useRef(null);

  const evaluateLive = React.useCallback(() => {
    // Calculate form-level result based on field results
    if (!fieldsRef.current) return;
    
    try {
      const controls = fieldsRef.current.querySelectorAll('input, select, textarea');
      const results = [];
      
      controls.forEach((el) => {
        const result = el.dataset?.result;
        if (result && result.trim()) {
          results.push(result.toUpperCase());
        }
      });
      
      if (results.length === 0) {
        setLiveResult('—');
        return;
      }
      
      // Form result logic:
      // 1. If ANY field is FAIL, form result is FAIL
      // 2. Else if ANY field is WARNING, form result is WARNING
      // 3. Else if ALL fields are PASS, form result is PASS
      // 4. Otherwise, empty string
      
      let formResult = '';
      if (results.some(r => r === 'FAIL')) {
        formResult = 'FAIL';
      } else if (results.some(r => r === 'WARNING')) {
        formResult = 'WARNING';
      } else if (results.every(r => r === 'PASS')) {
        formResult = 'PASS';
      }
      
      setLiveResult(formResult || '—');
    } catch (err) {
      console.error('Error in evaluateLive:', err);
    }
  }, []);

  const handleInputChange = React.useCallback(() => {
    // Trigger live evaluation if needed
    // Use setTimeout to avoid conflicts with inline handlers
    // Only update if fieldsRef is still valid (form hasn't been reloaded)
    setTimeout(() => {
      if (fieldsRef.current) {
        evaluateLive();
      }
    }, 50);
  }, [evaluateLive]);

  const handleSubmit = React.useCallback(async (e) => {
    e.preventDefault();
    
    if (!formId || !formRef.current) {
      alert('No form selected. Please select a form from the list.');
      return;
    }

    try {
      console.log('Submitting form:', formId);
      console.log('Form element:', formRef.current);
      
      const values = getFormValues(formRef.current);
      const metadata = getControlMetadata(formRef.current);
      // getResultForSubmit reads from DOM, so we don't need liveResult state
      const result = getResultForSubmit(formRef.current, '');
      
      console.log('Collected values:', values);
      console.log('Collected metadata:', metadata);
      console.log('Result:', result);
      
      // Read comments directly from the textarea element to avoid dependency issues
      const commentsTextarea = document.getElementById('submission-comments');
      const commentsValue = commentsTextarea ? commentsTextarea.value.trim() : '';
      
      const submission = {
        values,
        metadata,
        result,
        comments: commentsValue
      };

      console.log('Submitting:', submission);
      const data = await submitForm(formId, submission);
      setServerResponse(JSON.stringify(data, null, 2));
      setLiveResult((data.result || '').toUpperCase());
      setComments('');
      
      // Reload submissions
      window.dispatchEvent(new CustomEvent('reloadSubmissions'));
    } catch (err) {
      alert(`Submission failed: ${err.message}`);
      console.error('Error submitting form:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]); // Removed comments and liveResult from dependencies to prevent reload loop

  const setupFormListeners = React.useCallback(() => {
    if (!fieldsRef.current || !formRef.current) return;
    
    try {
      // Remove old listeners first
      const oldInputs = fieldsRef.current.querySelectorAll('input, select, textarea');
      oldInputs.forEach(input => {
        input.removeEventListener('input', handleInputChange);
      });
      
      // Set up input listeners for live evaluation
      // Note: We're NOT overriding inline oninput handlers - they work alongside these
      const inputs = fieldsRef.current.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        // Only add listener if there's no inline handler to avoid conflicts
        // The inline handler will call eval_form, and our handler will update liveResult
        input.addEventListener('input', handleInputChange, { passive: true });
      });
      
      // Remove old submit listener
      formRef.current.removeEventListener('submit', handleSubmit);
      
      // Set up form submit
      if (formRef.current) {
        formRef.current.addEventListener('submit', handleSubmit);
      }
    } catch (err) {
      console.error('Error setting up form listeners:', err);
    }
  }, [handleInputChange, handleSubmit]);

  const loadForm = React.useCallback(async () => {
    if (!formId) return;
    
    console.log('Loading form:', formId);
    
    try {
      setLoading(true);
      setError(null);
      
      const [formData, baseline] = await Promise.all([
        fetchForm(formId),
        fetchBaselineSubmission(formId)
      ]);
      
      console.log('Form data loaded:', formData);
      
      setFormDef(formData);
      setBaselineSubmission(baseline);
      
      // Make baseline available globally for form scripts
      window.baselineSubmission = baseline;
      
      // Render form HTML - use setTimeout to ensure DOM is ready
      setTimeout(() => {
        if (fieldsRef.current && formRef.current) {
          const fixedHtml = fixFormHtml(formData.html || '');
          // Extract body content if HTML includes body tag
          let htmlContent = fixedHtml;
          if (htmlContent.includes('<body')) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            htmlContent = doc.body.innerHTML;
          }
          fieldsRef.current.innerHTML = htmlContent;
          
          // Make baseline available globally for form scripts
          window.baselineSubmission = baseline;
          
          // Create stable references for event handlers that don't depend on changing state
          const inputHandler = () => {
            if (fieldsRef.current) {
              // Use the stable evaluateLive callback
              evaluateLive();
            }
          };
          
          // Create a stable submit handler that reads current state at execution time
          const submitHandler = (e) => {
            e.preventDefault();
            // Call handleSubmit which will read current state values
            handleSubmit(e);
          };
          
          // Set up event listeners directly
          try {
            // Remove old listeners first (if any exist)
            const oldInputs = fieldsRef.current.querySelectorAll('input, select, textarea');
            oldInputs.forEach(input => {
              // We can't remove the specific handler, so we'll just add new ones
              // The inline handlers will work alongside these
            });
            
            // Set up input listeners for live evaluation
            // Only add to inputs that don't have inline oninput handlers to avoid double execution
            const inputs = fieldsRef.current.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
              // Don't add listener if there's already an inline oninput handler
              // The inline handler will call eval_form, and we'll update liveResult separately
              if (!input.getAttribute('oninput')) {
                input.addEventListener('input', inputHandler, { passive: true });
              }
            });
            
            // Remove old submit listener
            formRef.current.removeEventListener('submit', submitHandler);
            
            // Set up form submit
            formRef.current.addEventListener('submit', submitHandler);
          } catch (err) {
            console.error('Error setting up form listeners:', err);
          }
          
          // Call eval_form to run data-script on all controls
          if (typeof window.eval_form === 'function') {
            setTimeout(() => {
              try {
                window.eval_form(null);
                // Update live result after eval_form completes
                setTimeout(() => {
                  if (fieldsRef.current) {
                    evaluateLive();
                  }
                }, 10);
              } catch (err) {
                console.error('Error in eval_form:', err);
              }
            }, 100);
          }
        }
      }, 0);
      
      setLiveResult('—');
      setServerResponse('');
      setComments('');
    } catch (err) {
      setError(err.message);
      console.error('Error loading form:', err);
    } finally {
      setLoading(false);
    }
  }, [formId, evaluateLive, handleSubmit]);

  useEffect(() => {
    console.log('FormRunner useEffect - formId changed:', formId);
    if (!formId) {
      setFormDef(null);
      setLiveResult('—');
      setServerResponse('');
      setError(null);
      if (fieldsRef.current) {
        fieldsRef.current.innerHTML = '';
      }
      return;
    }

    loadForm();
  }, [formId, loadForm]);

  if (!formId) {
    return (
      <>
        <h2>No form selected</h2>
        <p>Please select a form from the list.</p>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <h2>Loading...</h2>
        <p>Loading form...</p>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h2>Error loading form</h2>
        <p style={{ color: 'red' }}>Error: {error}</p>
      </>
    );
  }

  return (
    <>
      <h2>{formDef?.name || formId}</h2>

      <ul className="nav nav-tabs mb-3" role="tablist">
        <li className="nav-item" role="presentation">
          <button 
            className="nav-link active" 
            data-bs-toggle="tab" 
            data-bs-target="#form-tab"
            type="button"
          >
            Form
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button 
            className="nav-link" 
            data-bs-toggle="tab" 
            data-bs-target="#submissions-tab"
            type="button"
          >
            Submissions
          </button>
        </li>
      </ul>

      <div className="tab-content">
        <div className="tab-pane fade show active" id="form-tab" role="tabpanel">
          <form ref={formRef} id="form">
            <div ref={fieldsRef} id="fields"></div>

            <div className="result">
              Result: <span id="live-result">{liveResult}</span>
            </div>

            <div className="mb-3">
              <label htmlFor="submission-comments" className="form-label">Comments</label>
              <textarea
                id="submission-comments"
                className="form-control"
                rows="3"
                placeholder="Add any comments about this submission (e.g., why it failed, notes, etc.)"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>

            <button type="submit">Submit</button>
          </form>

          {serverResponse && (
            <pre id="server-response">{serverResponse}</pre>
          )}
        </div>

        <div className="tab-pane fade" id="submissions-tab" role="tabpanel">
          <SubmissionsList formId={formId} />
        </div>
      </div>
    </>
  );
}

export default FormRunner;
