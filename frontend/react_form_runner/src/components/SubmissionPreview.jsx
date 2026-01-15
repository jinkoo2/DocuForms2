import React, { useEffect, useRef } from 'react';
import { fixFormHtml } from '../utils/formUtils';

function SubmissionPreview({ submission, onClose }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!iframeRef.current || !submission) return;

    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
    const resultText = (submission.result || '').toUpperCase();
    const resultBadge =
      resultText === 'PASS' ? 'bg-success' :
      resultText === 'WARNING' ? 'bg-warning text-dark' :
      resultText === 'FAIL' ? 'bg-danger' : 'bg-secondary';

    const comments = (submission.comments || '').trim();
    // Use the test_functions.js from the public directory (served as static asset)
    const scriptSrc = '/test_functions.js';
    
    // Use submissionHtml if available (it already has values filled in), otherwise fall back to formHtml
    let html = '';
    const useSubmissionHtml = submission.submissionHtml && submission.submissionHtml.trim();
    
    console.log('SubmissionPreview - submission data:', {
      submissionId: submission.id || submission._id,
      formId: submission.formId,
      hasSubmissionHtml: !!submission.submissionHtml,
      submissionHtmlLength: submission.submissionHtml?.length || 0,
      hasFormHtml: !!submission.formHtml,
      formHtmlLength: submission.formHtml?.length || 0,
      useSubmissionHtml
    });
    
    if (useSubmissionHtml) {
      html = submission.submissionHtml;
      console.log('SubmissionPreview - Using submissionHtml');
    } else {
      // Fallback to original form HTML (for backward compatibility with old submissions)
      html = submission.formHtml || '';
      console.log('SubmissionPreview - Using formHtml fallback, length:', html.length);
      html = fixFormHtml(html);
    }
    
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

    // Function to hide all delete buttons
    const hideDeleteButtons = () => {
      // Hide delete buttons by ID (from data-delete-button attribute)
      const fileInputs = doc.querySelectorAll('input[type="file"]');
      fileInputs.forEach((fileInput) => {
        const deleteButtonId = fileInput.getAttribute('data-delete-button');
        if (deleteButtonId) {
          const deleteBtn = doc.getElementById(deleteButtonId);
          if (deleteBtn) {
            deleteBtn.style.display = 'none';
          }
        }
      });
      
      // Hide all buttons that contain "delete" in text, id, or class
      const allButtons = doc.querySelectorAll('button');
      allButtons.forEach((btn) => {
        const btnText = (btn.textContent || '').toLowerCase().trim();
        const btnId = (btn.id || '').toLowerCase();
        const btnClass = (btn.className || '').toLowerCase();
        
        if (btnText === 'delete' || 
            btnText.includes('delete') || 
            btnId.includes('delete') || 
            btnClass.includes('delete') ||
            btnClass.includes('btn-outline-danger')) {
          btn.style.display = 'none';
        }
      });
    };

    // Only populate values manually if we're using the fallback (formHtml)
    // submissionHtml already has values filled in, so skip this step
    if (!useSubmissionHtml) {
      // Populate values and set readonly/disabled
      const controls = doc.querySelectorAll('input, select, textarea');
      controls.forEach((el) => {
        if (el.type === 'file') {
          el.style.display = 'none';
          return;
        }
        
        const key = el.name || el.id;
        if (submission.values && key && key in submission.values) {
          el.value = submission.values[key];
        }
        el.setAttribute('readonly', true);
        el.setAttribute('disabled', true);

        // Attach result badge if present in metadata
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
        fileInput.style.display = 'none';
        
        const fileType = fileInput.getAttribute('data-file-type');
        const targetElementId = fileInput.getAttribute('data-file-target-element-id');
        const downloadLinkId = fileInput.getAttribute('data-download-link');
        const fileListId = fileInput.getAttribute('data-file-list');
        const isMultiple = fileInput.hasAttribute('multiple');
        const inputName = fileInput.name || fileInput.id;
        
        // Get the value from submission
        if (inputName && submission.values && inputName in submission.values) {
          const value = submission.values[inputName];
          
          // Handle multi-file uploads
          if (isMultiple && fileListId) {
            try {
              let fileDataArray;
              if (typeof value === 'string') {
                fileDataArray = JSON.parse(value);
              } else if (Array.isArray(value)) {
                fileDataArray = value;
              } else {
                fileDataArray = [];
              }
              
              if (Array.isArray(fileDataArray) && fileDataArray.length > 0) {
                const fileListContainer = doc.getElementById(fileListId);
                if (fileListContainer) {
                  fileListContainer.innerHTML = '';
                  fileDataArray.forEach((fileData) => {
                    // Handle both old format (string URL) and new format (object)
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
                      const row = doc.createElement('div');
                      row.className = 'upload-row';
                      
                      const link = doc.createElement('a');
                      link.href = fileUrl;
                      link.target = '_blank';
                      link.textContent = `Download ${filename}`;
                      link.setAttribute('download', '');
                      
                      row.appendChild(link);
                      fileListContainer.appendChild(row);
                    }
                  });
                }
              }
            } catch (err) {
              console.warn('Error processing multi-file upload in preview:', err);
            }
          } else {
            // Handle single file upload
            let fileUrl, filename;
            if (typeof value === 'string') {
              try {
                const fileData = JSON.parse(value);
                if (typeof fileData === 'object' && fileData.url) {
                  fileUrl = fileData.url;
                  filename = fileData.originalName || fileUrl.split('/').pop();
                } else {
                  fileUrl = value;
                  filename = fileUrl.split('/').pop();
                }
              } catch {
                fileUrl = value;
                filename = fileUrl.split('/').pop();
              }
            } else {
              fileUrl = value;
              filename = fileUrl.split('/').pop();
            }
            
            // Set up download link to open in new tab
            if (downloadLinkId && fileUrl) {
              const downloadLink = doc.getElementById(downloadLinkId);
              if (downloadLink) {
                downloadLink.href = fileUrl;
                downloadLink.textContent = `Download ${filename}`;
                downloadLink.setAttribute('target', '_blank');
                downloadLink.style.display = 'inline-block';
                if (!downloadLink.hasAttribute('download')) {
                  downloadLink.setAttribute('download', '');
                }
              }
            }
          }
        }
        
        if (fileType === 'image' && targetElementId && inputName && submission.metadata) {
          const fieldMeta = submission.metadata[inputName];
          if (fieldMeta && fieldMeta.fileData && typeof fieldMeta.fileData === 'string' && fieldMeta.fileData.startsWith('data:image')) {
            const targetImg = doc.getElementById(targetElementId);
            if (targetImg) {
              targetImg.src = fieldMeta.fileData;
              targetImg.style.display = 'block';
            }
          }
        }
      });
    }
    
    // Also ensure all download links in the document open in new tab
    const allDownloadLinks = doc.querySelectorAll('a[href*="/uploads/"], a[id*="download"]');
    allDownloadLinks.forEach((link) => {
      link.setAttribute('target', '_blank');
      if (!link.hasAttribute('download')) {
        link.setAttribute('download', '');
      }
    });
    
    // Function to hide all progress bars (but not download links)
    const hideProgressBars = () => {
      // Hide progress bars by ID (from data-progress-bar attribute) - single file uploads
      const fileInputs = doc.querySelectorAll('input[type="file"]');
      fileInputs.forEach((fileInput) => {
        const progressBarId = fileInput.getAttribute('data-progress-bar');
        if (progressBarId) {
          const progressBar = doc.getElementById(progressBarId);
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
      const progressElements = doc.querySelectorAll('progress');
      progressElements.forEach((progress) => {
        progress.style.display = 'none';
      });
      
      // Hide progress bar divs (class "progress-bar")
      const progressBarDivs = doc.querySelectorAll('.progress-bar, [class*="progress-bar"]');
      progressBarDivs.forEach((bar) => {
        bar.style.display = 'none';
      });
      
      // Hide empty progress containers (divs with class "progress" that only contain progress bars)
      const progressContainers = doc.querySelectorAll('.progress');
      progressContainers.forEach((container) => {
        // Only hide if it only contains progress bars and no other meaningful content
        const children = Array.from(container.children);
        const hasNonProgressContent = children.some(
          child => !child.classList.contains('progress-bar') && 
                   child.tagName !== 'SCRIPT' &&
                   !(child.tagName === 'PROGRESS')
        );
        if (!hasNonProgressContent) {
          container.style.display = 'none';
        }
      });
    };

    // Hide delete buttons immediately
    hideDeleteButtons();
    
    // Hide progress bars immediately
    hideProgressBars();
    
    // Also hide delete buttons and progress bars after iframe loads (in case script adds them)
    const iframeWindow = iframeRef.current.contentWindow;
    if (iframeWindow) {
      iframeWindow.addEventListener('load', () => {
        setTimeout(() => {
          hideDeleteButtons();
          hideProgressBars();
        }, 100);
      });
    }
    
    // Use setTimeout as fallback to ensure buttons and progress bars are hidden after any async operations
    setTimeout(() => {
      hideDeleteButtons();
      hideProgressBars();
    }, 200);
    setTimeout(() => {
      hideDeleteButtons();
      hideProgressBars();
    }, 500);

    // Add Trend buttons for number inputs
    const numberInputs = doc.querySelectorAll('input[type="number"]');
    numberInputs.forEach((el) => {
      const fieldKey = el.name || el.id || 'value';
      const trendBtn = doc.createElement('button');
      trendBtn.type = 'button';
      trendBtn.className = 'badge bg-info text-dark border-0';
      trendBtn.style.cursor = 'pointer';
      trendBtn.style.marginLeft = '0';
      trendBtn.textContent = 'Trend';
      trendBtn.title = 'View trend chart';
      trendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Call parent window's function to show plot modal
        if (window.parent && window.parent.showPlotModalFromIframe) {
          window.parent.showPlotModalFromIframe(fieldKey);
        } else if (window.showPlotModalFromIframe) {
          window.showPlotModalFromIframe(fieldKey);
        }
      });
      el.insertAdjacentElement('afterend', trendBtn);
    });
  }, [submission]);

  if (!submission) return null;

  const formName = submission.formName || submission.formId || 'Submission';
  const dt = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '';
  const resultTitle = (submission.result || '').toUpperCase();
  const title = [formName, dt, resultTitle].filter(Boolean).join(' - ');

  return (
    <>
      <div className="modal fade show" style={{ display: 'block', zIndex: 1050 }} tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-xl modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body">
              <iframe
                ref={iframeRef}
                className="w-100 border-0"
                style={{ height: '70vh' }}
                title="Submission Preview"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} onClick={onClose}></div>
    </>
  );
}

export default SubmissionPreview;
