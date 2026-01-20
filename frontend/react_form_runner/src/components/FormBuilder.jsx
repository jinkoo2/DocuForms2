import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import EditorSidebar from './EditorSidebar';
import EditorMain from './EditorMain';
import SaveBar from './SaveBar';
import { fetchForm, BACKEND_URL } from '../utils/api';
import { extractFields, extractRules } from '../utils/formBuilderUtils';

function FormBuilder() {
  const [searchParams] = useSearchParams();
  const [formId, setFormId] = useState(searchParams.get('formId') || '');
  const [formName, setFormName] = useState('');
  const [html, setHtml] = useState('');
  const [formType, setFormType] = useState('form');
  const [parentId, setParentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const autoSaveTimeoutRef = useRef(null);

  const autoSave = React.useCallback(async () => {
    if (!formId || !html.trim()) return;
    
    try {
      let htmlToSave = html;
      if (!htmlToSave.includes('<body')) {
        htmlToSave = `<body>${htmlToSave}</body>`;
      }
      
      const fields = extractFields(htmlToSave);
      const rules = extractRules(htmlToSave);
      
      const payload = {
        id: formId,
        name: formName || 'Untitled Form',
        html: htmlToSave,
        fields: fields,
        rules: rules,
        version: 1,
        type: formType || 'form',
        parentId: parentId || ''
      };

      await fetch(`${BACKEND_URL}/api/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      console.log('Form auto-saved');
    } catch (err) {
      console.error('Auto-save error:', err);
    }
  }, [formId, html, formName, formType, parentId]);

  useEffect(() => {
    const urlFormId = searchParams.get('formId');
    if (urlFormId && urlFormId !== formId) {
      loadForm(urlFormId);
    } else if (!urlFormId && formId) {
      // Clear form if no formId in URL
      setFormId('');
      setFormName('');
      setHtml('');
      setFormType('form');
      setParentId('');
    }
  }, [searchParams]);

  const loadForm = async (id) => {
    try {
      setLoading(true);
      const formData = await fetchForm(id);
      setFormId(id);
      setFormName(formData.name || '');
      setFormType(formData.type || 'form');
      setParentId(formData.parentId || '');
      
      // Extract body content if HTML includes body tag
      let htmlContent = formData.html || '';
      if (htmlContent.includes('<body')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        htmlContent = doc.body.innerHTML;
      }
      setHtml(htmlContent);
    } catch (err) {
      console.error('Error loading form:', err);
      alert(`Failed to load form: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSelect = (selectedFormId) => {
    if (selectedFormId) {
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('formId', selectedFormId);
      window.history.pushState({ formId: selectedFormId }, '', newUrl);
      loadForm(selectedFormId);
    }
  };

  const handleNewForm = async (newFormId, newFormName, newParentId = '') => {
    try {
      // Create the form in the database immediately with empty HTML
      const payload = {
        id: newFormId,
        name: newFormName,
        html: '<body></body>',
        fields: [],
        rules: [],
        version: 1,
        type: 'form',
        parentId: newParentId || ''
      };

      const res = await fetch(`${BACKEND_URL}/api/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Failed to create form: ${res.statusText}`);
      }

      // Set local state and update URL
      setFormId(newFormId);
      setFormName(newFormName);
      setFormType('form');
      setParentId(newParentId || '');
      setHtml('');
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('formId', newFormId);
      window.history.pushState({ formId: newFormId }, '', newUrl);
      
      return true; // Return success
    } catch (err) {
      alert(`Failed to create form: ${err.message}`);
      console.error('Error creating form:', err);
      throw err; // Re-throw so caller knows it failed
    }
  };

  const handleInsertElement = (elementType) => {
    let elementHtml = '';
    
    switch (elementType) {
      case 'text-input':
        elementHtml = '<div class="mb-3"><label>Field Label</label><input type="text" name="field_name" id="field_name" class="form-control" /></div>';
        break;
      case 'number-input':
        elementHtml = '<div class="mb-3"><label>Field Label</label><input type="number" name="field_name" id="field_name" class="form-control" /></div>';
        break;
      case 'pass-fail':
        elementHtml = '<div class="mb-3">Result: <span data-rule-left="" data-rule-op="<" data-rule-type="constant" data-rule-value="">—</span></div>';
        break;
      default:
        return;
    }
    
    setHtml(prev => prev + '\n' + elementHtml);
  };

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Only auto-save if enabled and we have formId and html
    if (autoSaveEnabled && formId && html.trim()) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSave();
      }, 2000); // Auto-save after 2 seconds of inactivity
    }
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [html, formName, formId, autoSave, autoSaveEnabled]);

  const handleSave = async () => {
    if (!formId) {
      alert('Please enter a Form ID before saving.');
      return;
    }

    try {
      let htmlToSave = html;
      
      // Wrap in body tag for consistency
      if (!htmlToSave.includes('<body')) {
        htmlToSave = `<body>${htmlToSave}</body>`;
      }
      
      // Extract fields and rules
      const fields = extractFields(htmlToSave);
      const rules = extractRules(htmlToSave);
      
      const payload = {
        id: formId,
        name: formName || 'Untitled Form',
        html: htmlToSave,
        fields: fields,
        rules: rules,
        version: 1,
        type: formType || 'form',
        parentId: parentId || ''
      };

      const res = await fetch(`${BACKEND_URL}/api/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Failed to save: ${res.statusText}`);
      }

      const data = await res.json();
      alert('Form saved successfully!');
      console.log('Form saved:', data);
    } catch (err) {
      alert(`Failed to save form: ${err.message}`);
      console.error('Error saving form:', err);
    }
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid">
          <a className="navbar-brand" href="#">DocuForms Builder</a>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto align-items-center">
              <li className="nav-item d-flex align-items-center">
                <label className="form-check-label text-light me-2" htmlFor="auto-save-toggle" style={{ cursor: 'pointer' }}>
                  Auto Save
                </label>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="auto-save-toggle"
                    checked={autoSaveEnabled}
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  />
                </div>
              </li>
              <li className="nav-item ms-2">
                <a className="btn btn-outline-light btn-sm" href="/">Form Runner</a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <div className="container-fluid h-100 d-flex flex-column" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="row flex-grow-1 overflow-hidden">
          <EditorSidebar
            selectedFormId={formId}
            onFormSelect={handleFormSelect}
            onNewForm={handleNewForm}
            onInsertElement={handleInsertElement}
          />
          <EditorMain
            html={html}
            onHtmlChange={setHtml}
            loading={loading}
          />
        </div>
        <SaveBar
          formId={formId}
          formName={formName}
          onFormIdChange={setFormId}
          onFormNameChange={setFormName}
          onSave={handleSave}
        />
      </div>
    </>
  );
}

export default FormBuilder;
