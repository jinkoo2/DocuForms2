import React, { useState, useMemo } from 'react';

function TreeNode({ node, level, selectedId, onSelect, onDelete, onNewFolder, onNewForm, onMove, readOnly = false }) {
  const [expanded, setExpanded] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const isSelected = selectedId === node.id;
  const isFolder = node.type === 'folder';
  const indent = level * 20;

  const handleToggle = (e) => {
    e.stopPropagation();
    if (isFolder) {
      setExpanded(!expanded);
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (!isFolder) {
      onSelect(node.id);
    } else {
      setExpanded(!expanded);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(node.id, node.name || node.id);
  };

  const handleNewFolder = (e) => {
    e.stopPropagation();
    onNewFolder(node.id);
  };

  const handleNewForm = (e) => {
    e.stopPropagation();
    onNewForm(node.id);
  };

  const handleDragStart = (e) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: node.id, type: node.type }));
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setIsDraggingOver(false);
  };

  const handleDragOver = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (isFolder) {
      e.dataTransfer.dropEffect = 'move';
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    
    try {
      const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (draggedData.id !== node.id && isFolder) {
        onMove(draggedData.id, node.id);
      }
    } catch (err) {
      console.error('Error parsing drag data:', err);
    }
  };

  return (
    <div>
      <div
        className={`tree-node ${isSelected ? 'active' : ''}`}
        draggable={!readOnly} // Allow dragging only if not read-only
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          padding: '4px 8px',
          paddingLeft: `${indent + 8}px`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          backgroundColor: isSelected ? '#e7f3ff' : (isDraggingOver && isFolder ? '#d4edda' : 'transparent'),
          borderRadius: '4px',
          marginBottom: '2px',
          border: isDraggingOver && isFolder ? '2px dashed #28a745' : '2px solid transparent'
        }}
        onClick={handleClick}
      >
        {isFolder ? (
          <span onClick={handleToggle} style={{ userSelect: 'none', minWidth: '16px' }}>
            {expanded ? '📂' : '📁'}
          </span>
        ) : (
          <span style={{ minWidth: '16px' }}>📄</span>
        )}
        <span
          style={{ flex: 1, fontSize: '14px' }}
          title={node.id}
        >
          {node.name || node.id}
        </span>
        {!readOnly && isFolder && (
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              className="btn btn-sm"
              style={{ padding: '2px 4px', fontSize: '10px' }}
              onClick={handleNewFolder}
              title="New folder"
            >
              📁
            </button>
            <button
              className="btn btn-sm"
              style={{ padding: '2px 4px', fontSize: '10px' }}
              onClick={handleNewForm}
              title="New form"
            >
              📄
            </button>
          </div>
        )}
        {!readOnly && (
          <button
            className="btn btn-sm btn-danger"
            style={{ padding: '2px 4px', fontSize: '10px' }}
            onClick={handleDelete}
            title={`Delete ${isFolder ? 'folder' : 'form'}`}
          >
            🗑️
          </button>
        )}
      </div>
      {isFolder && expanded && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
              onNewFolder={onNewFolder}
              onNewForm={onNewForm}
              onMove={onMove}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeView({ items, selectedId, onSelect, onDelete, onNewFolder, onNewForm, onMove, readOnly = false }) {
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false);

  // Build tree structure from flat list
  const tree = useMemo(() => {
    const itemMap = new Map();
    const rootItems = [];

    // First pass: create map of all items
    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Second pass: build tree structure
    items.forEach(item => {
      const node = itemMap.get(item.id);
      const parentId = item.parentId || '';
      
      if (parentId && itemMap.has(parentId)) {
        // Add to parent's children
        itemMap.get(parentId).children.push(node);
      } else {
        // Root level item
        rootItems.push(node);
      }
    });

    // Sort: folders first, then by name
    const sortItems = (items) => {
      return items.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return (a.name || a.id).localeCompare(b.name || b.id);
      });
    };

    const sortTree = (nodes) => {
      sortItems(nodes);
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortTree(node.children);
        }
      });
    };

    sortTree(rootItems);
    return rootItems;
  }, [items]);

  const handleRootDragOver = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setIsDraggingOverRoot(true);
  };

  const handleRootDragLeave = (e) => {
    e.stopPropagation();
    setIsDraggingOverRoot(false);
  };

  const handleRootDrop = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverRoot(false);
    
    try {
      const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
      onMove(draggedData.id, ''); // Move to root (empty parentId)
    } catch (err) {
      console.error('Error parsing drag data:', err);
    }
  };

  return (
    <div
      style={{
        padding: '4px',
        minHeight: '100px',
        backgroundColor: isDraggingOverRoot ? '#d4edda' : 'transparent',
        border: isDraggingOverRoot ? '2px dashed #28a745' : '2px solid transparent',
        borderRadius: '4px'
      }}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
      onDrop={handleRootDrop}
    >
      {tree.length === 0 ? (
        <div className="text-muted text-center" style={{ padding: '20px' }}>
          {isDraggingOverRoot ? 'Drop here to move to root' : 'No forms or folders'}
        </div>
      ) : (
        tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
            onNewFolder={onNewFolder}
            onNewForm={onNewForm}
            onMove={onMove}
            readOnly={readOnly}
          />
        ))
      )}
    </div>
  );
}

export default TreeView;
