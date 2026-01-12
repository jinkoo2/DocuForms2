import { UPLOAD_API_BASE, BACKEND_BASE } from './api';

export function fixFormHtml(html) {
  // Fix upload URLs - replace relative /api/upload with full URL
  html = html.replace(/'\/api\/upload'/g, `'${UPLOAD_API_BASE}/upload'`);
  html = html.replace(/"\/api\/upload"/g, `"${UPLOAD_API_BASE}/upload"`);
  html = html.replace(/fetch\(['"]\/api\/upload['"]/g, `fetch('${UPLOAD_API_BASE}/upload'`);
  
  // Fix download links - replace relative /uploads/ with full backend URL
  html = html.replace(/href=["']\/uploads\//g, (match) => {
    const quote = match.includes('"') ? '"' : "'";
    return `href=${quote}${BACKEND_BASE}/uploads/`;
  });
  
  return html;
}

export function getFormValues(formElement) {
  const values = {};
  
  // Collect from all form controls using id as the key (or name if id is not available)
  const controls = formElement.querySelectorAll('input, select, textarea');
  controls.forEach((el) => {
    // Skip file inputs - handled separately
    if (el.type === 'file') {
      return;
    }
    
    // Skip disabled/readonly hidden fields that might be placeholders
    if (el.type === 'hidden' && (el.disabled || el.readOnly)) {
      return;
    }
    
    // Use id as primary key, fall back to name if id is not available
    const key = el.id || el.name;
    if (key) {
      values[key] = el.value;
    }
  });
  
  // Collect file data from data attributes on file inputs
  const fileInputs = formElement.querySelectorAll('input[type="file"][data-file-data]');
  fileInputs.forEach((fileInput) => {
    const fileData = fileInput.getAttribute('data-file-data');
    const fileType = fileInput.getAttribute('data-file-type');
    // Use id as primary key, fall back to name if id is not available
    const key = fileInput.id || fileInput.name;
    if (key && fileData) {
      values[key] = fileData;
      if (fileType) {
        values[`${key}_type`] = fileType;
      }
    }
  });
  
  return values;
}

export function getControlMetadata(formElement) {
  const meta = {};
  const controls = formElement.querySelectorAll('input, select, textarea');
  
  controls.forEach((el) => {
    // Use id as primary key, fall back to name if id is not available
    const key = el.id || el.getAttribute('name');
    if (!key) return;
    
    const datasetEntries = Object.entries(el.dataset || {});
    if (datasetEntries.length === 0) {
      meta[key] = {};
      return;
    }
    
    meta[key] = datasetEntries.reduce((acc, [key, val]) => {
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

export function getResultForSubmit(formElement, liveResult) {
  // Collect all field results
  const controls = formElement.querySelectorAll('input, select, textarea');
  const results = [];
  
  controls.forEach((el) => {
    const result = el.dataset?.result;
    if (result && result.trim()) {
      results.push(result.toUpperCase());
    }
  });
  
  if (results.length === 0) {
    // No field results found, return empty string
    return '';
  }
  
  // Form result logic:
  // 1. If ANY field is FAIL, form result is FAIL
  // 2. Else if ANY field is WARNING, form result is WARNING
  // 3. Else if ALL fields are PASS, form result is PASS
  // 4. Otherwise, empty string
  
  if (results.some(r => r === 'FAIL')) {
    return 'FAIL';
  } else if (results.some(r => r === 'WARNING')) {
    return 'WARNING';
  } else if (results.every(r => r === 'PASS')) {
    return 'PASS';
  }
  
  return '';
}
