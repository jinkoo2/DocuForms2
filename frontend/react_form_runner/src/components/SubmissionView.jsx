import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSubmissions } from '../utils/api';
import { fixFormHtml } from '../utils/formUtils';

function SubmissionView() {
  const { formId, submissionId } = useParams();
  const iframeRef = useRef(null);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadSubmission = async () => {
      try {
        setLoading(true);
        // First try to get from sessionStorage (if opened from SubmissionsList)
        const storedData = sessionStorage.getItem(`submission_${submissionId}`);
        if (storedData) {
          const parsed = JSON.parse(storedData);
          setSubmission(parsed);
          sessionStorage.removeItem(`submission_${submissionId}`); // Clean up
        } else {
          // Fallback: fetch all submissions and find the one we need
          const submissions = await fetchSubmissions(formId);
          const found = submissions.find(s => (s.id || s._id) === submissionId);
          if (found) {
            setSubmission(found);
          } else {
            setError('Submission not found');
          }
        }
      } catch (err) {
        console.error('Error loading submission:', err);
        setError(`Failed to load submission: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (formId && submissionId) {
      loadSubmission();
    }
  }, [formId, submissionId]);

  useEffect(() => {
    if (!iframeRef.current || !submission) return;

    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
    const resultText = (submission.result || '').toUpperCase();
    const resultBadge =
      resultText === 'PASS' ? 'bg-success' :
      resultText === 'WARNING' ? 'bg-warning text-dark' :
      resultText === 'FAIL' ? 'bg-danger' : 'bg-secondary';

    const comments = (submission.comments || '').trim();
    const scriptSrc = '/test_functions.js';
    
    let html = '';
    const useSubmissionHtml = submission.submissionHtml && submission.submissionHtml.trim();
    
    if (useSubmissionHtml) {
      html = submission.submissionHtml;
    } else {
      html = submission.formHtml || '';
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

    // Hide delete buttons and progress bars (same logic as SubmissionPreview)
    const hideDeleteButtons = () => {
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

    const hideProgressBars = () => {
      const fileInputs = doc.querySelectorAll('input[type="file"]');
      fileInputs.forEach((fileInput) => {
        const progressBarId = fileInput.getAttribute('data-progress-bar');
        if (progressBarId) {
          const progressBar = doc.getElementById(progressBarId);
          if (progressBar) {
            progressBar.style.display = 'none';
          }
        }
      });
      
      const progressElements = doc.querySelectorAll('progress');
      progressElements.forEach((progress) => {
        progress.style.display = 'none';
      });
      
      const progressBarDivs = doc.querySelectorAll('.progress-bar, [class*="progress-bar"]');
      progressBarDivs.forEach((bar) => {
        bar.style.display = 'none';
      });
    };

    if (!useSubmissionHtml) {
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

      // Handle file inputs
      const fileInputs = doc.querySelectorAll('input[type="file"]');
      fileInputs.forEach((fileInput) => {
        fileInput.style.display = 'none';
        
        const fileType = fileInput.getAttribute('data-file-type');
        const targetElementId = fileInput.getAttribute('data-file-target-element-id');
        const downloadLinkId = fileInput.getAttribute('data-download-link');
        const fileListId = fileInput.getAttribute('data-file-list');
        const isMultiple = fileInput.hasAttribute('multiple');
        const inputName = fileInput.name || fileInput.id;
        
        if (inputName && submission.values && inputName in submission.values) {
          const value = submission.values[inputName];
          
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
              console.warn('Error processing multi-file upload:', err);
            }
          } else {
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
    
    const allDownloadLinks = doc.querySelectorAll('a[href*="/uploads/"], a[id*="download"]');
    allDownloadLinks.forEach((link) => {
      link.setAttribute('target', '_blank');
      if (!link.hasAttribute('download')) {
        link.setAttribute('download', '');
      }
    });
    
    hideDeleteButtons();
    hideProgressBars();
    
    setTimeout(() => {
      hideDeleteButtons();
      hideProgressBars();
    }, 200);
    setTimeout(() => {
      hideDeleteButtons();
      hideProgressBars();
    }, 500);

    // Add Trend buttons for number inputs
    const addTrendButtons = () => {
      const numberInputs = doc.querySelectorAll('input[type="number"]');
      console.log('Found number inputs:', numberInputs.length);
      numberInputs.forEach((el) => {
        // Check if Trend button already exists
        const existingTrendBtn = el.nextElementSibling;
        if (existingTrendBtn && existingTrendBtn.textContent === 'Trend') {
          return; // Already has a Trend button
        }
        
        const fieldKey = el.name || el.id || 'value';
        const trendBtn = doc.createElement('button');
        trendBtn.type = 'button';
        trendBtn.className = 'badge bg-info text-dark border-0';
        trendBtn.style.cursor = 'pointer';
        trendBtn.style.marginLeft = '8px';
        trendBtn.style.display = 'inline-block';
        trendBtn.textContent = 'Trend';
        trendBtn.title = 'View trend chart';
        trendBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Open trend plot in a new tab
          const url = `/trend/${formId}/${encodeURIComponent(fieldKey)}`;
          window.open(url, '_blank');
        });
        el.insertAdjacentElement('afterend', trendBtn);
        console.log('Added Trend button for field:', fieldKey);
      });
    };

    // Add Trend buttons after iframe loads
    const iframeWindow = iframeRef.current.contentWindow;
    if (iframeWindow) {
      iframeWindow.addEventListener('load', () => {
        setTimeout(() => {
          addTrendButtons();
        }, 100);
      });
    }

    // Add Trend buttons after delays to ensure form is fully rendered
    setTimeout(() => {
      addTrendButtons();
    }, 100);
    setTimeout(() => {
      addTrendButtons();
    }, 300);
    setTimeout(() => {
      addTrendButtons();
    }, 600);
  }, [submission, formId]);

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">Loading submission...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="container mt-4">
        <div className="alert alert-warning">Submission not found</div>
      </div>
    );
  }

  const formName = submission.formName || submission.formId || 'Submission';
  const dt = submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '';
  const resultTitle = (submission.result || '').toUpperCase();
  const title = [formName, dt, resultTitle].filter(Boolean).join(' - ');

  return (
    <div className="container-fluid p-0">
      <div className="bg-dark text-white p-3">
        <h5 className="mb-0">{title}</h5>
      </div>
      <iframe
        ref={iframeRef}
        className="w-100 border-0"
        style={{ height: 'calc(100vh - 80px)' }}
        title="Submission View"
      />
    </div>
  );
}

export default SubmissionView;
