const API_BASE = "http://localhost:8001/api/forms";

// Get form ID from URL parameter or use default
const urlParams = new URLSearchParams(window.location.search);
let FORM_ID = urlParams.get('formId') || 'daily_check';

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
  document.addEventListener('DOMContentLoaded', () => {
    const formIdInput = document.getElementById('form-id-input');
    if (formIdInput) {
      formIdInput.value = FORM_ID;
    }
  });
} else {
  const formIdInput = document.getElementById('form-id-input');
  if (formIdInput) {
    formIdInput.value = FORM_ID;
  }
}

/* -----------------------------
   Create wrapper containers for managers
----------------------------- */

// Create wrapper divs for each manager BEFORE editor init
const panelRight = document.querySelector('.panel__right');

// Create a container for the manager views (below the buttons)
const managersContainer = document.createElement('div');
managersContainer.className = 'managers-container';
managersContainer.style.flex = '1';
managersContainer.style.display = 'flex';
managersContainer.style.flexDirection = 'column';
managersContainer.style.overflow = 'hidden';

const layersWrapper = document.createElement('div');
layersWrapper.className = 'layers-wrapper';
layersWrapper.style.display = 'block';
layersWrapper.style.flex = '1';
layersWrapper.style.overflow = 'auto';

const stylesWrapper = document.createElement('div');
stylesWrapper.className = 'styles-wrapper';
stylesWrapper.style.display = 'none';
stylesWrapper.style.flex = '1';
stylesWrapper.style.overflow = 'auto';

const traitsWrapper = document.createElement('div');
traitsWrapper.className = 'traits-wrapper';
traitsWrapper.style.display = 'none';
traitsWrapper.style.flex = '1';
traitsWrapper.style.overflow = 'auto';

// Append wrappers to managers container
managersContainer.appendChild(layersWrapper);
managersContainer.appendChild(stylesWrapper);
managersContainer.appendChild(traitsWrapper);

// Append managers container to right panel (buttons will be added by GrapesJS above this)
panelRight.appendChild(managersContainer);

// Register commands BEFORE editor init
const commands = {
  'show-layers': {
    run(editor) {
      layersWrapper.style.display = 'block';
      stylesWrapper.style.display = 'none';
      traitsWrapper.style.display = 'none';
    },
  },
  'show-styles': {
    run(editor) {
      stylesWrapper.style.display = 'block';
      layersWrapper.style.display = 'none';
      traitsWrapper.style.display = 'none';
    },
  },
  'show-traits': {
    run(editor) {
      traitsWrapper.style.display = 'block';
      layersWrapper.style.display = 'none';
      stylesWrapper.style.display = 'none';
    },
  },
};

const editor = grapesjs.init({
  container: '#gjs',
  height: '100%',
  fromElement: false,

  storageManager: false,

  blockManager: {
    appendTo: '#gjs'  // Blocks will be available in the canvas, not left panel
  },

  panels: {
    defaults: [
      // Layers
      {
        id: 'panel-layers',
        el: '.panel__right',
        buttons: [
          {
            id: 'layers',
            active: true,
            label: '📚',
            command: 'show-layers',
            togglable: false,
          }
        ],
        resizable: {
          maxDim: 350,
          minDim: 200,
          tc: 0, // Top handler
          cl: 1, // Left handler
          cr: 0, // Right handler
          bc: 0, // Bottom handler
          keyWidth: 'flex-basis',
        },
      },

      // Traits / Settings
      {
        id: 'panel-traits',
        el: '.panel__right',
        buttons: [
          {
            id: 'traits',
            label: '⚙️',
            command: 'show-traits',
            togglable: false,
          }
        ],
        resizable: {
          maxDim: 350,
          minDim: 200,
          tc: 0,
          cl: 1,
          cr: 0,
          bc: 0,
          keyWidth: 'flex-basis',
        },
      },

      // Styles
      {
        id: 'panel-styles',
        el: '.panel__right',
        buttons: [
          {
            id: 'styles',
            label: '🎨',
            command: 'show-styles',
            togglable: false,
          }
        ],
        resizable: {
          maxDim: 350,
          minDim: 200,
          tc: 0,
          cl: 1,
          cr: 0,
          bc: 0,
          keyWidth: 'flex-basis',
        },
      },
    ],
  },

  layerManager: {
    appendTo: '.layers-wrapper'
  },

  styleManager: {
    appendTo: '.styles-wrapper',
    sectors: [{
      name: 'Dimension',
      open: false,
      buildProps: ['width', 'min-height', 'padding'],
      properties: [{
        type: 'integer',
        name: 'The width',
        property: 'width',
        units: ['px', '%'],
        defaults: 'auto',
        min: 0,
      }]
    },{
      name: 'Extra',
      open: false,
      buildProps: ['background-color', 'box-shadow', 'custom-prop'],
      properties: [{
        id: 'custom-prop',
        name: 'Custom Label',
        property: 'font-size',
        type: 'select',
        defaults: '32px',
        options: [
          {value: '12px', name: 'Tiny'},
          {value: '18px', name: 'Medium'},
          {value: '32px', name: 'Big'},
        ],
      }]
    }]
  },

  traitManager: {
    appendTo: '.traits-wrapper'
  },
});

