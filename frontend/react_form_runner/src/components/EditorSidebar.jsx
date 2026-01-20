import React, { useState, useEffect, useRef } from 'react';
import { fetchForms, fetchForm, BACKEND_URL } from '../utils/api';
import TreeView from './TreeView';

function EditorSidebar({ selectedFormId, onFormSelect, onNewForm, onInsertElement }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewFormModal, setShowNewFormModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [newFormId, setNewFormId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderId, setNewFolderId] = useState('');
  const [parentId, setParentId] = useState(''); // For creating in a folder
  const [editingItem, setEditingItem] = useState(null); // {id, name, type, parentId}
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef(null);

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

  const handleEdit = (item) => {
    setEditingItem(item);
    setEditName(item.name || item.id);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      alert('Please enter a name');
      return;
    }

    if (!editingItem) {
      return;
    }

    try {
      // Fetch current form data to preserve all fields
      const res = await fetch(`${BACKEND_URL}/api/forms/${editingItem.id}`);
      if (!res.ok) {
        throw new Error('Failed to fetch form data');
      }
      const currentData = await res.json();

      // Update only the name, preserve all other fields
      // Use fetched data for parentId and type to ensure we have the latest values
      const payload = {
        id: editingItem.id,
        name: editName.trim(),
        html: currentData.html || '',
        fields: currentData.fields || [],
        rules: currentData.rules || [],
        version: currentData.version || 1,
        type: currentData.type || editingItem.type || 'form',
        parentId: currentData.parentId || editingItem.parentId || ''
      };

      const updateRes = await fetch(`${BACKEND_URL}/api/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!updateRes.ok) {
        const errorText = await updateRes.text();
        throw new Error(errorText || `Failed to update: ${updateRes.statusText}`);
      }

      // Close modal and refresh
      setShowEditModal(false);
      setEditingItem(null);
      setEditName('');
      
      // Refresh the form list
      setTimeout(() => {
        loadForms();
      }, 100);
    } catch (err) {
      alert(`Failed to update: ${err.message}`);
      console.error('Error updating item:', err);
    }
  };

  const handleExportForms = async () => {
    try {
      setLoading(true);
      
      // Fetch list of all forms and folders
      const itemsList = await fetchForms();
      
      // Fetch full details for each item
      const formsData = [];
      for (const item of itemsList) {
        try {
          const fullData = await fetchForm(item.id);
          // Remove MongoDB-specific fields and ensure we have all needed fields
          const exportData = {
            id: fullData.id,
            name: fullData.name || '',
            html: fullData.html || '',
            fields: fullData.fields || [],
            rules: fullData.rules || [],
            version: fullData.version || 1,
            type: fullData.type || 'form',
            parentId: fullData.parentId || ''
          };
          formsData.push(exportData);
        } catch (err) {
          console.error(`Error fetching form ${item.id}:`, err);
          // Continue with other forms even if one fails
        }
      }
      
      // Create JSON structure
      const exportJson = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        forms: formsData
      };
      
      // Download as JSON file
      const jsonStr = JSON.stringify(exportJson, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'forms.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert(`Exported ${formsData.length} forms and folders successfully!`);
    } catch (err) {
      alert(`Failed to export forms: ${err.message}`);
      console.error('Error exporting forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportForms = () => {
    // Trigger file input click
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      setLoading(true);
      
      // Read file content
      const text = await file.text();
      const importData = JSON.parse(text);
      
      // Validate structure
      if (!importData.forms || !Array.isArray(importData.forms)) {
        throw new Error('Invalid file format: missing "forms" array');
      }
      
      const formsToImport = importData.forms;
      if (formsToImport.length === 0) {
        alert('No forms found in the file.');
        setLoading(false);
        return;
      }
      
      // Sort: folders first, then forms, ensuring parents are created before children
      // Use topological sort: create root items first, then items whose parents exist
      const sortedForms = [];
      const remaining = [...formsToImport];
      const created = new Set();
      
      // Helper to check if parent exists (for root items, parentId is empty)
      const canCreate = (item) => {
        if (!item.parentId || item.parentId === '') {
          return true; // Root level items can always be created
        }
        return created.has(item.parentId);
      };
      
      // First pass: sort by type (folders before forms)
      const folders = remaining.filter(f => f.type === 'folder');
      const forms = remaining.filter(f => f.type !== 'folder');
      
      // Create folders in topological order
      let changed = true;
      while (folders.length > 0 && changed) {
        changed = false;
        for (let i = folders.length - 1; i >= 0; i--) {
          if (canCreate(folders[i])) {
            sortedForms.push(folders[i]);
            created.add(folders[i].id);
            folders.splice(i, 1);
            changed = true;
          }
        }
      }
      
      // Add any remaining folders (orphaned) at the end
      sortedForms.push(...folders);
      
      // Create forms in topological order
      changed = true;
      while (forms.length > 0 && changed) {
        changed = false;
        for (let i = forms.length - 1; i >= 0; i--) {
          if (canCreate(forms[i])) {
            sortedForms.push(forms[i]);
            created.add(forms[i].id);
            forms.splice(i, 1);
            changed = true;
          }
        }
      }
      
      // Add any remaining forms (orphaned) at the end
      sortedForms.push(...forms);
      
      // Import each form/folder
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      
      for (const formData of sortedForms) {
        try {
          // Validate required fields
          if (!formData.id || !formData.name) {
            throw new Error(`Missing required fields: id or name`);
          }
          
          // Prepare payload
          const payload = {
            id: formData.id.trim(),
            name: formData.name.trim(),
            html: formData.html || '',
            fields: formData.fields || [],
            rules: formData.rules || [],
            version: formData.version || 1,
            type: formData.type || 'form',
            parentId: formData.parentId || ''
          };
          
          // Create/update form
          const res = await fetch(`${BACKEND_URL}/api/forms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText || `Failed to import ${formData.id}`);
          }
          
          successCount++;
        } catch (err) {
          errorCount++;
          errors.push(`${formData.id}: ${err.message}`);
          console.error(`Error importing ${formData.id}:`, err);
        }
      }
      
      // Refresh form list
      await loadForms();
      
      // Show results
      if (errorCount === 0) {
        alert(`Successfully imported ${successCount} forms and folders!`);
      } else {
        alert(
          `Import completed with errors:\n` +
          `✓ Successfully imported: ${successCount}\n` +
          `✗ Failed: ${errorCount}\n\n` +
          `Errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`
        );
      }
    } catch (err) {
      alert(`Failed to import forms: ${err.message}`);
      console.error('Error importing forms:', err);
    } finally {
      setLoading(false);
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
                className="btn btn-sm btn-success"
                onClick={handleExportForms}
                title="Export Forms"
                disabled={loading}
              >
                ⬇️
              </button>
              <button
                className="btn btn-sm btn-info"
                onClick={handleImportForms}
                title="Import Forms"
                disabled={loading}
              >
                ⬆️
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
              onEdit={handleEdit}
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

      {/* Edit Modal */}
      {showEditModal && editingItem && (
        <>
          <div className="modal fade show" style={{ display: 'block', zIndex: 1050 }} tabIndex="-1" role="dialog">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Edit {editingItem.type === 'folder' ? 'Folder' : 'Form'}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingItem(null);
                      setEditName('');
                    }}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label htmlFor="edit-item-id" className="form-label">{editingItem.type === 'folder' ? 'Folder' : 'Form'} ID</label>
                    <input
                      type="text"
                      className="form-control font-monospace"
                      id="edit-item-id"
                      value={editingItem.id}
                      disabled
                      readOnly
                    />
                    <div className="form-text">ID cannot be changed.</div>
                  </div>
                  <div className="mb-3">
                    <label htmlFor="edit-item-name" className="form-label">{editingItem.type === 'folder' ? 'Folder' : 'Form'} Name</label>
                    <input
                      type="text"
                      className="form-control"
                      id="edit-item-name"
                      placeholder={`Enter ${editingItem.type === 'folder' ? 'folder' : 'form'} name`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingItem(null);
                      setEditName('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveEdit}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} onClick={() => {
            setShowEditModal(false);
            setEditingItem(null);
            setEditName('');
          }}></div>
        </>
      )}

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".json,application/json"
        onChange={handleFileChange}
      />
    </>
  );
}

export default EditorSidebar;
