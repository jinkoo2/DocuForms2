// Test functions for form evaluation
// These need to be available globally for form scripts

// Function to get server URL
// For static/public version, this will be set via window.BACKEND_URL
// For Vite/module version, it will use import.meta.env
function get_server_url() {
  // Try to get from window first (for static/public version)
  if (typeof window !== 'undefined' && window.BACKEND_URL) {
    return window.BACKEND_URL;
  }
  // Try to get from import.meta.env (for Vite/module version)
  // Note: This will only work in Vite/modern bundler contexts
  // In static/public context, window.BACKEND_URL should be set
  try {
    // eslint-disable-next-line no-undef
    if (import.meta && import.meta.env && import.meta.env.VITE_BACKEND_URL) {
      // eslint-disable-next-line no-undef
      return import.meta.env.VITE_BACKEND_URL;
    }
  } catch (e) {
    // import.meta not available (e.g., in static context)
  }
  // Fallback
  return 'http://localhost:8001';
}

function _eid(id) {
  return document.getElementById(id);
}

function baseline() {
  console.log('baseline', window.baselineSubmission);
  return window.baselineSubmission;
}

function baseline_values() {
  const values = window.baselineSubmission?.values ?? null;
  console.log('baseline_values', values);
  return values;
}

function get_baseline_value(fieldName, fallbackInputId) {
  let b = null;

  // 1) Try baseline submission
  if (typeof baseline_values === 'function') {
    const base = baseline_values();
    if (base && base[fieldName] !== undefined) {
      b = parseFloat(base[fieldName]);
    }
  }

  // 2) Fallback to baseline input field
  if ((b === null || isNaN(b)) && fallbackInputId) {
    const el = _eid(fallbackInputId);
    if (el && el.value !== '') {
      b = parseFloat(el.value);
    }
  }

  return isNaN(b) ? null : b;
}

function calc_percent_error({
  inputId,
  baselineField,
  baselineInputId,
  outputId
}) {
  const a = parseFloat(_eid(inputId)?.value);
  const b = get_baseline_value(baselineField, baselineInputId);
  const out = _eid(outputId);

  if (!out) return;

  if (!isNaN(a) && b !== null && b !== 0) {
    const err = (a - b) / b * 100.0;
    out.value = err.toFixed(2);
  } else {
    // No valid baseline yet → neutral state
    out.value = '';
    out.dataset.result = 'PASS';
  }
}

function autofill_baseline(fieldName, targetInputId) {
  if (typeof baseline_values !== 'function') return;

  const base = baseline_values();
  if (base && base[fieldName] !== undefined) {
    const el = _eid(targetInputId);
    if (el) {
      el.value = base[fieldName];
    }
  }
}

function eval_form(caller_control) {
  try {
    console.log('eval_form', caller_control);

    const form = _eid('form');
    if (!form) {
      console.warn('eval_form: form element not found');
      return;
    }

    const controls = form.querySelectorAll('input, select');
    controls.forEach(control => {
      try {
        run_control_script(control);
      } catch (err) {
        console.error('Error running control script:', err, control);
      }
    });

    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
      try {
        test_input_pass_warning_fail(input);
      } catch (err) {
        console.error('Error testing input:', err, input);
      }
    });
  } catch (err) {
    console.error('Error in eval_form:', err);
  }
}

function run_control_script(control) {
  const script = control.dataset.script;
  console.log('script', script);

  if (!script) return;

  try {
    const fn = new Function('self', script);
    fn(control);
  } catch (err) {
    console.error('Error evaluating data-script for', control, err);
  }
}

function test_input_pass_warning_fail(input) {
  try {
    if (!input || input.value === '') {
      if (input?.nextElementSibling) {
        input.nextElementSibling.textContent = '';
      }
      if (input) input.dataset.result = '';
      return;
    }

    const v = Number(input.value);
    if (Number.isNaN(v)) return;

    const inRange = r => {
      if (!r) return false;
      try {
        const [min, max] = r.split(':').map(Number);
        if (Number.isNaN(min) || Number.isNaN(max)) return false;
        return v >= min && v <= max;
      } catch (err) {
        console.error('Error parsing range:', r, err);
        return false;
      }
    };

    if (!input.dataset.passRange && !input.dataset.warningRange) {
      return;
    }

    let result = 'FAIL';
    let color = 'red';

    if (inRange(input.dataset.passRange)) {
      result = 'PASS';
      color = 'green';
    } else if (inRange(input.dataset.warningRange)) {
      result = 'WARNING';
      color = 'orange';
    }

    const output = input.nextElementSibling;
    if (output && output.tagName) {
      try {
        output.textContent = result.toUpperCase();
        output.style.color = color;
      } catch (err) {
        console.error('Error updating output element:', err);
      }
    }

    if (input) {
      input.dataset.result = result.toUpperCase();
    }
  } catch (err) {
    console.error('Error in test_input_pass_warning_fail:', err, input);
  }
}

