import React, { useState, useEffect } from 'react';
import { fetchForms } from '../utils/api';
import TreeView from './TreeView';

function FormList({ selectedFormId, onFormSelect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadForms = async () => {
    try {
      setLoading(true);
      const itemsData = await fetchForms();
      setItems(itemsData);
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

  // Dummy handlers for read-only mode (not used but required by TreeView)
  const handleDelete = () => {};
  const handleNewFolder = () => {};
  const handleNewForm = () => {};
  const handleMove = () => {};

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
      <div className="form-list" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        {error ? (
          <div className="form-list-loading" style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
        ) : (
          <TreeView
            items={items}
            selectedId={selectedFormId}
            onSelect={onFormSelect}
            onDelete={handleDelete}
            onNewFolder={handleNewFolder}
            onNewForm={handleNewForm}
            onMove={handleMove}
            readOnly={true}
          />
        )}
      </div>
    </>
  );
}

export default FormList;
