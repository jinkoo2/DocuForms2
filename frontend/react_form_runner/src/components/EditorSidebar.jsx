import React, { useState, useEffect } from 'react';
import { fetchForms, BACKEND_URL } from '../utils/api';
import TreeView from './TreeView';

function EditorSidebar({ selectedFormId, onFormSelect, onNewForm, onInsertElement }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewFormModal, setShowNewFormModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormId, setNewFormId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderId, setNewFolderId] = useState('');
  const [parentId, setParentId] = useState(''); // For creating in a folder

  const loadForms = async () => {
    try {
      setLoading(true);
      const itemsData = await fetchForms();
      setItems(itemsData);
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
      await onNewForm(newFormId.trim(), newFormName.trim(), parentId);
      
      // Close modal and clear inputs
      setShowNewFormModal(false);
      setNewFormName('');
      setNewFormId('');
      setParentId('');
      
      // Refresh the form list after a short delay to ensure the form is created
      setTimeout(() => {
        loadForms();
      }, 100);
    } catch (err) {
      console.error('Error creating form:', err);
      // Don't close modal if creation failed
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderId.trim()) {
      alert('Please enter a Folder ID');
      return;
    }

    if (!newFolderName.trim()) {
      alert('Please enter a Folder Name');
      return;
    }

    try {
      const payload = {
        id: newFolderId.trim(),
        name: newFolderName.trim(),
        html: '',
        fields: [],
        rules: [],
        version: 1,
        type: 'folder',
        parentId: parentId || ''
      };

      const res = await fetch(`${BACKEND_URL}/api/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Failed to create folder: ${res.statusText}`);
      }

      // Close modal and clear inputs
      setShowNewFolderModal(false);
      setNewFolderName('');
      setNewFolderId('');
      setParentId('');
      
      // Refresh the form list
      setTimeout(() => {
        loadForms();
      }, 100);
    } catch (err) {
      alert(`Failed to create folder: ${err.message}`);
      console.error('Error creating folder:', err);
    }
  };

  const handleNewFolderClick = (folderParentId) => {
    setParentId(folderParentId || '');
    setShowNewFolderModal(true);
  };

  const handleNewFormInFolder = (folderParentId) => {
    setParentId(folderParentId || '');
    setShowNewFormModal(true);
  };

  const handleMove = async (itemId, newParentId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/forms/${itemId}/move?new_parent_id=${encodeURIComponent(newParentId || '')}`, {
        method: 'PATCH'
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Failed to move: ${res.statusText}`);
      }

      // Refresh the form list
      loadForms();
    } catch (err) {
      alert(`Failed to move: ${err.message}`);
      console.error('Error moving item:', err);
    }
  };

  const handleDelete = async (itemId, itemName) => {
    const item = items.find(i => i.id === itemId);
    const isFolder = item?.type === 'folder';
    const message = isFolder
      ? `Are you sure you want to delete folder "${itemName}" (${itemId})?\n\nThis will also delete all forms and subfolders inside it.`
      : `Are you sure you want to delete form "${itemName}" (${itemId})?\n\nThis will also delete all submissions for this form.`;
    
    if (!confirm(message)) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/forms/${itemId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        loadForms();
        if (selectedFormId === itemId) {
          onFormSelect(null);
        }
      } else {
        const error = await res.text();
        alert(`Error deleting: ${error}`);
      }
    } catch (err) {
      alert(`Error deleting: ${err.message}`);
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
                onClick={() => {
                  setParentId('');
                  setShowNewFormModal(true);
                }}
                title="New Form"
              >
                📄
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setParentId('');
                  setShowNewFolderModal(true);
                }}
                title="New Folder"
              >
                📁
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
        <div className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
          {loading ? (
            <div className="text-muted text-center p-3">Loading forms...</div>
          ) : (
            <TreeView
              items={items}
              selectedId={selectedFormId}
              onSelect={onFormSelect}
              onDelete={handleDelete}
              onNewFolder={handleNewFolderClick}
              onNewForm={handleNewFormInFolder}
              onMove={handleMove}
            />
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
                    onClick={() => {
                      setShowNewFormModal(false);
                      setParentId('');
                    }}
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
                    onClick={() => {
                      setShowNewFormModal(false);
                      setParentId('');
                    }}
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
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} onClick={() => {
            setShowNewFormModal(false);
            setParentId('');
          }}></div>
        </>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <>
          <div className="modal fade show" style={{ display: 'block', zIndex: 1050 }} tabIndex="-1" role="dialog">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Create New Folder</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowNewFolderModal(false);
                      setParentId('');
                    }}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label htmlFor="new-folder-name" className="form-label">Folder Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="new-folder-name"
                      placeholder="Enter folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="new-folder-id" className="form-label">Folder ID</label>
                    <input
                      type="text"
                      className="form-control font-monospace"
                      id="new-folder-id"
                      placeholder="e.g., my_folder"
                      value={newFolderId}
                      onChange={(e) => setNewFolderId(e.target.value)}
                      required
                    />
                    <div className="form-text">Folder ID cannot be changed after creation.</div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowNewFolderModal(false);
                      setParentId('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCreateFolder}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} onClick={() => {
            setShowNewFolderModal(false);
            setParentId('');
          }}></div>
        </>
      )}
    </>
  );
}

export default EditorSidebar;