// File upload functions with progress bars

// Upload with XMLHttpRequest (required for progress tracking)
function uploadFileWithProgress(file, hidden, link, deleteBtn, progressBar) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const serverUrl = get_server_url();
    const formData = new FormData();

    formData.append('file', file);

    xhr.open('POST', `${serverUrl}/api/upload`, true);

    // Progress
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.round((e.loaded / e.total) * 100);

      if (progressBar) {
        progressBar.style.width = percent + '%';
        if (progressBar.parentElement) {
          progressBar.parentElement.style.display = 'block';
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error('Upload failed'));
        return;
      }

      const data = JSON.parse(xhr.responseText);
      const fileUrl = `${serverUrl}${data.url}`;
      const originalName = data.originalName || file.name;

      if (hidden) {
        // Store as JSON object with url and originalName
        const fileData = JSON.stringify({ url: fileUrl, originalName: originalName });
        hidden.value = fileData;
        hidden.setAttribute('value', fileData);
        // Also store originalName in data attribute for easy access
        hidden.setAttribute('data-original-name', originalName);
      }

      if (link) {
        updateDownloadUI(hidden, link, deleteBtn, originalName);
      }

      // Finish animation
      if (progressBar) {
        setTimeout(() => {
          if (progressBar.parentElement) {
            progressBar.parentElement.style.display = 'none';
          }
          progressBar.style.width = '0%';
        }, 400);
      }

      resolve(data);
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

// UI helpers for download/delete
function updateDownloadUI(hidden, link, deleteBtn, filename = 'file') {
  if (!hidden || !link) return;
  
  const hasFile = hidden.value && hidden.value.trim() !== '';

  if (hasFile) {
    // Handle both old format (string URL) and new format (JSON object)
    let fileUrl, displayName;
    try {
      const fileData = JSON.parse(hidden.value);
      if (typeof fileData === 'object' && fileData.url) {
        fileUrl = fileData.url;
        displayName = fileData.originalName || filename;
      } else {
        fileUrl = hidden.value;
        displayName = filename;
      }
    } catch {
      // Not JSON, treat as old format (string URL)
      fileUrl = hidden.value;
      displayName = filename || hidden.getAttribute('data-original-name') || 'file';
    }
    
    link.href = fileUrl;
    link.textContent = `Download ${displayName}`;
    link.style.display = 'inline-block';
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-block';
    }
  } else {
    link.style.display = 'none';
    link.removeAttribute('href');
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
    }
  }
}