// Register commands after editor is created
Object.keys(commands).forEach(cmd => {
  editor.Commands.add(cmd, commands[cmd]);
});

// Ensure managers are visible after editor loads
editor.on('load', () => {
  // Make sure layers wrapper is visible initially
  layersWrapper.style.display = 'block';
  stylesWrapper.style.display = 'none';
  traitsWrapper.style.display = 'none';
  
  // Trigger the show-layers command to ensure proper initialization
  setTimeout(() => {
    editor.runCommand('show-layers');
  }, 100);
});

/* -----------------------------
   Basic blocks
----------------------------- */

// Text
editor.BlockManager.add("text", {
  label: "Text",
  content: "<p>Text</p>"
});

// Number input
editor.BlockManager.add("number", {
  label: "Number Input",
  content: `
    <div class="field">
      <label>Field Label</label>
      <input type="number" name="field_name" />
    </div>
  `
});

// Text input
editor.BlockManager.add("text-input", {
  label: "Text Input",
  content: `
    <div class="field">
      <label>Field Label</label>
      <input type="text" name="field_name" />
    </div>
  `
});

// Define custom component type for rule spans
editor.DomComponents.addType('rule-span', {
  extend: 'default',
  model: {
    defaults: {
      tagName: 'span',
      traits: [
        {
          type: 'select',
          label: 'Rule Type',
          name: 'data-rule-type',
          changeProp: 1,
          options: [
            { value: 'reference', name: 'Reference (other form)' },
            { value: 'constant', name: 'Constant Value' }
          ],
        },
        {
          type: 'text',
          label: 'Left Field (field name to compare)',
          name: 'data-rule-left',
          changeProp: 1,
          placeholder: 'e.g., age3, name, temperature',
        },
        {
          type: 'select',
          label: 'Operator',
          name: 'data-rule-op',
          changeProp: 1,
          options: [
            { value: '<', name: 'Less than (<)' },
            { value: '<=', name: 'Less than or equal (<=)' },
            { value: '>', name: 'Greater than (>)' },
            { value: '>=', name: 'Greater than or equal (>=)' },
            { value: '==', name: 'Equal (==)' },
            { value: '!=', name: 'Not equal (!=)' }
          ],
        },
        {
          type: 'text',
          label: 'Reference Form ID',
          name: 'data-rule-ref-form',
          changeProp: 1,
          placeholder: 'e.g., baseline_temp',
        },
        {
          type: 'text',
          label: 'Reference Field',
          name: 'data-rule-ref-field',
          changeProp: 1,
          placeholder: 'e.g., temperature',
        },
        {
          type: 'text',
          label: 'Constant Value',
          name: 'data-rule-value',
          changeProp: 1,
          placeholder: 'e.g., 100',
        },
      ],
    },
    init() {
      // Update trait visibility when rule type changes
      this.on('change:data-rule-type', () => {
        this.updateTraitVisibility();
      });
      
      // Initialize visibility
      this.updateTraitVisibility();
    },
    updateTraitVisibility() {
      const ruleType = this.getAttributes()['data-rule-type'] || 
                      (this.getAttributes()['data-rule-ref-form'] ? 'reference' : 'constant');
      
      const traits = this.get('traits');
      traits.forEach(trait => {
        if (trait.name === 'data-rule-ref-form' || trait.name === 'data-rule-ref-field') {
          trait.visible = ruleType === 'reference';
        } else if (trait.name === 'data-rule-value') {
          trait.visible = ruleType === 'constant';
        }
      });
      
      // Force trait manager to refresh
      this.set('traits', [...traits]);
    },
  },
});

