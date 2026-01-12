import React, { useEffect, useRef } from 'react';

function SaveBar({ formId, formName, onFormIdChange, onFormNameChange, onSave }) {
  const formIdInputRef = useRef(null);

  useEffect(() => {
    if (formIdInputRef.current) {
      if (formId) {
        formIdInputRef.current.readOnly = true;
        formIdInputRef.current.classList.add('bg-light');
      } else {
        formIdInputRef.current.readOnly = false;
        formIdInputRef.current.classList.remove('bg-light');
      }
    }
  }, [formId]);

  return (
    <div className="border-top bg-light p-3">
      <div className="row align-items-center">
        <div className="col-md-8">
          <div className="row g-2">
            <div className="col-auto">
              <label htmlFor="form-name" className="col-form-label">Form Name:</label>
            </div>
            <div className="col-auto">
              <input
                type="text"
                className="form-control form-control-sm"
                id="form-name"
                placeholder="Enter form name"
                value={formName}
                onChange={(e) => onFormNameChange(e.target.value)}
              />
            </div>
            <div className="col-auto">
              <label htmlFor="form-id-input" className="col-form-label">Form ID:</label>
            </div>
            <div className="col-auto">
              <input
                ref={formIdInputRef}
                type="text"
                className="form-control form-control-sm font-monospace"
                id="form-id-input"
                placeholder="e.g., daily_check"
                value={formId}
                onChange={(e) => onFormIdChange(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="col-md-4 text-end">
          <button
            className="btn btn-primary btn-sm"
            onClick={onSave}
            disabled={!formId}
          >
            💾 Save Form
          </button>
        </div>
      </div>
    </div>
  );
}

export default SaveBar;
