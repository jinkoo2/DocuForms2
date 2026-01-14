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
    
    // Exclude submission-comments from values - it's saved separately in the comments field
    // Also exclude any field that starts with 'submission-' to be safe
    if (key && key !== 'submission-comments' && !key.startsWith('submission-')) {
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
    // Skip the submission-comments element by id as well
    if (el.id === 'submission-comments') return;
    
    // Use id as primary key, fall back to name if id is not available
    const key = el.id || el.getAttribute('name');
    if (!key) return;
    
    // Exclude submission-comments from metadata - it's saved separately in the comments field
    // Also exclude any field that starts with 'submission-' to be safe
    if (key === 'submission-comments' || key.startsWith('submission-')) return;
    
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

export function generateSubmissionHtml(formHtml, values, metadata) {
  if (!formHtml) return '';
  
  try {
    // Create a temporary DOM element to manipulate the HTML
    const tempDiv = document.createElement('div');
    
    // If HTML includes body tag, extract body content; otherwise use as-is
    let htmlContent = formHtml;
    if (htmlContent.includes('<body')) {
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(htmlContent, 'text/html');
      htmlContent = tempDoc.body ? tempDoc.body.innerHTML : htmlContent;
    }
    
    // Set the HTML content to the temp div
    tempDiv.innerHTML = htmlContent;
    
    const container = tempDiv;
    
    // Fill in values for all form controls
    const controls = container.querySelectorAll('input, select, textarea');
    controls.forEach((el) => {
      const key = el.id || el.name;
      if (!key || key === 'submission-comments' || key.startsWith('submission-')) {
        return;
      }
      
      // Skip file inputs - they can't have values set programmatically
      if (el.type === 'file') {
        // Hide file inputs
        el.style.display = 'none';
        return;
      }
      
      // Set the value if it exists in the values object
      if (key in values) {
        el.value = values[key];
        // Also set the value attribute to ensure it's preserved in innerHTML
        el.setAttribute('value', values[key]);
      }
      
      // Make fields readonly/disabled to show they're submitted values
      el.setAttribute('readonly', 'true');
      el.setAttribute('disabled', 'true');
      
      // Add result badge if present in metadata
      const fieldMeta = metadata && metadata[key];
      if (fieldMeta && fieldMeta.result) {
        const result = String(fieldMeta.result).toUpperCase();
        const badgeClass =
          result === 'PASS' ? 'bg-success' :
          result === 'WARNING' ? 'bg-warning text-dark' :
          result === 'FAIL' ? 'bg-danger' : 'bg-secondary';
        
        const badge = document.createElement('span');
        badge.className = `badge ${badgeClass} ms-2`;
        badge.textContent = result;
        
        // Insert badge after the input
        const parent = el.parentElement;
        if (parent) {
          parent.appendChild(badge);
        } else {
          el.insertAdjacentElement('afterend', badge);
        }
      }
    });
    
    // Handle file inputs - show download links for uploaded files
    const fileInputs = container.querySelectorAll('input[type="file"]');
    fileInputs.forEach((fileInput) => {
      const key = fileInput.id || fileInput.name;
      if (!key) return;
      
      // Hide the file input
      fileInput.style.display = 'none';
      
      // Check if we have a value for this file input
      if (key in values && values[key]) {
        const value = values[key];
        const fileType = fileInput.getAttribute('data-file-type');
        const downloadLinkId = fileInput.getAttribute('data-download-link');
        const fileListId = fileInput.getAttribute('data-file-list');
        const isMultiple = fileInput.hasAttribute('multiple');
        
        // Handle multi-file uploads (JSON array)
        if (isMultiple && fileListId) {
          try {
            // Parse JSON array string if needed
            let fileUrls;
            if (typeof value === 'string') {
              try {
                fileUrls = JSON.parse(value);
              } catch (e) {
                console.warn('Failed to parse JSON array:', e);
                fileUrls = [];
              }
            } else if (Array.isArray(value)) {
              fileUrls = value;
            } else {
              fileUrls = [];
            }
            
            if (Array.isArray(fileUrls) && fileUrls.length > 0) {
              const fileListContainer = container.querySelector(`#${fileListId}`);
              if (fileListContainer) {
                // Clear existing content
                fileListContainer.innerHTML = '';
                
                // Create a row for each file
                fileUrls.forEach((fileData) => {
                  // Handle both old format (string URL) and new format (object with url and originalName)
                  let fileUrl, filename;
                  if (typeof fileData === 'string') {
                    fileUrl = fileData;
                    filename = fileUrl.split('/').pop();
                  } else if (fileData && typeof fileData === 'object') {
                    fileUrl = fileData.url;
                    filename = fileData.originalName || fileUrl.split('/').pop();
                  } else {
                    return;
                  }
                  
                  if (fileUrl) {
                    const row = document.createElement('div');
                    row.className = 'upload-row';
                    
                    const link = document.createElement('a');
                    link.href = fileUrl;
                    link.target = '_blank';
                    link.textContent = `Download ${filename}`;
                    link.setAttribute('download', '');
                    
                    row.appendChild(link);
                    fileListContainer.appendChild(row);
                  }
                });
              } else {
                console.warn(`File list container #${fileListId} not found`);
              }
            }
          } catch (err) {
            console.error('Error handling multi-file upload:', err, value);
          }
        } else {
          // Handle single file upload
          // Handle both old format (string URL) and new format (JSON object with url and originalName)
          let fileUrl, filename;
          if (typeof value === 'string') {
            try {
              // Try to parse as JSON first
              const fileData = JSON.parse(value);
              if (typeof fileData === 'object' && fileData.url) {
                fileUrl = fileData.url;
                filename = fileData.originalName || fileUrl.split('/').pop();
              } else {
                fileUrl = value;
                filename = fileUrl.split('/').pop();
              }
            } catch {
              // Not JSON, treat as old format (string URL)
              fileUrl = value;
              filename = fileUrl.split('/').pop();
            }
          } else {
            fileUrl = value;
            filename = fileUrl.split('/').pop();
          }
          
          // If it's an image and we have a target element, show the image
          if (fileType === 'image' && fileUrl && fileUrl.startsWith('data:image')) {
            const targetElementId = fileInput.getAttribute('data-file-target-element-id');
            if (targetElementId) {
              const targetImg = container.querySelector(`#${targetElementId}`);
              if (targetImg) {
                targetImg.src = fileUrl;
                targetImg.style.display = 'block';
              }
            }
          }
          
          // Show download link if available
          if (downloadLinkId && fileUrl) {
            const downloadLink = container.querySelector(`#${downloadLinkId}`);
            if (downloadLink) {
              downloadLink.href = fileUrl;
              downloadLink.textContent = `Download ${filename}`;
              downloadLink.style.display = 'inline-block';
              downloadLink.setAttribute('target', '_blank');
              // Ensure it has download attribute for proper file download behavior
              if (!downloadLink.hasAttribute('download')) {
                downloadLink.setAttribute('download', '');
              }
            }
          }
        }
        
        // Hide delete button if it exists
        const deleteButtonId = fileInput.getAttribute('data-delete-button');
        if (deleteButtonId) {
          const deleteBtn = container.querySelector(`#${deleteButtonId}`);
          if (deleteBtn) {
            deleteBtn.style.display = 'none';
          }
        }
      }
    });
    
    // Hide all delete buttons in file upload rows (for multi-file uploads)
    const allDeleteButtons = container.querySelectorAll('button');
    allDeleteButtons.forEach((btn) => {
      const btnText = (btn.textContent || '').toLowerCase().trim();
      const btnId = btn.id || '';
      const btnClass = btn.className || '';
      if (btnText === 'delete' || btnId.includes('delete') || btnClass.includes('delete')) {
        btn.style.display = 'none';
      }
    });
    
    // Hide all progress bars (but not download links)
    const fileInputsForProgress = container.querySelectorAll('input[type="file"]');
    fileInputsForProgress.forEach((fileInput) => {
      const progressBarId = fileInput.getAttribute('data-progress-bar');
      if (progressBarId) {
        const progressBar = container.querySelector(`#${progressBarId}`);
        if (progressBar) {
          progressBar.style.display = 'none';
          // Hide the parent progress container only if it only contains the progress bar
          const progressContainer = progressBar.parentElement;
          if (progressContainer && progressContainer.classList.contains('progress')) {
            // Only hide if it's a simple progress container (not containing other elements)
            const hasOtherElements = Array.from(progressContainer.children).some(
              child => child !== progressBar && child.tagName !== 'SCRIPT'
            );
            if (!hasOtherElements) {
              progressContainer.style.display = 'none';
            }
          }
        }
      }
    });
    
    // Hide all <progress> elements (for multi-file uploads)
    const progressElements = container.querySelectorAll('progress');
    progressElements.forEach((progress) => {
      progress.style.display = 'none';
    });
    
    // Hide progress bar divs (class "progress-bar")
    const progressBarDivs = container.querySelectorAll('.progress-bar, [class*="progress-bar"]');
    progressBarDivs.forEach((bar) => {
      bar.style.display = 'none';
    });
    
    // Hide empty progress containers (divs with class "progress" that only contain progress bars)
    const progressContainers = container.querySelectorAll('.progress');
    progressContainers.forEach((progressContainer) => {
      // Only hide if it only contains progress bars and no other meaningful content
      const children = Array.from(progressContainer.children);
      const hasNonProgressContent = children.some(
        child => !child.classList.contains('progress-bar') && 
                 child.tagName !== 'SCRIPT' &&
                 !(child.tagName === 'PROGRESS')
      );
      if (!hasNonProgressContent) {
        progressContainer.style.display = 'none';
      }
    });
    
    // Return the HTML string from the container
    let result = container.innerHTML;
    
    // Debug: log container state
    if (!result || result.trim() === '') {
      console.warn('generateSubmissionHtml: container.innerHTML was empty', {
        containerChildren: container.children.length,
        htmlContent: htmlContent.substring(0, 200)
      });
      // If innerHTML is empty, try to get the HTML differently
      result = htmlContent;
    }
    
    // If still empty, return the original formHtml
    if (!result || result.trim() === '') {
      console.warn('generateSubmissionHtml: result is still empty, returning original formHtml');
      return formHtml;
    }
    
    return result;
  } catch (err) {
    console.error('Error generating submission HTML:', err, formHtml);
    return formHtml; // Return original HTML on error
  }
}
