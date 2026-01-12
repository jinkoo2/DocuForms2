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
    const html = submission.formHtml || '';
    const fixedHtml = fixFormHtml(html);
    
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
    ${fixedHtml}
  </div>
  <script src="${scriptSrc}"></script>
</body></html>`;

    doc.open();
    doc.write(fullHtml);
    doc.close();

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
      const inputName = fileInput.name || fileInput.id;
      
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
