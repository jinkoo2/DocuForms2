import React, { useState, useEffect, useRef } from 'react';
import { fetchForm, submitForm, fetchBaselineSubmission, BACKEND_URL } from '../utils/api';
import { fixFormHtml, getFormValues, getControlMetadata, getResultForSubmit, generateSubmissionHtml } from '../utils/formUtils';
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

    // Check HTML5 form validation before submitting
    // Also manually check all required hidden inputs for checkbox/radio groups
    const requiredHiddenInputs = formRef.current.querySelectorAll('input[type="hidden"][required]');
    let hasInvalidRequiredGroup = false;
    
    requiredHiddenInputs.forEach(hidden => {
      // Check if this is a radio group (single value) or checkbox group (array)
      const hiddenId = hidden.id || hidden.name;
      let isRadioGroup = false;
      if (hiddenId) {
        const containerId = `${hiddenId}_group`;
        const container = formRef.current.querySelector(`#${containerId}`);
        if (container) {
          const radios = container.querySelectorAll('input[type="radio"]');
          isRadioGroup = radios.length > 0;
        }
      }
      
      const errorMessage = isRadioGroup ? 'Please select an option.' : 'Please select at least one option.';
      
      if (!hidden.value || hidden.value.trim() === '') {
        // Set custom validity if not already set
        if (hidden.validationMessage === '') {
          hidden.setCustomValidity(errorMessage);
        }
        // Add is-invalid class for Bootstrap styling
        hidden.classList.add('is-invalid');
        
        // Show invalid-feedback div - try multiple strategies
        let feedback = null;
        
        // Strategy 1: Check next sibling
        let sibling = hidden.nextElementSibling;
        while (sibling) {
          if (sibling.classList && sibling.classList.contains('invalid-feedback')) {
            feedback = sibling;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
        
        // Strategy 2: Check parent container
        if (!feedback) {
          const parent = hidden.parentElement;
          if (parent) {
            feedback = parent.querySelector('.invalid-feedback');
          }
        }
        
        // Strategy 3: Check the checkbox group container
        if (!feedback) {
          const hiddenId = hidden.id || hidden.name;
          if (hiddenId) {
            const containerId = `${hiddenId}_group`;
            const container = document.getElementById(containerId);
            if (container) {
              const containerParent = container.parentElement;
              if (containerParent) {
                feedback = containerParent.querySelector('.invalid-feedback');
              }
            }
          }
        }
        
        if (feedback) {
          // Ensure the feedback div has text content
          if (!feedback.textContent || feedback.textContent.trim() === '') {
            feedback.textContent = errorMessage;
          }
          
          // Force display with !important to override Bootstrap's default display: none
          feedback.style.setProperty('display', 'block', 'important');
          feedback.style.setProperty('width', '100%', 'important');
          feedback.style.setProperty('margin-top', '0.25rem', 'important');
          feedback.style.setProperty('font-size', '0.875em', 'important');
          feedback.style.setProperty('color', '#dc3545', 'important');
          feedback.style.setProperty('opacity', '1', 'important');
          feedback.style.setProperty('visibility', 'visible', 'important');
          // Also add d-block class in case Bootstrap needs it
          feedback.classList.add('d-block');
          
          // Check parent visibility
          let parent = feedback.parentElement;
          while (parent && parent !== document.body) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
              console.warn('Parent element is hiding the feedback:', parent, parentStyle);
              parent.style.setProperty('display', 'block', 'important');
              parent.style.setProperty('visibility', 'visible', 'important');
              parent.style.setProperty('opacity', '1', 'important');
            }
            parent = parent.parentElement;
          }
          
          console.log('Showing invalid-feedback for:', hidden.id || hidden.name, feedback, 'textContent:', feedback.textContent);
          console.log('Feedback div position:', feedback.getBoundingClientRect());
        } else {
          console.warn('Could not find invalid-feedback div for:', hidden.id || hidden.name);
        }
        
        // Also add is-invalid class to parent container and form for Bootstrap styling
        const parent = hidden.parentElement;
        if (parent && parent.classList) {
          parent.classList.add('was-validated');
          // Also try adding to the checkbox group container
          const hiddenId = hidden.id || hidden.name;
          if (hiddenId) {
            const containerId = `${hiddenId}_group`;
            const container = document.getElementById(containerId);
            if (container && container.parentElement) {
              container.parentElement.classList.add('was-validated');
            }
          }
        }
        // Add was-validated to the form itself
        if (formRef.current) {
          formRef.current.classList.add('was-validated');
        }
        
        hasInvalidRequiredGroup = true;
        console.log('Found invalid required checkbox/radio group:', hidden.id || hidden.name);
      }
    });
    
    // Re-check required hidden inputs right before validation (in case they were updated)
    // This ensures radio/checkbox groups have their values set correctly
    const allRequiredHidden = formRef.current.querySelectorAll('input[type="hidden"][required]');
    allRequiredHidden.forEach(hidden => {
      const hiddenId = hidden.id || hidden.name;
      if (!hiddenId) return;
      
      // Check if this is a radio group
      const containerId = `${hiddenId}_group`;
      const container = formRef.current.querySelector(`#${containerId}`);
      if (container) {
        const radios = container.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
          // Radio group - check if any radio is selected
          const checked = container.querySelector('input[type="radio"]:checked');
          if (checked) {
            hidden.value = checked.value;
            hidden.setAttribute('value', checked.value);
            hidden.setCustomValidity('');
            hidden.classList.remove('is-invalid');
          }
        }
      }
    });
    
    if (!formRef.current.checkValidity() || hasInvalidRequiredGroup) {
      // Form is invalid - trigger browser validation UI
      formRef.current.reportValidity();
      // Also manually report validity on invalid hidden inputs
      requiredHiddenInputs.forEach(hidden => {
        if (!hidden.value || hidden.value.trim() === '') {
          hidden.reportValidity();
        }
      });
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
      
      // Fetch the form HTML fresh to ensure we have the correct form (formDef might be stale)
      // This ensures we always use the correct form HTML even if the user switched forms
      let formHtmlForSubmission = '';
      try {
        const currentFormData = await fetchForm(formId);
        formHtmlForSubmission = currentFormData?.html || '';
        console.log('Fetched form HTML for submission, formId:', formId, 'html length:', formHtmlForSubmission.length);
      } catch (err) {
        console.error('Error fetching form HTML for submission, using formDef:', err);
        // Fallback to formDef if fetch fails
        formHtmlForSubmission = formDef?.html || '';
      }
      
      // Generate submission HTML with filled values
      console.log('Generating submissionHtml from formId:', formId, 'html length:', formHtmlForSubmission.length);
      console.log('With values:', values);
      console.log('With metadata:', metadata);
      const submissionHtml = generateSubmissionHtml(formHtmlForSubmission, values, metadata);
      console.log('Generated submissionHtml length:', submissionHtml.length);
      
      const submission = {
        values,
        metadata,
        result,
        comments: commentsValue,
        submissionHtml: submissionHtml
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
          
          // Ensure form controls have both id and name attributes (set one from the other if needed)
          // If id is present without name, set name=id
          // If name is present without id, set id=name
          const formControls = fieldsRef.current.querySelectorAll('input, select, textarea');
          
          formControls.forEach((control) => {
            const id = control.id || control.getAttribute('id');
            const name = control.name || control.getAttribute('name');
            
            // If id is present but name is not, set name=id
            if (id && !name) {
              control.setAttribute('name', id);
              control.name = id;
            }
            
            // If name is present but id is not, set id=name
            if (name && !id) {
              control.setAttribute('id', name);
              control.id = name;
            }
          });
          
          // Inject class="form-control" to all form controls if not present
          // Also inject oninput="eval_form(this)" for all input and textarea controls if not present
          // Also inject onchange="eval_form(this)" for all form controls if not present
          formControls.forEach((control) => {
            // Skip file inputs and hidden inputs
            if (control.type === 'file' || control.type === 'hidden') {
              return;
            }
            
            // Check if form-control class is already present or if there are conflicting Bootstrap form classes
            // Skip if element has form-check-input, form-select, or other form-* classes that conflict
            const hasConflictingClass = control.classList.contains('form-check-input') ||
                                        control.classList.contains('form-select') ||
                                        Array.from(control.classList).some(cls => cls.startsWith('form-') && cls !== 'form-control');
            
            if (!control.classList.contains('form-control') && !hasConflictingClass) {
              // Add form-control class, preserving existing classes
              const existingClasses = control.className || '';
              control.className = existingClasses ? `${existingClasses} form-control` : 'form-control';
            }
            
            // Inject oninput="eval_form(this)" for input and textarea if handler is not already present
            if ((control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') && !control.hasAttribute('oninput')) {
              control.setAttribute('oninput', 'eval_form(this)');
            }
            
            // Inject onchange="eval_form(this)" for all form controls if handler is not already present
            if (!control.hasAttribute('onchange')) {
              control.setAttribute('onchange', 'eval_form(this)');
            }
          });
          
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
          
          // Initialize file upload handlers
          if (typeof window.initAutoFileUploads === 'function') {
            setTimeout(() => {
              try {
                window.initAutoFileUploads();
              } catch (err) {
                console.error('Error initializing file uploads:', err);
              }
            }, 100);
          }
          
          if (typeof window.initMultiFileUploads === 'function') {
            setTimeout(() => {
              try {
                window.initMultiFileUploads();
              } catch (err) {
                console.error('Error initializing multi-file uploads:', err);
              }
            }, 100);
          }
          
          // Initialize image preview handlers for file inputs with data-file-type="image"
          setTimeout(() => {
            try {
              if (fieldsRef.current) {
                const imageFileInputs = fieldsRef.current.querySelectorAll('input[type="file"][data-file-type="image"][data-file-target-element-id]');
                
                imageFileInputs.forEach(input => {
                  // Skip if already has an onchange handler
                  if (input.hasAttribute('onchange') && input.getAttribute('onchange').trim()) {
                    return;
                  }
                  
                  const targetId = input.getAttribute('data-file-target-element-id');
                  if (!targetId) return;
                  
                  // Attach the handler
                  input.addEventListener('change', function() {
                    const img = document.getElementById(targetId);
                    const file = this.files[0];
                    if (!file || !img) return;

                    const reader = new FileReader();
                    reader.onload = e => {
                      img.src = e.target.result;
                      img.style.display = 'block';
                      // Store base64 data in data attribute for database submission
                      this.setAttribute('data-file-data', e.target.result);
                    };
                    reader.readAsDataURL(file);
                  });
                });
              }
            } catch (err) {
              console.error('Error initializing image preview handlers:', err);
            }
          }, 100);
          
          // Initialize checkbox groups (checkboxes that sync to hidden inputs)
          setTimeout(() => {
            try {
              if (fieldsRef.current) {
                // Find all hidden inputs that might be targets for checkbox groups
                const hiddenInputs = fieldsRef.current.querySelectorAll('input[type="hidden"]');
                
                hiddenInputs.forEach(hidden => {
                  const hiddenId = hidden.id || hidden.name;
                  if (!hiddenId) return;
                  
                  // Strategy 1: Look for checkboxes with IDs starting with hiddenId + "_"
                  // e.g., hidden id="choice1" -> checkboxes id="choice1_one", "choice1_two", etc.
                  const checkboxesById = fieldsRef.current.querySelectorAll(`input[type="checkbox"][id^="${hiddenId}_"]`);
                  
                  // Strategy 2: Look for a container with id ending in "_group"
                  // e.g., hidden id="choice1" -> container id="choice1_group"
                  const containerId = `${hiddenId}_group`;
                  const container = document.getElementById(containerId);
                  const checkboxesInContainer = container ? container.querySelectorAll('input[type="checkbox"]') : [];
                  
                  // Use checkboxes found by ID prefix, or fall back to container checkboxes
                  const checkboxes = checkboxesById.length > 0 ? checkboxesById : checkboxesInContainer;
                  
                  // Skip if this is a radio group (handled separately)
                  if (container) {
                    const hasRadios = container.querySelectorAll('input[type="radio"]').length > 0;
                    if (hasRadios) {
                      return; // Skip - this will be handled by radio group initialization
                    }
                  }
                  
                  if (checkboxes.length > 0) {
                    // Check if the hidden input has required attribute
                    const isRequired = hidden.hasAttribute('required');
                    
                    console.log(`Initializing checkbox group: hiddenId=${hiddenId}, isRequired=${isRequired}, checkboxes found=${checkboxes.length}`);
                    
                    // Find the invalid-feedback div (should be a sibling or in the same container)
                    const findInvalidFeedback = () => {
                      // Look for invalid-feedback div near the hidden input
                      let feedback = hidden.nextElementSibling;
                      while (feedback) {
                        if (feedback.classList.contains('invalid-feedback')) {
                          return feedback;
                        }
                        feedback = feedback.nextElementSibling;
                      }
                      // Also check parent container
                      const parent = hidden.parentElement;
                      if (parent) {
                        return parent.querySelector('.invalid-feedback');
                      }
                      return null;
                    };
                    const invalidFeedback = findInvalidFeedback();
                    console.log(`Found invalid-feedback div for ${hiddenId}:`, invalidFeedback ? 'YES' : 'NO');
                    
                    // Bind the checkbox group to the hidden input
                    const update = () => {
                      const values = Array.from(checkboxes)
                        .filter(cb => cb.checked)
                        .map(cb => cb.value);
                      
                      console.log(`Checkbox group update: hiddenId=${hiddenId}, checked count=${values.length}, values=`, values);
                      
                      // If required and no checkboxes are selected, set empty string
                      // Otherwise, set JSON array
                      if (isRequired && values.length === 0) {
                        hidden.value = '';
                        hidden.setAttribute('value', '');
                        // Mark as invalid for HTML5 validation
                        hidden.setCustomValidity('Please select at least one option.');
                        // Add is-invalid class for Bootstrap styling
                        hidden.classList.add('is-invalid');
                        // Show invalid-feedback div
                        if (invalidFeedback) {
                          // Ensure the feedback div has text content
                          if (!invalidFeedback.textContent || invalidFeedback.textContent.trim() === '') {
                            invalidFeedback.textContent = 'Please select at least one option.';
                          }
                          
                          // Force display with !important to override Bootstrap's default display: none
                          invalidFeedback.style.setProperty('display', 'block', 'important');
                          invalidFeedback.style.setProperty('width', '100%', 'important');
                          invalidFeedback.style.setProperty('margin-top', '0.25rem', 'important');
                          invalidFeedback.style.setProperty('font-size', '0.875em', 'important');
                          invalidFeedback.style.setProperty('color', '#dc3545', 'important');
                          invalidFeedback.style.setProperty('opacity', '1', 'important');
                          invalidFeedback.style.setProperty('visibility', 'visible', 'important');
                          invalidFeedback.classList.add('d-block');
                        }
                        // Add was-validated class to parent for Bootstrap
                        const parent = hidden.parentElement;
                        if (parent && parent.classList) {
                          parent.classList.add('was-validated');
                        }
                        if (container && container.parentElement) {
                          container.parentElement.classList.add('was-validated');
                        }
                        console.log(`Set hidden input ${hiddenId} to empty and marked as invalid`);
                      } else {
                        hidden.value = JSON.stringify(values);
                        hidden.setAttribute('value', hidden.value);
                        // Clear any custom validity message
                        hidden.setCustomValidity('');
                        // Remove is-invalid class
                        hidden.classList.remove('is-invalid');
                        // Hide invalid-feedback div
                        if (invalidFeedback) {
                          invalidFeedback.style.display = 'none';
                        }
                        // Remove was-validated class from parent
                        const parent = hidden.parentElement;
                        if (parent && parent.classList) {
                          parent.classList.remove('was-validated');
                        }
                        if (container && container.parentElement) {
                          container.parentElement.classList.remove('was-validated');
                        }
                        console.log(`Set hidden input ${hiddenId} to:`, hidden.value);
                      }
                    };
                    
                    // Add change listeners to all checkboxes in the group
                    checkboxes.forEach(checkbox => {
                      checkbox.addEventListener('change', update);
                    });
                    
                    // Initial update - this will set validation state
                    update();
                  } else {
                    console.warn(`No checkboxes found for hidden input: ${hiddenId}`);
                  }
                });
              }
            } catch (err) {
              console.error('Error initializing checkbox groups:', err);
            }
          }, 100);
          
          // Initialize radio button groups (radios that sync to hidden inputs)
          setTimeout(() => {
            try {
              if (fieldsRef.current) {
                // Find all hidden inputs that might be targets for radio groups
                const hiddenInputs = fieldsRef.current.querySelectorAll('input[type="hidden"]');
                
                hiddenInputs.forEach(hidden => {
                  const hiddenId = hidden.id || hidden.name;
                  if (!hiddenId) return;
                  
                  // Look for a container with id ending in "_group" that contains radio buttons
                  const containerId = `${hiddenId}_group`;
                  const container = document.getElementById(containerId);
                  
                  if (container) {
                    // Find all radio buttons within this container
                    const radios = container.querySelectorAll('input[type="radio"]');
                    
                    if (radios.length > 0) {
                      // Check if the hidden input has required attribute
                      const isRequired = hidden.hasAttribute('required');
                      
                      console.log(`Initializing radio group: hiddenId=${hiddenId}, isRequired=${isRequired}, radios found=${radios.length}`);
                      
                      // Find the invalid-feedback div
                      const findInvalidFeedback = () => {
                        let feedback = hidden.nextElementSibling;
                        while (feedback) {
                          if (feedback.classList && feedback.classList.contains('invalid-feedback')) {
                            return feedback;
                          }
                          feedback = feedback.nextElementSibling;
                        }
                        const parent = hidden.parentElement;
                        if (parent) {
                          return parent.querySelector('.invalid-feedback');
                        }
                        return null;
                      };
                      const invalidFeedback = findInvalidFeedback();
                      console.log(`Found invalid-feedback div for radio group ${hiddenId}:`, invalidFeedback ? 'YES' : 'NO');
                      
                      // Bind the radio group to the hidden input
                      const update = () => {
                        const checked = container.querySelector('input[type="radio"]:checked');
                        const value = checked ? checked.value : '';
                        
                        console.log(`Radio group update: hiddenId=${hiddenId}, checked value=`, value);
                        
                        // If required and no radio is selected, set empty string
                        // Otherwise, set the selected value
                        if (isRequired && !value) {
                          hidden.value = '';
                          hidden.setAttribute('value', '');
                          // Mark as invalid for HTML5 validation
                          hidden.setCustomValidity('Please select an option.');
                          // Add is-invalid class for Bootstrap styling
                          hidden.classList.add('is-invalid');
                          // Show invalid-feedback div
                          if (invalidFeedback) {
                            if (!invalidFeedback.textContent || invalidFeedback.textContent.trim() === '') {
                              invalidFeedback.textContent = 'Please select an option.';
                            }
                            invalidFeedback.style.setProperty('display', 'block', 'important');
                            invalidFeedback.style.setProperty('width', '100%', 'important');
                            invalidFeedback.style.setProperty('margin-top', '0.25rem', 'important');
                            invalidFeedback.style.setProperty('font-size', '0.875em', 'important');
                            invalidFeedback.style.setProperty('color', '#dc3545', 'important');
                            invalidFeedback.style.setProperty('opacity', '1', 'important');
                            invalidFeedback.style.setProperty('visibility', 'visible', 'important');
                            invalidFeedback.classList.add('d-block');
                          }
                          // Add was-validated class to parent for Bootstrap
                          const parent = hidden.parentElement;
                          if (parent && parent.classList) {
                            parent.classList.add('was-validated');
                          }
                          if (container && container.parentElement) {
                            container.parentElement.classList.add('was-validated');
                          }
                        } else {
                          hidden.value = value;
                          hidden.setAttribute('value', value);
                          // Clear any custom validity message
                          hidden.setCustomValidity('');
                          // Remove is-invalid class
                          hidden.classList.remove('is-invalid');
                          // Hide invalid-feedback div
                          if (invalidFeedback) {
                            invalidFeedback.style.display = 'none';
                          }
                          // Remove was-validated class from parent
                          const parent = hidden.parentElement;
                          if (parent && parent.classList) {
                            parent.classList.remove('was-validated');
                          }
                          if (container && container.parentElement) {
                            container.parentElement.classList.remove('was-validated');
                          }
                        }
                      };
                      
                      // Add change listeners to all radio buttons in the group
                      radios.forEach(radio => {
                        radio.addEventListener('change', update);
                      });
                      
                      // Initial update - this will set validation state
                      update();
                    }
                  }
                });
              }
            } catch (err) {
              console.error('Error initializing radio groups:', err);
            }
          }, 100);
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
