import React, { useState, useEffect } from 'react';
import { fetchForms, BACKEND_URL } from '../utils/api';

function EditorSidebar({ selectedFormId, onFormSelect, onNewForm, onInsertElement }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewFormModal, setShowNewFormModal] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormId, setNewFormId] = useState('');

  const loadForms = async () => {
    try {
      setLoading(true);
      const formsData = await fetchForms();
      setForms(formsData);
    } catch (err) {
      console.error('Error loading forms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const handleCreateForm = async () => {
    if (!newFormId.trim()) {
      alert('Please enter a Form ID');
      return;
    }

    if (!newFormName.trim()) {
      alert('Please enter a Form Name');
      return;
    }

    try {
      // Call onNewForm which will create the form
      await onNewForm(newFormId.trim(), newFormName.trim());
      
      // Close modal and clear inputs
      setShowNewFormModal(false);
      setNewFormName('');
      setNewFormId('');
      
      // Refresh the form list after a short delay to ensure the form is created
      setTimeout(() => {
        loadForms();
      }, 100);
    } catch (err) {
      console.error('Error creating form:', err);
      // Don't close modal if creation failed
    }
  };

  const handleDeleteForm = async (formId, formName) => {
    if (!confirm(`Are you sure you want to delete "${formName}" (${formId})?\n\nThis will also delete all submissions for this form.`)) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/forms/${formId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        loadForms();
        if (selectedFormId === formId) {
          onFormSelect(null);
        }
      } else {
        const error = await res.text();
        alert(`Error deleting form: ${error}`);
      }
    } catch (err) {
      alert(`Error deleting form: ${err.message}`);
    }
  };

  return (
    <>
      <div className="col-md-3 col-lg-2 bg-light border-end d-flex flex-column p-0">
        <div className="p-3 border-bottom bg-white">
          <div className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Forms</h5>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => setShowNewFormModal(true)}
                title="New Form"
              >
                🆕
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={loadForms}
                title="Refresh list"
              >
                🔄
              </button>
            </div>
          </div>
        </div>
        <div className="flex-grow-1 overflow-auto p-2" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="text-muted text-center">Loading forms...</div>
          ) : forms.length === 0 ? (
            <div className="text-muted text-center">No forms yet</div>
          ) : (
            forms.map((form) => (
              <div
                key={form.id}
                className={`form-list-item ${selectedFormId === form.id ? 'active' : ''}`}
                style={{ marginBottom: '8px', padding: '8px', cursor: 'pointer' }}
              >
                <div
                  onClick={() => onFormSelect(form.id)}
                  style={{ flex: 1 }}
                >
                  <div className="fw-bold">{form.name || form.id}</div>
                  <div className="small text-muted font-monospace">{form.id}</div>
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteForm(form.id, form.name || form.id);
                  }}
                  title="Delete form"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-top bg-white">
          <h6 className="mb-2">Form Elements</h6>
          <div className="d-grid gap-2">
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => onInsertElement('text-input')}
            >
              📝 Text Input
            </button>
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => onInsertElement('number-input')}
            >
              🔢 Number Input
            </button>
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => onInsertElement('pass-fail')}
            >
              ✅ Pass/Fail
            </button>
          </div>
        </div>
      </div>

      {/* New Form Modal */}
      {showNewFormModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', zIndex: 1050 }} tabIndex="-1" role="dialog">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Create New Form</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowNewFormModal(false)}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label htmlFor="new-form-name" className="form-label">Form Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="new-form-name"
                      placeholder="Enter form name"
                      value={newFormName}
                      onChange={(e) => setNewFormName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="new-form-id" className="form-label">Form ID</label>
                    <input
                      type="text"
                      className="form-control font-monospace"
                      id="new-form-id"
                      placeholder="e.g., daily_check"
                      value={newFormId}
                      onChange={(e) => setNewFormId(e.target.value)}
                      required
                    />
                    <div className="form-text">Form ID cannot be changed after creation.</div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowNewFormModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCreateForm}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} onClick={() => setShowNewFormModal(false)}></div>
        </>
      )}
    </>
  );
}

export default EditorSidebar;
