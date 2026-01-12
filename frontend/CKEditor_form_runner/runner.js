const API_BASE = "http://localhost:8001/api/forms";
// Extract base API URL for uploads (remove /forms suffix)
const UPLOAD_API_BASE = API_BASE.replace('/forms', '');

// Get form ID from URL parameter or use default
const urlParams = new URLSearchParams(window.location.search);
let FORM_ID = urlParams.get('formId');

const formEl = document.getElementById("form");
const fieldsEl = document.getElementById("fields");
const titleEl = document.getElementById("form-title");
const liveResultEl = document.getElementById("live-result");
const serverResponseEl = document.getElementById("server-response");
const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
const submissionsListEl = document.getElementById("submissions-list");
const submissionPreviewFrame = document.getElementById("submission-preview-frame");
const plotCanvas = document.getElementById("submission-plot-canvas");
const plotMaxBtn = document.getElementById("plot-maximize-btn");
const plotRestoreBtn = document.getElementById("plot-restore-btn");
const plotModalEl = document.getElementById("submissionPlotModal");
const plotDragHandle = document.getElementById("plot-drag-handle");
const submissionsViewMode = document.getElementById("submissions-view-mode");
let submissionPreviewModal = null;
let submissionPlotModal = null;
let plotChart = null;
let cachedSubmissions = [];

let formDef = null;
let baselineSubmission = null;

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
    
    // Load baseline submission before rendering form (so scripts can access it)
    await loadBaselineSubmission(formIdToLoad);
    
    renderFormHtml(formDef.html);
    
    // Reset result display
    liveResultEl.textContent = "—";
    liveResultEl.className = "";
    serverResponseEl.textContent = "";
    // Load submissions list
    loadSubmissions(formIdToLoad);
    
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

async function loadBaselineSubmission(formId) {
  try {
    const res = await fetch(`${API_BASE}/${formId}/submissions`);
    if (!res.ok) {
      baselineSubmission = null;
      window.baselineSubmission = null;
      // Also make it available without window prefix in global scope
      if (typeof globalThis !== 'undefined') {
        globalThis.baselineSubmission = null;
      }
      return;
    }
    const submissions = await res.json();
    // Find the baseline submission
    const baseline = submissions.find(s => s.baseline === true);
    baselineSubmission = baseline || null;
    // Make it available globally for form scripts (accessible as baselineSubmission or window.baselineSubmission)
    window.baselineSubmission = baselineSubmission;
    if (typeof globalThis !== 'undefined') {
      globalThis.baselineSubmission = baselineSubmission;
    }
    console.log('Baseline submission loaded:', baselineSubmission);
  } catch (error) {
    console.error('Error loading baseline submission:', error);
    baselineSubmission = null;
    window.baselineSubmission = null;
    if (typeof globalThis !== 'undefined') {
      globalThis.baselineSubmission = null;
    }
  }
}

