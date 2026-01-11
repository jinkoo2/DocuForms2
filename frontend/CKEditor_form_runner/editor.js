const API_BASE = "http://localhost:8001/api/forms";

// Get form ID from URL parameter (no default)
const urlParams = new URLSearchParams(window.location.search);
let FORM_ID = urlParams.get('formId') || '';

// Editor removed - using source editor + preview iframe instead

// Function to get current form ID (from input or variable)
function getFormId() {
  const formIdInput = document.getElementById('form-id-input');
  if (formIdInput && formIdInput.value.trim()) {
    return formIdInput.value.trim();
  }
  return FORM_ID;
}

// Update form ID input when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEditor);
} else {
  initializeEditor();
}

async function initializeEditor() {
  const formIdInput = document.getElementById('form-id-input');
  if (formIdInput) {
    // Only set value if FORM_ID exists (from URL parameter)
    if (FORM_ID) {
      formIdInput.value = FORM_ID;
    } else {
      formIdInput.value = '';
    }
  }

  // Initialize preview frame and source sync
  setupPreview();
  setupSourceSync();
  
  // Load form list
  loadFormList();
  
  // Only load form if formId is provided in URL
  if (FORM_ID) {
    loadForm(FORM_ID);
  } else {
    // Start with blank form
    updateSourceEditor('');
    updatePreview('');
    const nameInput = document.getElementById('form-name');
    if (nameInput) {
      nameInput.value = '';
    }
  }
}

/* -----------------------------
   Preview Frame Setup
----------------------------- */
function setupPreview() {
  const previewFrame = document.getElementById('preview-frame');
  if (!previewFrame) return;
  
  // Initial empty preview
  updatePreview('');
  
  // Refresh button
  const refreshBtn = document.getElementById('refresh-preview');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const sourceEditor = document.getElementById('source-editor');
      if (sourceEditor) {
        updatePreview(sourceEditor.value);
      }
    });
  }
}