// PASS / FAIL indicator
editor.BlockManager.add("result", {
  label: "Pass / Fail",
  content: {
    type: 'div',
    components: [
      { type: 'textnode', content: 'Result: ' },
      {
        type: 'rule-span',
        attributes: {
          'data-rule-left': '',  // Will be set by user via traits
          'data-rule-op': '<',
          'data-rule-ref-form': '',
          'data-rule-ref-field': '',
          'data-rule-type': 'constant',  // Default to constant, user can change
          'data-rule-value': '',  // For constant rules
        },
        content: '—',
      }
    ]
  },
  category: 'Form Elements',
  activate: true,  // Select the component after adding
});

/* -----------------------------
   Extract fields from HTML
----------------------------- */
function extractFields(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const fields = [];
  
  // Find all input, select, and textarea elements
  const inputs = doc.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    let name = input.getAttribute('name');
    const id = input.getAttribute('id');
    
    // Auto-fix: if name is "temperature" or empty and id exists, use id as name
    if ((!name || name === 'temperature' || name === 'field_name') && id) {
      name = id;
      // Update the HTML element
      input.setAttribute('name', id);
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
   Load form from backend
----------------------------- */
async function loadForm() {
  const formId = getFormId();
  if (!formId) {
    console.log('No form ID specified, starting with blank form');
    return null;
  }
  
  try {
    const res = await fetch(`${API_BASE}/${formId}`);
    if (res.ok) {
      const form = await res.json();
      
      // Set form name in input if it exists
      const nameInput = document.getElementById('form-name');
      if (nameInput) {
        nameInput.value = form.name || '';
      }
      
      // Set form ID in input
      const formIdInput = document.getElementById('form-id-input');
      if (formIdInput) {
        formIdInput.value = form.id || formId;
      }
      
      // Load HTML into editor
      if (form.html) {
        editor.setComponents(form.html);
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
      return null;
    }
  } catch (error) {
    console.error('Error loading form:', error);
    return null;
  }
}

/* -----------------------------
   Save form to backend
----------------------------- */
async function saveForm() {
  // First, fix all input components in the editor to sync name with id
  const allComponents = editor.getComponents();
  const fixInputNames = (comp) => {
    if (!comp) return;
    
    if (comp.get('tagName') === 'input') {
      const id = comp.get('id');
      const attrs = comp.getAttributes() || {};
      const currentName = attrs.name;
      
      // Auto-fix: if name is "temperature" or empty and id exists, use id as name
      if (id && (currentName === 'temperature' || currentName === 'field_name' || !currentName)) {
        const newAttrs = { ...attrs, name: id };
        comp.set('attributes', newAttrs);
        console.log('Fixed input name in editor: changed from', currentName, 'to id', id);
      }
    }
    
    // Recursively check child components
    try {
      const children = comp.components();
      if (children) {
        if (typeof children.each === 'function') {
          children.each(fixInputNames);
        } else if (Array.isArray(children)) {
          children.forEach(fixInputNames);
        }
      }
    } catch (e) {
      // Skip components without children
    }
  };
  
  if (allComponents) {
    if (typeof allComponents.each === 'function') {
      allComponents.each(fixInputNames);
    } else if (Array.isArray(allComponents)) {
      allComponents.forEach(fixInputNames);
    } else {
      fixInputNames(allComponents);
    }
  }
  
  // Now get the HTML after fixing components
  let html = editor.getHtml();
  const css = editor.getCss();
  
  // Also fix HTML directly as a backup to ensure name attributes are correct
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
    // Use the body's innerHTML and preserve the body tag structure
    const bodyContent = doc.body.innerHTML;
    
    // Preserve the original body tag structure
    if (html.includes('<body')) {
      // Extract the opening body tag with any attributes
      const bodyTagMatch = html.match(/<body[^>]*>/);
      const bodyTag = bodyTagMatch ? bodyTagMatch[0] : '<body>';
      html = bodyTag + bodyContent + '</body>';
    } else {
      html = '<body>' + bodyContent + '</body>';
    }
    console.log('Updated HTML with fixed name attributes');
    console.log('New HTML:', html.substring(0, 200));
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

// Set up save button
document.getElementById("save").onclick = saveForm;

/* -----------------------------
   Form List Management
----------------------------- */

async function loadFormList() {
  try {
    const res = await fetch(API_BASE);
    if (res.ok) {
      const forms = await res.json();
      displayFormList(forms);
    } else {
      console.error('Error loading form list:', res.statusText);
    }
  } catch (error) {
    console.error('Error loading form list:', error);
  }
}

function displayFormList(forms) {
  const formListEl = document.getElementById('form-list');
  if (!formListEl) return;
  
  if (forms.length === 0) {
    formListEl.innerHTML = '<div class="form-list-empty">No forms found</div>';
    return;
  }
  
  formListEl.innerHTML = forms.map(form => {
    const createdAt = form.createdAt ? new Date(form.createdAt).toLocaleDateString() : '';
    return `
      <div class="form-list-item" data-form-id="${form.id}">
        <div class="form-list-item-name">${form.name || form.id}</div>
        <div class="form-list-item-id">${form.id}</div>
        ${createdAt ? `<div class="form-list-item-date">${createdAt}</div>` : ''}
      </div>
    `;
  }).join('');
  
  // Add click handlers
  formListEl.querySelectorAll('.form-list-item').forEach(item => {
    item.addEventListener('click', async () => {
      const formId = item.getAttribute('data-form-id');
      if (formId) {
        // Update form ID input
        const formIdInput = document.getElementById('form-id-input');
        if (formIdInput) {
          formIdInput.value = formId;
        }
        // Load the form
        await loadForm();
      }
    });
  });
}

// Set up refresh button
const refreshBtn = document.getElementById('refresh-forms');
if (refreshBtn) {
  refreshBtn.addEventListener('click', loadFormList);
}

// Set up new form button
document.getElementById("new-form").onclick = () => {
  if (confirm('Create a new form? This will clear the current form. Make sure to save first if needed.')) {
    // Clear the editor
    editor.setComponents('');
    
    // Reset form name
    const nameInput = document.getElementById('form-name');
    if (nameInput) {
      nameInput.value = 'Untitled Form';
    }
    
    // Generate a new form ID or let user enter one
    const formIdInput = document.getElementById('form-id-input');
    if (formIdInput) {
      formIdInput.value = '';
      formIdInput.placeholder = 'Enter new form ID (e.g., my_new_form)';
      formIdInput.focus();
    }
  }
};

// Set up load form button
document.getElementById("load-form").onclick = async () => {
  const formId = getFormId();
  if (!formId) {
    alert('Please enter a Form ID to load.');
    document.getElementById('form-id-input')?.focus();
    return;
  }
  
  if (confirm(`Load form "${formId}"? This will replace the current form. Make sure to save first if needed.`)) {
    await loadForm();
  }
};


// Add traits to input elements so users can set the name attribute
editor.DomComponents.addType('input', {
  extend: 'default',
  model: {
    defaults: {
      traits: [
        {
          type: 'text',
          label: 'Field Name',
          name: 'name',
          changeProp: 1,
          placeholder: 'e.g., name, age, temperature',
        },
        {
          type: 'select',
          label: 'Input Type',
          name: 'type',
          changeProp: 1,
          options: [
            { value: 'text', name: 'Text' },
            { value: 'number', name: 'Number' },
            { value: 'email', name: 'Email' },
            { value: 'date', name: 'Date' },
          ],
        },
      ],
    },
    init() {
      // Sync name attribute with id attribute
      const syncNameWithId = () => {
        const id = this.get('id');
        const currentName = this.getAttributes()?.name;
        
        // If name is "temperature" or empty and id exists, sync with id
        if (id && (currentName === 'temperature' || currentName === 'field_name' || !currentName)) {
          this.addAttributes({ name: id });
          console.log('Synced name attribute with id:', id);
        }
      };
      
      // Sync on id change
      this.on('change:id', syncNameWithId);
      
      // Sync on load
      setTimeout(syncNameWithId, 100);
    },
  },
});

// Add traits to label elements
editor.DomComponents.addType('label', {
  extend: 'default',
  model: {
    defaults: {
      traits: [
        {
          type: 'text',
          label: 'Label Text',
          name: 'content',
          changeProp: 1,
          placeholder: 'Field label',
        },
      ],
    },
  },
});

// Convert existing components to use custom component types
editor.on('component:add', (component) => {
  if (!component) return;
  
  // Check if this is an input that needs conversion
  if (component.get('tagName') === 'input') {
    component.set('type', 'input');
    const id = component.get('id');
    const currentName = component.getAttributes()?.name;
    console.log('Converted input to custom type, id:', id, 'name:', currentName);
    
    // Auto-fix: if name is "temperature" and id exists, use id as name
    if (currentName === 'temperature' && id) {
      component.addAttributes({ name: id });
      console.log('Auto-fixed on add: changed name from "temperature" to id:', id);
    }
  }
  
  // Check if this is a span with rule attributes that needs conversion
  if (component.get('tagName') === 'span') {
    const attrs = component.getAttributes();
    if (attrs && attrs['data-rule-left']) {
      // Convert to rule-span type
      component.set('type', 'rule-span');
    }
  }
  
  // Check nested components safely
  try {
    const components = component.components();
    if (components) {
      const processComponent = (comp) => {
        if (!comp) return;
        if (comp.get('tagName') === 'input') {
          comp.set('type', 'input');
          const id = comp.get('id');
          const currentName = comp.getAttributes()?.name;
          console.log('Converted nested input to custom type, id:', id, 'name:', currentName);
          
          // Auto-fix: if name is "temperature" and id exists, use id as name
          if (currentName === 'temperature' && id) {
            comp.addAttributes({ name: id });
            console.log('Auto-fixed nested input: changed name from "temperature" to id:', id);
          }
        }
        if (comp.get('tagName') === 'span') {
          const attrs = comp.getAttributes();
          if (attrs && attrs['data-rule-left']) {
            comp.set('type', 'rule-span');
          }
        }
      };
      
      if (typeof components.each === 'function') {
        components.each(processComponent);
      } else if (Array.isArray(components)) {
        components.forEach(processComponent);
      }
    }
  } catch (e) {
    // Some components don't have a components() method, skip them
    console.debug('Component has no children method:', component);
  }
});

// Load form when editor is ready
editor.on('load', async () => {
  // Load form list first
  await loadFormList();
  
  // Then try to load the current form
  await loadForm();
  
  // Convert any existing components after loading
    setTimeout(() => {
      const findAndConvert = (comp) => {
        if (!comp) return;
        
        // Convert input elements to use custom input type
        if (comp.get('tagName') === 'input') {
          comp.set('type', 'input');
          const id = comp.get('id');
          const currentName = comp.getAttributes()?.name;
          console.log('Found and converted input, id:', id, 'current name:', currentName);
          
          // Auto-fix: if name is "temperature" and id exists, use id as name
          if (currentName === 'temperature' && id) {
            comp.addAttributes({ name: id });
            // Also update the attributes directly to ensure it's saved
            const attrs = comp.getAttributes();
            attrs.name = id;
            comp.set('attributes', attrs);
            console.log('Auto-fixed: changed name from "temperature" to id:', id);
          } else if (id && (!currentName || currentName === 'field_name')) {
            // If no name or default name, use id
            comp.addAttributes({ name: id });
            const attrs = comp.getAttributes();
            attrs.name = id;
            comp.set('attributes', attrs);
            console.log('Auto-set name to id:', id);
          }
        }
        
        // Check if this component is a span with rule attributes
        if (comp.get('tagName') === 'span') {
          const attrs = comp.getAttributes();
          if (attrs && attrs['data-rule-left']) {
            comp.set('type', 'rule-span');
          }
        }
        
        // Recursively check child components
        try {
          const children = comp.components();
          if (children && typeof children.each === 'function') {
            children.each(findAndConvert);
          } else if (Array.isArray(children)) {
            children.forEach(findAndConvert);
          }
        } catch (e) {
          // Some components don't have a components() method, skip them
          console.debug('Component has no children:', comp);
        }
      };
      
      // Start from the root components
      const allComponents = editor.getComponents();
      if (allComponents) {
        if (typeof allComponents.each === 'function') {
          allComponents.each(findAndConvert);
        } else if (Array.isArray(allComponents)) {
          allComponents.forEach(findAndConvert);
        } else {
          findAndConvert(allComponents);
        }
      }
    }, 500);
});