function renderFormHtml(html) {
  // Ensure test functions are available globally BEFORE inserting HTML
  // so inline handlers can find them
  if (typeof hello !== 'undefined') {
    window.hello = hello;
  }
  if (typeof test_input_pass_warning_fail !== 'undefined') {
    window.test_input_pass_warning_fail = test_input_pass_warning_fail;
  }
  if (typeof eval_form !== 'undefined') {
    window.eval_form = eval_form;
  }
  
  // Ensure baseline is available globally
  window.baselineSubmission = baselineSubmission;
  
  // Fix upload URLs in HTML before inserting - replace relative /api/upload with full URL
  // This handles both single and double quotes in onchange handlers and fetch calls
  html = html.replace(/'\/api\/upload'/g, `'${UPLOAD_API_BASE}/upload'`);
  html = html.replace(/"\/api\/upload"/g, `"${UPLOAD_API_BASE}/upload"`);
  // Also handle cases where it might be in template literals or without quotes in fetch
  html = html.replace(/fetch\(['"]\/api\/upload['"]/g, `fetch('${UPLOAD_API_BASE}/upload'`);
  
  // Fix download links - replace relative /uploads/ with full backend URL
  // Extract base URL (http://localhost:8001) from UPLOAD_API_BASE
  const BACKEND_BASE = UPLOAD_API_BASE.replace('/api', '');
  // Replace href="/uploads/..." with full backend URL (handle both single and double quotes)
  html = html.replace(/href=["']\/uploads\//g, (match) => {
    const quote = match.includes('"') ? '"' : "'";
    return `href=${quote}${BACKEND_BASE}/uploads/`;
  });
  
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
    // Update submit availability when required fields change
    input.addEventListener("input", updateSubmitEnabled);
  });

  // Set submit button state on initial render
  updateSubmitEnabled();
  
  // Call eval_form to run data-script on all controls (e.g., to set baseline values)
  if (typeof eval_form === 'function') {
    console.log('renderFromHtml - eval_form', eval_form);
    eval_form(null);
  }
}

/* --------------------------
   Live rule evaluation
   (frontend convenience)
--------------------------- */
async function evaluateLive() {
  // If there are no backend rules, fall back to client-side field results
  if (!formDef.rules || formDef.rules.length === 0) {
    const aggregated = aggregateFieldResults();
    setLiveResult(aggregated);
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
   Aggregate field-level results
   Fail > Warning > Pass
--------------------------- */
function aggregateFieldResults() {
  const inputs = fieldsEl.querySelectorAll('input, select, textarea');
  let hasFail = false;
  let hasWarning = false;
  let hasPass = false;

  inputs.forEach((el) => {
    const r = el.dataset?.result;
    if (!r) return;
    const v = r.toLowerCase();
    if (v === 'fail') hasFail = true;
    else if (v === 'warning') hasWarning = true;
    else if (v === 'pass') hasPass = true;
  });

  if (hasFail) return 'FAIL';
  if (hasWarning) return 'WARNING';
  if (hasPass) return 'PASS';
  return '—';
}

function setLiveResult(result) {
  const normalized = (result || '').toUpperCase();
  liveResultEl.textContent = normalized || '—';
  if (normalized === 'FAIL') {
    liveResultEl.className = 'fail';
  } else if (normalized === 'WARNING') {
    liveResultEl.className = 'warning';
  } else if (normalized === 'PASS') {
    liveResultEl.className = 'pass';
  } else {
    liveResultEl.className = '';
  }
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

/* --------------------------
   Submissions list
--------------------------- */
async function loadSubmissions(formId = null) {
  if (!formId || !submissionsListEl) return;
  submissionsListEl.innerHTML = '<div class="form-list-loading">Loading submissions...</div>';
  try {
    const res = await fetch(`${API_BASE}/${formId}/submissions`);
    if (!res.ok) throw new Error(`Failed to load submissions: ${res.statusText}`);
    const submissions = await res.json();
    cachedSubmissions = submissions || [];
    renderSubmissions(submissions);
  } catch (err) {
    submissionsListEl.innerHTML = `<div class="text-danger">Error: ${err.message}</div>`;
  }
}

function renderSubmissions(submissions) {
  if (!submissionsListEl) return;

  const viewMode = submissionsViewMode?.value || 'list';

  if (!submissions || submissions.length === 0) {
    submissionsListEl.innerHTML = '<div class="form-list-empty">No submissions yet.</div>';
    return;
  }

  if (viewMode === 'table') {
    const rows = submissions.map((s) => {
      const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '';
      const result = (s.result || '').toUpperCase();
      const id = s.id || '';
      const hasHtml = !!s.formHtml;
      const isBaseline = s.baseline || false;
      const comments = (s.comments || '').trim();
      const resultBadge =
        result === 'PASS' ? 'bg-success' :
        result === 'WARNING' ? 'bg-warning text-dark' :
        result === 'FAIL' ? 'bg-danger' : 'bg-secondary';

      return `
        <tr data-id="${id}">
          <td class="text-nowrap">${date}</td>
          <td><span class="badge ${resultBadge}">${result || '—'}</span></td>
          <td>${comments ? `<span class="text-muted" title="${comments.replace(/"/g, '&quot;')}">${comments.length > 50 ? comments.substring(0, 50) + '...' : comments}</span>` : '<span class="text-muted">—</span>'}</td>
          <td class="text-center">
            <input type="checkbox" class="form-check-input baseline-checkbox" data-id="${id}" ${isBaseline ? 'checked' : ''}>
          </td>
          <td class="text-nowrap">
            ${hasHtml ? `<button class="btn btn-sm btn-outline-primary view-submission-btn" data-id="${id}">View Form</button>` : ''}
            <button class="btn btn-sm btn-outline-danger delete-submission-btn" data-id="${id}">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    submissionsListEl.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm align-middle" id="submissions-table">
          <thead>
            <tr>
              <th scope="col">Date/Time</th>
              <th scope="col">Result</th>
              <th scope="col">Comments</th>
              <th scope="col" class="text-center">Baseline</th>
              <th scope="col">Commands</th>
            </tr>
          </thead>
          <tbody id="submissions-tbody">
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  } else {
    const cards = submissions.map((s) => {
      const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '';
      const result = (s.result || '').toUpperCase();
      const id = s.id || '';
      const hasHtml = !!s.formHtml;
      const comments = (s.comments || '').trim();
      return `
        <div class="card mb-2">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-bold">Result: ${result || '—'}</div>
                <div class="text-muted small">${date}</div>
              </div>
              <div class="badge ${result === 'PASS' ? 'bg-success' : result === 'WARNING' ? 'bg-warning text-dark' : 'bg-danger'}">${result || '—'}</div>
            </div>
            ${comments ? `<div class="mt-2 mb-2 p-2 bg-light rounded"><strong>Comments:</strong><br><span style="white-space: pre-wrap;">${comments.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>` : ''}
            <pre class="mt-2 mb-3" style="white-space: pre-wrap; word-break: break-word;">${JSON.stringify(s.values, null, 2)}</pre>
            <div class="d-flex justify-content-end gap-2">
              ${hasHtml ? `<button class="btn btn-sm btn-outline-primary view-submission-btn" data-id="${id}">View Form</button>` : ''}
              <button class="btn btn-sm btn-outline-danger delete-submission-btn" data-id="${id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    submissionsListEl.innerHTML = cards;
  }

  // Attach delete handlers
  submissionsListEl.querySelectorAll('.delete-submission-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const submissionId = btn.getAttribute('data-id');
      if (!submissionId || !FORM_ID) return;
      const confirmDelete = confirm('Delete this submission?');
      if (!confirmDelete) return;
      try {
        const res = await fetch(`${API_BASE}/${FORM_ID}/submissions/${submissionId}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error(`Failed to delete: ${res.statusText}`);
        loadSubmissions(FORM_ID);
      } catch (err) {
        alert(err.message);
      }
    });
  });

  // Attach view handlers
  submissionsListEl.querySelectorAll('.view-submission-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const submissionId = btn.getAttribute('data-id');
      const submission = submissions.find(s => (s.id || '') === submissionId);
      if (!submission || !submission.formHtml) return;
      showSubmissionPreview(submission.formHtml, submission.values, submission);
    });
  });

  // Attach baseline checkbox handlers
  submissionsListEl.querySelectorAll('.baseline-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', async (e) => {
      const submissionId = checkbox.getAttribute('data-id');
      const isChecked = checkbox.checked;
      if (!submissionId || !FORM_ID) return;

      try {
        const res = await fetch(`${API_BASE}/${FORM_ID}/submissions/${submissionId}/baseline?is_baseline=${isChecked}`, {
          method: 'PUT'
        });
        if (!res.ok) {
          // Revert checkbox if request failed
          checkbox.checked = !isChecked;
          throw new Error(`Failed to set baseline: ${res.statusText}`);
        }
        // Reload baseline submission so it's available for form scripts
        await loadBaselineSubmission(FORM_ID);
        // Reload submissions to reflect the change (uncheck others if one was checked)
        loadSubmissions(FORM_ID);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

// Switch view mode
submissionsViewMode?.addEventListener('change', () => {
  renderSubmissions(cachedSubmissions);
});

// default to table view on load if available
if (submissionsViewMode) {
  submissionsViewMode.value = 'table';
}

function showSubmissionPreview(html, values, submission = {}) {
  if (!submissionPreviewFrame) return;
  if (!submissionPreviewModal) {
    const modalEl = document.getElementById('submissionPreviewModal');
    if (modalEl && window.bootstrap) {
      submissionPreviewModal = new bootstrap.Modal(modalEl);
    }
  }

  const resultText = (submission.result || '').toUpperCase();

  const titleEl = document.getElementById('submissionPreviewLabel');
  if (titleEl) {
    const formName = submission.formName || formDef?.name || FORM_ID || 'Submission';
    const dt = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '';
    const resultTitle = resultText || '';
    const parts = [formName];
    if (dt) parts.push(dt);
    if (resultTitle) parts.push(resultTitle);
    titleEl.textContent = parts.join(' - ');
  }

  const doc = submissionPreviewFrame.contentDocument || submissionPreviewFrame.contentWindow.document;
  const resultBadge =
    resultText === 'PASS' ? 'bg-success' :
    resultText === 'WARNING' ? 'bg-warning text-dark' :
    resultText === 'FAIL' ? 'bg-danger' : 'bg-secondary';

  const comments = (submission.comments || '').trim();
  const scriptSrc = new URL('test_functions.js', window.location.href).href;
  const fullHtml = `<!DOCTYPE html>
  <html><head>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
  </head>
  <body>
    <div class="p-3">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="h6 mb-0">Submission Result</div>
        <span class="badge ${resultBadge}">${resultText || '—'}</span>
      </div>
      ${comments ? `<div class="alert alert-info mb-3"><strong>Comments:</strong><br><span style="white-space: pre-wrap;">${comments.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</span></div>` : ''}
      ${html}
    </div>
    <script src="${scriptSrc}"></script>
  </body></html>`;

  doc.open();
  doc.write(fullHtml);
  doc.close();

  // populate values and set readonly/disabled, and show per-field result badges
  const controls = doc.querySelectorAll('input, select, textarea');
  controls.forEach((el) => {
    // Skip file inputs - they can't have values set programmatically
    if (el.type === 'file') {
      // Hide file inputs in preview
      el.style.display = 'none';
      return;
    }
    
    const key = el.name || el.id;
    if (values && key && key in values) {
      el.value = values[key];
    }
    el.setAttribute('readonly', true);
    el.setAttribute('disabled', true);

    // attach result badge if present in metadata
    const fieldMeta = submission.metadata && key ? submission.metadata[key] : null;
    const fieldResult = fieldMeta && fieldMeta.result ? String(fieldMeta.result).toUpperCase() : '';
    if (fieldResult) {
      const badgeClass =
        fieldResult === 'PASS' ? 'bg-success' :
        fieldResult === 'WARNING' ? 'bg-warning text-dark' :
        fieldResult === 'FAIL' ? 'bg-danger' : 'bg-secondary';
      const badge = doc.createElement('span');
      badge.className = `badge ${badgeClass} ms-2`;
      badge.textContent = fieldResult;
      const parent = el.parentElement;
      if (parent) {
        parent.appendChild(badge);
      } else {
        el.insertAdjacentElement('afterend', badge);
      }
    }
  });

  // Handle file inputs: hide them and load image previews from metadata
  const fileInputs = doc.querySelectorAll('input[type="file"]');
  fileInputs.forEach((fileInput) => {
    // Hide file input
    fileInput.style.display = 'none';
    
    // Handle image previews using data attributes and metadata
    const fileType = fileInput.getAttribute('data-file-type');
    const targetElementId = fileInput.getAttribute('data-file-target-element-id');
    const inputName = fileInput.name || fileInput.id;
    
    if (fileType === 'image' && targetElementId && inputName && submission.metadata) {
      // Get fileData from metadata
      const fieldMeta = submission.metadata[inputName];
      if (fieldMeta && fieldMeta.fileData && typeof fieldMeta.fileData === 'string' && fieldMeta.fileData.startsWith('data:image')) {
        // Find the target image element and set its src
        const targetImg = doc.getElementById(targetElementId);
        if (targetImg) {
          targetImg.src = fieldMeta.fileData;
          targetImg.style.display = 'block';
        }
      }
    }
  });

  // add Trend buttons right next to number inputs
  const numberInputs = doc.querySelectorAll('input[type="number"]');
  numberInputs.forEach((el) => {
    const fieldKey = el.name || el.id || 'value';
    
    // Create Trend badge button
    const trendBtn = doc.createElement('button');
    trendBtn.type = 'button';
    trendBtn.className = 'badge bg-info text-dark border-0';
    trendBtn.style.cursor = 'pointer';
    trendBtn.style.marginLeft = '0';
    trendBtn.textContent = 'Trend';
    trendBtn.title = 'View trend chart';
    trendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.showPlotModalFromIframe) {
        window.showPlotModalFromIframe(fieldKey);
      }
    });
    
    // Insert right after the input element
    el.insertAdjacentElement('afterend', trendBtn);
  });

  if (submissionPreviewModal) {
    submissionPreviewModal.show();
  }
}

// exposed to iframe
window.showPlotModalFromIframe = (fieldKey) => showPlotModal(fieldKey);

function showPlotModal(fieldKey) {
  if (!plotCanvas) return;
  if (typeof Chart === 'undefined') {
    alert('Chart library not loaded. Please check network access.');
    return;
  }
  if (!submissionPlotModal) {
    const modalEl = document.getElementById('submissionPlotModal');
    if (modalEl && window.bootstrap) {
      submissionPlotModal = new bootstrap.Modal(modalEl);
    }
  }

  if (!cachedSubmissions || cachedSubmissions.length === 0) {
    alert('No submissions to plot.');
    return;
  }

  const points = [];
  cachedSubmissions.forEach((s) => {
    const val = s.values ? s.values[fieldKey] : undefined;
    const num = Number(val);
    if (!Number.isNaN(num) && s.submittedAt) {
      points.push({
        x: new Date(s.submittedAt),
        y: num
      });
    }
  });

  if (points.length === 0) {
    alert('No numeric values found for this field.');
    return;
  }

  points.sort((a, b) => a.x - b.x);

  if (plotChart) {
    plotChart.destroy();
  }

  plotChart = new Chart(plotCanvas, {
    type: 'line',
    data: {
      labels: points.map(p => p.x.toLocaleString()),
      datasets: [{
        label: fieldKey || 'Value',
        data: points.map(p => p.y),
        borderColor: 'rgba(54, 162, 235, 1)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });

  if (submissionPlotModal) {
    submissionPlotModal.show();
  }

  // reset maximize state when opening
  restorePlotSize();
}

function maximizePlot() {
  const modalEl = document.getElementById('submissionPlotModal');
  if (!modalEl) return;
  modalEl.classList.add('modal-fullscreen');
  const dialog = modalEl.querySelector('.modal-dialog');
  if (dialog) {
    dialog.classList.add('modal-fullscreen');
    dialog.style.position = 'fixed';
    dialog.style.left = '0';
    dialog.style.top = '0';
    dialog.style.margin = '0';
  }
  plotMaxBtn?.classList.add('d-none');
  plotRestoreBtn?.classList.remove('d-none');
}

function restorePlotSize() {
  const modalEl = document.getElementById('submissionPlotModal');
  if (!modalEl) return;
  modalEl.classList.remove('modal-fullscreen');
  const dialog = modalEl.querySelector('.modal-dialog');
  if (dialog) {
    dialog.classList.remove('modal-fullscreen');
    dialog.style.position = '';
    dialog.style.left = '';
    dialog.style.top = '';
    dialog.style.margin = '';
  }
  plotMaxBtn?.classList.remove('d-none');
  plotRestoreBtn?.classList.add('d-none');
}

plotMaxBtn?.addEventListener('click', maximizePlot);
plotRestoreBtn?.addEventListener('click', restorePlotSize);

// Basic drag-to-move when not fullscreen
if (plotModalEl && plotDragHandle) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const dialog = plotModalEl.querySelector('.modal-dialog');

  const onMouseDown = (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = dialog.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    dialog.style.position = 'fixed';
    dialog.style.margin = '0';
    dialog.style.left = `${startLeft}px`;
    dialog.style.top = `${startTop}px`;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    dialog.style.left = `${startLeft + dx}px`;
    dialog.style.top = `${startTop + dy}px`;
  };

  const onMouseUp = () => {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  plotDragHandle.addEventListener('mousedown', onMouseDown);

  plotModalEl.addEventListener('hidden.bs.modal', () => {
    // reset position when closing
    dialog.style.position = '';
    dialog.style.margin = '';
    dialog.style.left = '';
    dialog.style.top = '';
  });
}

// Load submissions when switching to the tab
document.getElementById('submissions-tab-btn')?.addEventListener('shown.bs.tab', () => {
  if (FORM_ID) {
    loadSubmissions(FORM_ID);
  }
});

function getResultForSubmit() {
  // Prefer aggregated field results; if none, fall back to current live display.
  const aggregated = aggregateFieldResults();
  if (aggregated && aggregated !== '—') return aggregated.toUpperCase();
  const displayed = (liveResultEl.textContent || '').trim().toUpperCase();
  return displayed || 'UNKNOWN';
}

/* --------------------------
   Collect data-* metadata per control
--------------------------- */
function getControlMetadata() {
  const meta = {};
  const controls = formEl.querySelectorAll('input, select, textarea');

  controls.forEach((el) => {
    const name = el.getAttribute('name') || el.id;
    if (!name) return;

    const datasetEntries = Object.entries(el.dataset || {});
    if (datasetEntries.length === 0) {
      meta[name] = {};
      return;
    }

    meta[name] = datasetEntries.reduce((acc, [key, val]) => {
      // Normalize result to uppercase to align with backend expectation
      if (key === 'result' && typeof val === 'string') {
        acc[key] = val.toUpperCase();
      } else {
        acc[key] = val;
      }
      return acc;
    }, {});
  });

  return meta;
}

/* --------------------------
   Enable/disable submit based on required fields
--------------------------- */
function updateSubmitEnabled() {
  if (!formEl || !submitBtn) return;

  const requiredInputs = formEl.querySelectorAll('input[required], textarea[required], select[required]');
  let allFilled = true;

  requiredInputs.forEach((el) => {
    if (el.value === null || el.value.trim() === '') {
      allFilled = false;
    }
  });

  submitBtn.disabled = !allFilled;
  submitBtn.title = allFilled ? '' : 'Fill all required fields to submit';
}

/* --------------------------
   Submit to backend
--------------------------- */
formEl.addEventListener("submit", async (e) => {
  e.preventDefault();

  const values = getFormValues();
  const metadata = getControlMetadata();
  const result = getResultForSubmit();
  const commentsEl = document.getElementById('submission-comments');
  const comments = commentsEl ? commentsEl.value.trim() : '';

  if (!FORM_ID) {
    alert('No form selected. Please select a form from the list.');
    return;
  }

  const res = await fetch(`${API_BASE}/${FORM_ID}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values, metadata, result, comments })
  });

  const data = await res.json();
  serverResponseEl.textContent = JSON.stringify(data, null, 2);

  setLiveResult((data.result || '').toUpperCase());
  
  // Clear comments field after successful submission
  if (commentsEl) {
    commentsEl.value = '';
  }
  
  // Refresh submissions list after submit
  loadSubmissions(FORM_ID);
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
