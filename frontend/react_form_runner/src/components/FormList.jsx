import React, { useState, useEffect } from 'react';
import { fetchForms } from '../utils/api';

function FormList({ selectedFormId, onFormSelect }) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadForms = async () => {
    try {
      setLoading(true);
      const formsData = await fetchForms();
      setForms(formsData);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error loading forms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  if (loading) {
    return (
      <>
        <div className="form-list-header">
          <h3>Forms</h3>
          <button onClick={loadForms} title="Refresh list">🔄</button>
        </div>
        <div className="form-list">
          <div className="form-list-loading">Loading forms...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="form-list-header">
        <h3>Forms</h3>
        <button onClick={loadForms} title="Refresh list">🔄</button>
      </div>
      <div className="form-list">
        {error ? (
          <div className="form-list-loading" style={{ color: 'red' }}>Error: {error}</div>
        ) : forms.length === 0 ? (
          <div className="form-list-empty">No forms found.</div>
        ) : (
          forms.map((form) => (
            <div
              key={form.id}
              className={`form-list-item ${selectedFormId === form.id ? 'active' : ''}`}
              onClick={() => onFormSelect(form.id)}
            >
              <div className="form-list-item-name">{form.name || 'Untitled Form'}</div>
              <div className="form-list-item-id">{form.id}</div>
              {form.createdAt && (
                <div className="form-list-item-date">
                  {new Date(form.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}

export default FormList;
