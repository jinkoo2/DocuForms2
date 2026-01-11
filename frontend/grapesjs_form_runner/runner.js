const API_BASE = "http://localhost:8001/api/forms";

// Get form ID from URL parameter or use default
const urlParams = new URLSearchParams(window.location.search);
let FORM_ID = urlParams.get('formId');

const formEl = document.getElementById("form");
const fieldsEl = document.getElementById("fields");
const titleEl = document.getElementById("form-title");
const liveResultEl = document.getElementById("live-result");
const serverResponseEl = document.getElementById("server-response");

let formDef = null;

/* --------------------------
   Load form definition
--------------------------- */
async function loadForm(formId = null) {
  const formIdToLoad = formId || FORM_ID;
  if (!formIdToLoad) {
    titleEl.textContent = "No form selected";
    fieldsEl.innerHTML = "<p>Please select a form from the list.</p>";
    liveResultEl.textContent = "—";
    liveResultEl.className = "";
    serverResponseEl.textContent = "";
    return;
  }
  
  try {
    titleEl.textContent = "Loading...";
    fieldsEl.innerHTML = "<p>Loading form...</p>";
    
    const res = await fetch(`${API_BASE}/${formIdToLoad}`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error(`Form "${formIdToLoad}" not found`);
      }
      throw new Error(`Failed to load form: ${res.statusText}`);
    }
    formDef = await res.json();

    console.log('Form definition:', formDef);
    
    FORM_ID = formIdToLoad;
    titleEl.textContent = formDef.name || formIdToLoad;
    renderFormHtml(formDef.html);
    
    // Reset result display
    liveResultEl.textContent = "—";
    liveResultEl.className = "";
    serverResponseEl.textContent = "";
    
    // Update URL without reload
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('formId', formIdToLoad);
    window.history.pushState({ formId: formIdToLoad }, '', newUrl);
    
    // Update active state in form list
    updateActiveFormInList(formIdToLoad);
  } catch (error) {
    titleEl.textContent = "Error loading form";
    fieldsEl.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    liveResultEl.textContent = "—";
    liveResultEl.className = "";
    serverResponseEl.textContent = "";
    console.error('Error loading form:', error);
  }
}