// Delete file (clears hidden input and UI)
async function deleteFile(hidden, link, deleteBtn, progressBar) {
  if (!hidden || !hidden.value) return;
  if (!confirm('Delete uploaded file?')) return;

  try {
    const serverUrl = get_server_url();
    // Extract URL from value (handle both old string format and new JSON format)
    let fileUrl = hidden.value;
    try {
      const fileData = JSON.parse(hidden.value);
      if (typeof fileData === 'object' && fileData.url) {
        fileUrl = fileData.url;
      }
    } catch {
      // Not JSON, use value as-is
    }
    
    await fetch(`${serverUrl}/api/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: fileUrl })
    });
  } catch {
    console.warn('Delete API failed, clearing locally');
  }

  hidden.value = '';
  hidden.setAttribute('value', '');

  if (progressBar) {
    progressBar.style.width = '0%';
    if (progressBar.parentElement) {
      progressBar.parentElement.style.display = 'none';
    }
  }

  updateDownloadUI(hidden, link, deleteBtn);
}

// Auto-wire single file uploads
function initAutoFileUploads() {
  document
    .querySelectorAll('input[type="file"][data-upload-target]:not([multiple])')
    .forEach(input => {
      const hidden = document.getElementById(input.dataset.uploadTarget);
      const link = document.getElementById(input.dataset.downloadLink);
      const deleteBtn = input.dataset.deleteButton ? document.getElementById(input.dataset.deleteButton) : null;
      const progressBar = input.dataset.progressBar ? document.getElementById(input.dataset.progressBar) : null;

      if (!hidden || !link) return;

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          await uploadFileWithProgress(
            file,
            hidden,
            link,
            deleteBtn,
            progressBar
          );
        } catch (err) {
          console.error(err);
          alert('Upload failed');
        }
      });

      if (deleteBtn) {
        deleteBtn.addEventListener('click', () =>
          deleteFile(hidden, link, deleteBtn, progressBar)
        );
      }

      // Restore on load
      updateDownloadUI(hidden, link, deleteBtn);
    });
}

// Multi-file upload helpers
function readJsonArray(hidden) {
  if (!hidden) return [];
  try {
    return JSON.parse(hidden.value || '[]');
  } catch {
    return [];
  }
}

function writeJsonArray(hidden, arr) {
  if (!hidden) return;
  hidden.value = JSON.stringify(arr);
  hidden.setAttribute('value', hidden.value);
}

function uploadSingleFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const serverUrl = get_server_url();
    const formData = new FormData();

    formData.append('file', file);

    xhr.open('POST', `${serverUrl}/api/upload`, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error('Upload failed'));
        return;
      }
      const data = JSON.parse(xhr.responseText);
      resolve({
        url: `${serverUrl}${data.url}`,
        originalName: data.originalName || file.name
      });
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

function renderFileRow({ url, filename, onDelete }) {
  const row = document.createElement('div');
  row.className = 'upload-row';

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.textContent = `Download ${filename}`;

  const progress = document.createElement('progress');
  progress.max = 100;
  progress.value = 0;

  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = 'Delete';
  del.className = 'btn btn-sm btn-outline-danger';

  del.onclick = () => {
    if (!confirm('Delete file?')) return;
    onDelete();
    row.remove();
  };

  row.append(progress, link, del);
  return { row, progress };
}

// Auto-wire multi-file uploads
function initMultiFileUploads() {
  document
    .querySelectorAll('input[type="file"][multiple][data-upload-target]')
    .forEach(input => {
      const hidden = document.getElementById(input.dataset.uploadTarget);
      const list = document.getElementById(input.dataset.fileList);
      if (!hidden || !list) return;

      // Restore existing file data (edit mode)
      // Only restore if the list is empty (to avoid duplicates when viewing submissions)
      if (list.children.length === 0) {
        readJsonArray(hidden).forEach(fileData => {
          // Handle both old format (string URL) and new format (object with url and originalName)
          let url, filename;
          if (typeof fileData === 'string') {
            url = fileData;
            filename = url.split('/').pop();
          } else {
            url = fileData.url;
            filename = fileData.originalName || url.split('/').pop();
          }
          const { row } = renderFileRow({
            url,
            filename,
            onDelete: () => {
              const arr = readJsonArray(hidden).filter(f => {
                const fUrl = typeof f === 'string' ? f : f.url;
                return fUrl !== url;
              });
              writeJsonArray(hidden, arr);
            }
          });
          list.appendChild(row);
        });
      }

      // Handle new uploads
      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        input.value = ''; // allow re-select same file

        for (const file of files) {
          const { row, progress } = renderFileRow({
            url: '#',
            filename: file.name,
            onDelete: () => {}
          });

          list.appendChild(row);

          try {
            const fileData = await uploadSingleFile(file, p => {
              progress.value = p;
            });

            const arr = readJsonArray(hidden);
            arr.push(fileData);
            writeJsonArray(hidden, arr);

            row.querySelector('a').href = fileData.url;
            row.querySelector('a').textContent = `Download ${fileData.originalName}`;
            progress.remove();

            row.querySelector('button').onclick = () => {
              if (!confirm('Delete file?')) return;
              writeJsonArray(
                hidden,
                readJsonArray(hidden).filter(f => {
                  const fUrl = typeof f === 'string' ? f : f.url;
                  return fUrl !== fileData.url;
                })
              );
              row.remove();
            };

          } catch (err) {
            console.error(err);
            row.remove();
            alert(`Failed to upload ${file.name}`);
          }
        }
      });
    });
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window._eid = _eid;
  window.baseline = baseline;
  window.baseline_values = baseline_values;
  window.get_baseline_value = get_baseline_value;
  window.calc_percent_error = calc_percent_error;
  window.autofill_baseline = autofill_baseline;
  window.eval_form = eval_form;
  window.run_control_script = run_control_script;
  window.test_input_pass_warning_fail = test_input_pass_warning_fail;
  window.get_server_url = get_server_url;
  window.uploadFileWithProgress = uploadFileWithProgress;
  window.updateDownloadUI = updateDownloadUI;
  window.deleteFile = deleteFile;
  window.initAutoFileUploads = initAutoFileUploads;
  window.readJsonArray = readJsonArray;
  window.writeJsonArray = writeJsonArray;
  window.uploadSingleFile = uploadSingleFile;
  window.renderFileRow = renderFileRow;
  window.initMultiFileUploads = initMultiFileUploads;
  
  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAutoFileUploads();
      initMultiFileUploads();
    });
  } else {
    initAutoFileUploads();
    initMultiFileUploads();
  }
}

export {
  _eid,
  baseline,
  baseline_values,
  get_baseline_value,
  calc_percent_error,
  autofill_baseline,
  eval_form,
  run_control_script,
  test_input_pass_warning_fail,
  get_server_url,
  uploadFileWithProgress,
  updateDownloadUI,
  deleteFile,
  initAutoFileUploads,
  readJsonArray,
  writeJsonArray,
  uploadSingleFile,
  renderFileRow,
  initMultiFileUploads
};