function updatePreview(html) {
  const previewFrame = document.getElementById('preview-frame');
  if (!previewFrame) return;
  
  // Create a complete HTML document for the preview with Bootstrap
  const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          padding: 20px;
          margin: 0;
        }
        .field {
          margin-bottom: 1rem;
        }
        .field label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }
        /* Ensure form elements use Bootstrap styling */
        .field input, .field select, .field textarea {
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="container-fluid">
        ${html}
      </div>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>
      <script src="test_functions.js"></script>
      </body>
    </html>
  `;
  
  // Write to iframe
  const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
  doc.open();
  doc.write(fullHtml);
  doc.close();
}

/* -----------------------------
   Form element insertion
----------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for editor to initialize
  setTimeout(() => {
    const elementButtons = document.querySelectorAll('.element-btn');
    elementButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const elementType = btn.getAttribute('data-element');
        insertFormElement(elementType);
      });
    });
  }, 1000);
});

function insertFormElement(type) {
  if (!editor) {
    alert('Editor not ready yet. Please wait...');
    return;
  }

  let html = '';

  switch (type) {
    case 'text-input':
      html = '<div class="field"><label>Field Label</label><input type="text" name="field_name" id="field_name" /></div>';
      break;
    case 'number-input':
      html = '<div class="field"><label>Field Label</label><input type="number" name="field_name" id="field_name" /></div>';
      break;
    case 'pass-fail':
      html = '<div class="field">Result: <span data-rule-left="" data-rule-op="<" data-rule-type="constant" data-rule-value="">—</span></div>';
      break;
  }

  if (html) {
    // Get current HTML from source editor, append new HTML
    const sourceEditor = document.getElementById('source-editor');
    if (sourceEditor) {
      const currentData = sourceEditor.value;
      const newData = currentData + '\n' + html;
      sourceEditor.value = newData;
      // Update preview
      updatePreview(newData);
    }
  }
}

/* -----------------------------
   Form list management
----------------------------- */
async function loadFormList() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) {
      throw new Error(`Failed to load forms: ${res.statusText}`);
    }
    const forms = await res.json();
    displayFormList(forms);
  } catch (error) {
    console.error('Error loading form list:', error);
    const formListEl = document.getElementById('form-list');
    if (formListEl) {
      formListEl.innerHTML = '<div class="form-list-error">Error loading forms</div>';
    }
  }
}

function displayFormList(forms) {
  const formListEl = document.getElementById('form-list');
  if (!formListEl) return;

  if (!forms || forms.length === 0) {
    formListEl.innerHTML = '<div class="form-list-empty">No forms yet</div>';
    return;
  }

  formListEl.innerHTML = '';
  forms.forEach(form => {
    const item = document.createElement('div');
    item.className = 'form-list-item';
    item.setAttribute('data-form-id', form.id);
    item.innerHTML = `
      <div class="form-list-item-content">
        <div class="form-list-item-name">${form.name || form.id}</div>
        <div class="form-list-item-id">${form.id}</div>
      </div>
      <button class="btn btn-sm btn-danger form-list-item-delete" data-form-id="${form.id}" title="Delete form">🗑️</button>
    `;
    
    // Click on item (but not delete button) loads the form
    const content = item.querySelector('.form-list-item-content');
    content.addEventListener('click', () => {
      loadForm(form.id);
    });
    
    // Delete button
    const deleteBtn = item.querySelector('.form-list-item-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent triggering the item click
      deleteForm(form.id, form.name || form.id);
    });
    
    formListEl.appendChild(item);
  });
}

/* -----------------------------
   Delete form from backend
----------------------------- */
async function deleteForm(formId, formName) {
  if (!confirm(`Are you sure you want to delete "${formName}" (${formId})?\n\nThis will also delete all submissions for this form.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/${formId}`, {
      method: "DELETE"
    });

    if (res.ok) {
      console.log('Form deleted:', formId);
      // Reload the form list
      await loadFormList();
      
      // If the deleted form was currently loaded, clear the editor
      if (FORM_ID === formId) {
        updateSourceEditor('');
        updatePreview('');
        const nameInput = document.getElementById('form-name');
        if (nameInput) {
          nameInput.value = 'Untitled Form';
        }
        const formIdInput = document.getElementById('form-id-input');
        if (formIdInput) {
          formIdInput.value = '';
        }
        FORM_ID = '';
      }
    } else {
      const error = await res.text();
      alert(`Error deleting form: ${error}`);
      console.error('Delete error:', error);
    }
  } catch (error) {
    alert(`Error deleting form: ${error.message}`);
    console.error('Delete error:', error);
  }
}

// Refresh button
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refresh-forms');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadFormList);
  }
});

/* -----------------------------
   Load form from backend
----------------------------- */
async function loadForm(formId) {
  if (!formId) {
    console.log('No form ID provided');
    return null;
  }

  try {
    const res = await fetch(`${API_BASE}/${formId}`);
    if (res.ok) {
      const form = await res.json();
      
      FORM_ID = formId;
      
      // Set form name in input
      const nameInput = document.getElementById('form-name');
      if (nameInput) {
        nameInput.value = form.name || '';
      }
      
      // Set form ID in input and make it read-only
      const formIdInput = document.getElementById('form-id-input');
      if (formIdInput) {
        formIdInput.value = form.id || formId;
        formIdInput.readOnly = true; // Make ID read-only after loading
        formIdInput.classList.add('bg-light'); // Visual indicator that it's read-only
      }
      
      // Load HTML into source editor and preview
      if (form.html) {
        // Extract body content if HTML includes body tag
        let htmlContent = form.html;
        if (htmlContent.includes('<body')) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');
          htmlContent = doc.body.innerHTML;
        }
        // Update source editor
        updateSourceEditor(htmlContent);
        // Update preview
        updatePreview(htmlContent);
      }
      
      console.log('Form loaded:', form);
      return form;
    } else if (res.status === 404) {
      console.log('Form not found, starting with blank form');
      // Update form ID input to show what we tried to load
      const formIdInput = document.getElementById('form-id-input');
      if (formIdInput && !formIdInput.value) {
        formIdInput.value = formId;
      }
      updateSourceEditor('');
      updatePreview('');
      return null;
    }
  } catch (error) {
    console.error('Error loading form:', error);
    return null;
  }
}

/* -----------------------------
   Extract fields from HTML
----------------------------- */
function extractFields(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const fields = [];
  
  // Find all input, select, textarea elements
  const inputs = doc.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    let name = input.getAttribute('name');
    const id = input.getAttribute('id');
    
    // Auto-fix: if name is "temperature" or empty and id exists, use id as name
    if ((!name || name === 'temperature' || name === 'field_name') && id) {
      name = id;
    }
    
    if (name) {
      const type = input.getAttribute('type') || input.tagName.toLowerCase();
      fields.push({
        name: name,
        type: type === 'INPUT' ? (input.type || 'text') : type.toLowerCase()
      });
    }
  });
  
  return fields;
}

/* -----------------------------
   Extract rules from HTML data attributes
----------------------------- */
function extractRules(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rules = [];
  
  // Find elements with rule data attributes
  const ruleElements = doc.querySelectorAll('[data-rule-left]');
  ruleElements.forEach(el => {
    const left = el.getAttribute('data-rule-left');
    const operator = el.getAttribute('data-rule-op');
    const ruleType = el.getAttribute('data-rule-type');
    const refForm = el.getAttribute('data-rule-ref-form');
    const refField = el.getAttribute('data-rule-ref-field');
    const constantValue = el.getAttribute('data-rule-value');
    
    // Skip rules with empty left field (not configured yet)
    if (!left || left.trim() === '') {
      return;  // Skip this rule, it's not configured
    }
    
    if (left && operator) {
      let right;
      
      // Determine rule type - use attribute if present, otherwise infer from other attributes
      const actualRuleType = ruleType || (refForm && refField ? 'reference' : 'constant');
      
      if (actualRuleType === 'reference' && refForm && refField) {
        right = {
          source: "reference",
          formId: refForm,
          field: refField,
          mode: "last"
        };
      } else {
        // Constant rule
        if (constantValue !== null && constantValue !== '' && constantValue.trim() !== '') {
          // Try to parse as number, otherwise use as string
          const numValue = parseFloat(constantValue);
          right = {
            source: "constant",
            value: isNaN(numValue) ? constantValue : numValue
          };
        } else {
          // Skip constant rules with no value
          return;  // Skip this rule, it's not configured
        }
      }
      
      rules.push({
        type: "pass_fail",
        left: left,
        operator: operator,
        right: right
      });
    }
  });
  
  return rules;
}

/* -----------------------------
   Auto-save form to backend (silent, no alerts)
----------------------------- */
async function autoSaveForm(html) {
  const formId = getFormId();
  if (!formId) {
    // Can't save without form ID - skip silently
    return;
  }

  // Fix HTML directly to ensure name attributes are correct
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const inputs = doc.querySelectorAll('input, select, textarea');
  let htmlChanged = false;
  inputs.forEach(input => {
    const id = input.getAttribute('id');
    const currentName = input.getAttribute('name');
    
    // If name is "temperature" or empty and id exists, use id as name
    if (id && (currentName === 'temperature' || currentName === 'field_name' || !currentName)) {
      input.setAttribute('name', id);
      htmlChanged = true;
    }
  });
  
  // Get the updated HTML if we made changes
  if (htmlChanged) {
    html = doc.body.innerHTML;
  }
  
  // Wrap in body tag for consistency
  if (!html.includes('<body')) {
    html = `<body>${html}</body>`;
  }

  // Get form name from input or use default
  const nameInput = document.getElementById('form-name');
  const formName = nameInput ? nameInput.value.trim() || 'Untitled Form' : 'Untitled Form';

  // Extract fields and rules from HTML
  const fields = extractFields(html);
  const rules = extractRules(html);

  const payload = {
    id: formId,
    name: formName,
    html: html,
    fields: fields,
    rules: rules,
    version: 1
  };

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log('Form auto-saved:', formId);
    } else {
      console.error('Auto-save error:', await res.text());
    }
  } catch (error) {
    console.error('Auto-save error:', error);
  }
}

/* -----------------------------
   Save form to backend (with user feedback)
----------------------------- */
async function saveForm() {
  const sourceEditor = document.getElementById('source-editor');
  if (!sourceEditor) {
    alert('Source editor not ready yet. Please wait...');
    return;
  }

  let html = sourceEditor.value;
  
  // Fix HTML directly to ensure name attributes are correct
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const inputs = doc.querySelectorAll('input, select, textarea');
  let htmlChanged = false;
  inputs.forEach(input => {
    const id = input.getAttribute('id');
    const currentName = input.getAttribute('name');
    
    // If name is "temperature" or empty and id exists, use id as name
    if (id && (currentName === 'temperature' || currentName === 'field_name' || !currentName)) {
      input.setAttribute('name', id);
      htmlChanged = true;
      console.log('Fixed HTML directly: changed name from', currentName, 'to id', id);
    }
  });
  
  // Get the updated HTML if we made changes
  if (htmlChanged) {
    html = doc.body.innerHTML;
  }
  
  // Wrap in body tag for consistency
  if (!html.includes('<body')) {
    html = `<body>${html}</body>`;
  }
  
  // Get form name from input or use default
  const nameInput = document.getElementById('form-name');
  const formName = nameInput ? nameInput.value.trim() || 'Untitled Form' : 'Untitled Form';
  
  // Extract fields and rules from HTML (this will also auto-fix names)
  const fields = extractFields(html);
  const rules = extractRules(html);

  const formId = getFormId();
  if (!formId) {
    alert('Please enter a Form ID before saving.');
    document.getElementById('form-id-input')?.focus();
    return;
  }

  const payload = {
    id: formId,
    name: formName,
    html: html,
    fields: fields,
    rules: rules,
    version: 1
  };

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      alert(`Form saved successfully! Form ID: ${data.formId}`);
      console.log('Form saved:', data);
      // Refresh the form list to show the newly saved form
      await loadFormList();
    } else {
      const error = await res.text();
      alert(`Error saving form: ${error}`);
      console.error('Save error:', error);
    }
  } catch (error) {
    alert(`Error saving form: ${error.message}`);
    console.error('Save error:', error);
  }
}

/* -----------------------------
   Create new form from modal
----------------------------- */
async function createNewForm(e) {
  // Prevent form submission
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  const newFormName = document.getElementById('new-form-name');
  const newFormId = document.getElementById('new-form-id');
  
  if (!newFormName || !newFormId) {
    console.error('Form inputs not found');
    return;
  }
  
  const formName = newFormName.value.trim();
  const formId = newFormId.value.trim();
  
  if (!formName) {
    alert('Please enter a form name.');
    newFormName.focus();
    return;
  }
  
  if (!formId) {
    alert('Please enter a form ID.');
    newFormId.focus();
    return;
  }
  
  // Check if form ID already exists
  try {
    const res = await fetch(`${API_BASE}/${formId}`);
    if (res.ok) {
      alert(`Form ID "${formId}" already exists. Please choose a different ID.`);
      newFormId.focus();
      return;
    }
  } catch (error) {
    // Form doesn't exist, which is good
    console.log('Form ID is available:', formId);
  }
  
  // Set form name and ID in the main form
  const nameInput = document.getElementById('form-name');
        const formIdInput = document.getElementById('form-id-input');
  
  if (nameInput) {
    nameInput.value = formName;
  }
        if (formIdInput) {
          formIdInput.value = formId;
    formIdInput.readOnly = true; // Make ID read-only after creation
    formIdInput.classList.add('bg-light'); // Visual indicator that it's read-only
  }
  
  FORM_ID = formId;
  
  // Clear editor
  updateSourceEditor('');
  updatePreview('');
  
  // Save empty form to backend to create it
  const emptyHtml = '<body></body>';
  await autoSaveForm(emptyHtml);
  
  // Clear modal form before closing
  newFormName.value = '';
  newFormId.value = '';
  
  // Close modal
  const modalElement = document.getElementById('newFormModal');
  if (modalElement) {
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) {
      modal.hide();
    } else {
      // If modal instance doesn't exist, create one and hide it
      const newModal = new bootstrap.Modal(modalElement);
      newModal.hide();
    }
  }
  
  // Load the form list to show the new form
  await loadFormList();
  
  console.log('New form created:', formId);
}

/* -----------------------------
   Event listeners
----------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // New form modal - handled by Bootstrap modal
  const createFormBtn = document.getElementById('create-form-btn');
  if (createFormBtn) {
    createFormBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      createNewForm(e);
    });
  }

  const formatBtn = document.getElementById('format-document');
  if (formatBtn) {
    formatBtn.addEventListener('click', formatDocument);
  }
  
  // Make form ID read-only after form is loaded/created
    const formIdInput = document.getElementById('form-id-input');
    if (formIdInput) {
    formIdInput.readOnly = false; // Will be set to true after form is created/loaded
  }

  // Auto-save when form name changes
  const formNameInput = document.getElementById('form-name');
  
  if (formNameInput) {
    let nameTimeout;
    formNameInput.addEventListener('input', () => {
      clearTimeout(nameTimeout);
      nameTimeout = setTimeout(() => {
        const sourceEditor = document.getElementById('source-editor');
        if (sourceEditor && sourceEditor.value.trim() && getFormId()) {
          autoSaveForm(sourceEditor.value);
        }
      }, 1000); // 1 second debounce
    });
  }
  
  // Note: Form ID input is read-only after creation, so no need to listen for changes
});

/* -----------------------------
   Source Editor Sync
----------------------------- */
function setupSourceSync() {
  const sourceEditor = document.getElementById('source-editor');
  if (!sourceEditor) return;
  
  // Track previous value to detect changes
  let previousValue = sourceEditor.value;
  
  // Update preview when source editor changes (with 1 second debounce)
  let sourceTimeout;
  
  const syncPreview = () => {
    const currentValue = sourceEditor.value;
    // Only sync if value actually changed
    if (currentValue !== previousValue) {
      previousValue = currentValue;
      updatePreview(currentValue);
      // Auto-save to backend
      autoSaveForm(currentValue);
    }
  };
  
  // Listen to input events
  sourceEditor.addEventListener('input', () => {
    clearTimeout(sourceTimeout);
    sourceTimeout = setTimeout(syncPreview, 1000); // 1 second debounce
  });
  
  // Allow Tab key to insert a tab character instead of leaving the textarea
  sourceEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = sourceEditor.selectionStart;
      const end = sourceEditor.selectionEnd;
      const value = sourceEditor.value;
      sourceEditor.value = value.slice(0, start) + '\t' + value.slice(end);
      // place caret after inserted tab and trigger normal input flow
      sourceEditor.selectionStart = sourceEditor.selectionEnd = start + 1;
      sourceEditor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // Also handle paste events
  sourceEditor.addEventListener('paste', () => {
    clearTimeout(sourceTimeout);
    // Wait a bit for paste to complete, then sync
    sourceTimeout = setTimeout(syncPreview, 1000);
  });
  
  // Handle any other changes (like programmatic changes)
  const observer = new MutationObserver(() => {
    const currentValue = sourceEditor.value;
    if (currentValue !== previousValue) {
      clearTimeout(sourceTimeout);
      sourceTimeout = setTimeout(syncPreview, 1000);
    }
  });
  
  // Watch for attribute changes that might affect value
  observer.observe(sourceEditor, {
    attributes: true,
    attributeFilter: ['value']
  });
}

function updateSourceEditor(html) {
  const sourceEditor = document.getElementById('source-editor');
  if (sourceEditor) {
    sourceEditor.value = html;
  }
}

// Auto-sync functions removed - now using change-based sync with 1 second debounce

/* -----------------------------
   Format Document
----------------------------- */
function formatDocument() {
  const sourceEditor = document.getElementById('source-editor');
  if (!sourceEditor) return;
  
  const html = sourceEditor.value.trim();
  if (!html) return;
  
  try {
    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Format the HTML
    const formatted = formatHTML(doc.body);
    
    // Update the source editor
    sourceEditor.value = formatted;
    
    // Update preview
    updatePreview(formatted);
    
    // Save to backend
    autoSaveForm(formatted);
    
    // Visual feedback
    const btn = document.getElementById('format-document');
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Formatted & Saved!';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  } catch (error) {
    console.error('Error formatting document:', error);
    alert('Error formatting document. Please check the HTML syntax.');
  }
}

function formatHTML(element, indent = 0) {
  const indentStr = '  '.repeat(indent); // 2 spaces per indent
  let result = '';
  
  if (!element) return '';
  
  // Get all child nodes
  const children = Array.from(element.childNodes);
  
  for (const node of children) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        result += indentStr + text + '\n';
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const attributes = Array.from(node.attributes)
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(' ');
      
      const attrsStr = attributes ? ' ' + attributes : '';
      const hasChildren = node.children.length > 0;
      const hasTextContent = node.textContent.trim() && !hasChildren;
      
      // Self-closing tags
      const selfClosingTags = ['input', 'img', 'br', 'hr', 'meta', 'link'];
      if (selfClosingTags.includes(tagName)) {
        result += indentStr + `<${tagName}${attrsStr} />\n`;
      } else if (hasTextContent && !hasChildren) {
        // Element with only text content
        const text = node.textContent.trim();
        result += indentStr + `<${tagName}${attrsStr}>${text}</${tagName}>\n`;
        } else {
        // Element with children
        result += indentStr + `<${tagName}${attrsStr}>\n`;
        result += formatHTML(node, indent + 1);
        result += indentStr + `</${tagName}>\n`;
      }
    }
  }
  
  return result;
}