function updateActiveFormInList(formId) {
  const formListEl = document.getElementById('form-list');
  if (!formListEl) return;
  
  formListEl.querySelectorAll('.form-list-item').forEach(item => {
    const itemFormId = item.getAttribute('data-form-id');
    if (itemFormId === formId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function renderFormHtml(html) {
  fieldsEl.innerHTML = html;

  // Show/hide result section based on whether form has rules
  const resultSection = document.querySelector('.result');
  if (resultSection) {
    if (formDef && formDef.rules && formDef.rules.length > 0) {
      resultSection.style.display = 'block';
    } else {
      resultSection.style.display = 'none';
    }
  }

  fieldsEl.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", evaluateLive);
  });
}

/* --------------------------
   Live rule evaluation
   (frontend convenience)
--------------------------- */
async function evaluateLive() {
  if (!formDef.rules || formDef.rules.length === 0) {
    liveResultEl.textContent = "—";
    liveResultEl.className = "";
    return;
  }

  const values = getFormValues();
  let allPass = true;

  for (const rule of formDef.rules) {
    const left = values[rule.left];

    let right = null;

    if (rule.right.source === "constant") {
      right = rule.right.value;
    } else if (rule.right.source === "reference") {
      // fetch reference value lazily
      right = await fetchReference(rule.right);
    }

    if (!compare(left, rule.operator, right)) {
      allPass = false;
    }
  }

  liveResultEl.textContent = allPass ? "PASS" : "FAIL";
  liveResultEl.className = allPass ? "pass" : "fail";
}

/* --------------------------
   Fetch reference value
--------------------------- */
async function fetchReference(ref) {
  const res = await fetch(`${API_BASE}/${ref.formId}/references`);
  const data = await res.json();
  return data[ref.field];
}

/* --------------------------
   Comparison helper
--------------------------- */
function compare(left, op, right) {
  const a = Number(left);
  const b = Number(right);

  if (isNaN(a) || isNaN(b)) return false;

  switch (op) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "==": return a === b;
    case "!=": return a !== b;
    default: return false;
  }
}

/* --------------------------
   Collect values
--------------------------- */
function getFormValues() {
  const values = {};
  new FormData(formEl).forEach((v, k) => {
    values[k] = v;
  });
  return values;
}

function getResultForSubmit() {
  const displayed = (liveResultEl.textContent || '').trim().toUpperCase();
  if (displayed) return displayed;
  // Default to PASS if nothing computed; adjust as needed.
  return "PASS";
}

/* --------------------------
   Submit to backend
--------------------------- */
formEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const values = getFormValues();
  const result = getResultForSubmit();

  if (!FORM_ID) {
    alert('No form selected. Please select a form from the list.');
    return;
  }

  const res = await fetch(`${API_BASE}/${FORM_ID}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values, result })
  });

  const data = await res.json();
  serverResponseEl.textContent = JSON.stringify(data, null, 2);

  const normalized = (data.result || '').toUpperCase();
  liveResultEl.textContent = normalized;
  liveResultEl.className =
    normalized === "PASS" ? "pass" : (normalized === "FAIL" ? "fail" : "");
});

/* --------------------------
   Form List Management
--------------------------- */

async function loadFormList() {
  try {
    console.log('Loading form list from:', API_BASE);
    const res = await fetch(API_BASE);
    if (res.ok) {
      const forms = await res.json();
      console.log('Loaded forms:', forms);
      displayFormList(forms);
    } else {
      console.error('Error loading form list:', res.status, res.statusText);
      const formListEl = document.getElementById('form-list');
      if (formListEl) {
        formListEl.innerHTML = `<div class="form-list-empty">Error loading forms: ${res.statusText}</div>`;
      }
    }
  } catch (error) {
    console.error('Error loading form list:', error);
    const formListEl = document.getElementById('form-list');
    if (formListEl) {
      formListEl.innerHTML = `<div class="form-list-empty">Error: ${error.message}</div>`;
    }
  }
}

function displayFormList(forms) {
  const formListEl = document.getElementById('form-list');
  if (!formListEl) {
    console.error('Form list element not found!');
    return;
  }
  
  if (forms.length === 0) {
    formListEl.innerHTML = '<div class="form-list-empty">No forms found</div>';
    return;
  }
  
  formListEl.innerHTML = forms.map(form => {
    const createdAt = form.createdAt ? new Date(form.createdAt).toLocaleDateString() : '';
    const isActive = form.id === FORM_ID ? 'active' : '';
    return `
      <div class="form-list-item ${isActive}" data-form-id="${form.id}">
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
        // Update active state
        formListEl.querySelectorAll('.form-list-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        // Load the form
        await loadForm(formId);
      }
    });
  });
  
  console.log(`Displayed ${forms.length} forms in the list`);
}

// Set up refresh button
document.getElementById('refresh-forms')?.addEventListener('click', loadFormList);

// Handle browser back/forward buttons
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.formId) {
    FORM_ID = e.state.formId;
    loadForm();
  }
});

/* --------------------------
   Start
--------------------------- */
// Initialize when DOM is ready
function init() {
  console.log('Initializing form runner...');
  console.log('FORM_ID:', FORM_ID);
  console.log('Form list element:', document.getElementById('form-list'));
  
  // Load form list first
  loadFormList().then(() => {
    console.log('Form list loaded');
    // Only load form if we have a FORM_ID from URL or default
    if (FORM_ID) {
      loadForm();
    } else {
      titleEl.textContent = "Select a form";
      fieldsEl.innerHTML = "<p>Please select a form from the list on the left.</p>";
    }
  }).catch(err => {
    console.error('Error initializing:', err);
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM is already ready
  init();
}
