import React, { useState, useEffect, useRef } from 'react';
import { formatHtml } from '../utils/formBuilderUtils';
import { fixFormHtml } from '../utils/formUtils';

function EditorMain({ html, onHtmlChange, loading }) {
  const [sourceWidth, setSourceWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const previewFrameRef = useRef(null);
  const resizerRef = useRef(null);

  useEffect(() => {
    updatePreview(html);
  }, [html]);

  const updatePreview = (htmlContent) => {
    if (!previewFrameRef.current) return;

    // Use fixFormHtml to ensure proper form structure
    const fixedHtml = fixFormHtml(htmlContent || '');
    
    // Extract body content if HTML includes body tag
    let htmlToRender = fixedHtml;
    if (htmlToRender.includes('<body')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlToRender, 'text/html');
      htmlToRender = doc.body ? doc.body.innerHTML : htmlToRender;
    }

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
        </style>
      </head>
      <body>
        <form id="form">
          ${htmlToRender || '<p class="text-muted">Start editing to see preview...</p>'}
        </form>
        <script src="/test_functions.js"></script>
      </body>
      </html>
    `;

    if (!previewFrameRef.current) return;
    const doc = previewFrameRef.current.contentDocument || previewFrameRef.current.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(fullHtml);
    doc.close();

    // Function to initialize form preview (same logic as FormRunner)
    const initializePreview = () => {
      if (!previewFrameRef.current) return;
      const iframeDoc = previewFrameRef.current.contentDocument || previewFrameRef.current.contentWindow?.document;
      if (!iframeDoc) return;

      const formElement = iframeDoc.getElementById('form');
      if (!formElement) return;
      
      const iframeWindow = previewFrameRef.current.contentWindow;
      if (iframeWindow && typeof iframeWindow.BACKEND_URL === 'undefined') {
        iframeWindow.BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
      }

      // Ensure form controls have both id and name attributes (set one from the other if needed)
      // If id is present without name, set name=id
      // If name is present without id, set id=name
      const formControls = formElement.querySelectorAll('input, select, textarea');
      
      formControls.forEach((control) => {
        const id = control.id || control.getAttribute('id');
        const name = control.name || control.getAttribute('name');
        
        // If id is present but name is not, set name=id
        if (id && !name) {
          control.setAttribute('name', id);
          control.name = id;
        }
        
        // If name is present but id is not, set id=name
        if (name && !id) {
          control.setAttribute('id', name);
          control.id = name;
        }
      });

      // Inject class="form-control" to all form controls if not present
      // Also inject oninput="eval_form(this)" for all input and textarea controls if not present
      // Also inject onchange="eval_form(this)" for all form controls if not present
      formControls.forEach((control) => {
        // Skip file inputs and hidden inputs
        if (control.type === 'file' || control.type === 'hidden') {
          return;
        }
        
        // Check if form-control class is already present or if there are conflicting Bootstrap form classes
        // Skip if element has form-check-input, form-select, or other form-* classes that conflict
        const hasConflictingClass = control.classList.contains('form-check-input') ||
                                     control.classList.contains('form-select') ||
                                     Array.from(control.classList).some(cls => cls.startsWith('form-') && cls !== 'form-control');
        
        if (!control.classList.contains('form-control') && !hasConflictingClass) {
          // Add form-control class, preserving existing classes
          const existingClasses = control.className || '';
          control.className = existingClasses ? `${existingClasses} form-control` : 'form-control';
        }
        
        // Inject oninput="eval_form(this)" for input and textarea if handler is not already present
        if ((control.tagName === 'INPUT' || control.tagName === 'TEXTAREA') && !control.hasAttribute('oninput')) {
          control.setAttribute('oninput', 'eval_form(this)');
        }
        
        // Inject onchange="eval_form(this)" for all form controls if handler is not already present
        if (!control.hasAttribute('onchange')) {
          control.setAttribute('onchange', 'eval_form(this)');
        }
      });

      // Hide submit buttons in preview
      const submitButtons = formElement.querySelectorAll('button[type="submit"], input[type="submit"]');
      submitButtons.forEach((btn) => {
        btn.style.display = 'none';
      });

      // Initialize file uploads if test_functions.js is loaded
      if (iframeWindow && typeof iframeWindow.initAutoFileUploads === 'function') {
        try {
          iframeWindow.initAutoFileUploads();
        } catch (err) {
          console.error('Error initializing auto file uploads in preview:', err);
        }
      }
      if (iframeWindow && typeof iframeWindow.initMultiFileUploads === 'function') {
        try {
          iframeWindow.initMultiFileUploads();
        } catch (err) {
          console.error('Error initializing multi-file uploads in preview:', err);
        }
      }

            // Initialize image preview handlers for file inputs with data-file-type="image"
            if (iframeWindow && iframeWindow.document) {
              try {
                const imageFileInputs = iframeWindow.document.querySelectorAll('input[type="file"][data-file-type="image"][data-file-target-element-id]');
                
                imageFileInputs.forEach(input => {
                  // Skip if already has an onchange handler
                  if (input.hasAttribute('onchange') && input.getAttribute('onchange').trim()) {
                    return;
                  }
                  
                  const targetId = input.getAttribute('data-file-target-element-id');
                  if (!targetId) return;
                  
                  // Attach the handler
                  input.addEventListener('change', function() {
                    const img = iframeWindow.document.getElementById(targetId);
                    const file = this.files[0];
                    if (!file || !img) return;

                    const reader = new FileReader();
                    reader.onload = e => {
                      img.src = e.target.result;
                      img.style.display = 'block';
                      // Store base64 data in data attribute for database submission
                      this.setAttribute('data-file-data', e.target.result);
                    };
                    reader.readAsDataURL(file);
                  });
                });
              } catch (err) {
                console.error('Error initializing image preview handlers in preview:', err);
              }
            }

            // Initialize checkbox and radio groups (that sync to hidden inputs)
            if (iframeWindow && iframeWindow.document) {
              try {
                const doc = iframeWindow.document;
                // Find all hidden inputs that might be targets for checkbox/radio groups
                const hiddenInputs = doc.querySelectorAll('input[type="hidden"]');
                
                hiddenInputs.forEach(hidden => {
                  const hiddenId = hidden.id || hidden.name;
                  if (!hiddenId) return;
                  
                  // Look for a container with id ending in "_group"
                  const containerId = `${hiddenId}_group`;
                  const container = doc.getElementById(containerId);
                  
                  if (container) {
                    // Check if it's a radio group
                    const radios = container.querySelectorAll('input[type="radio"]');
                    if (radios.length > 0) {
                      // Radio group
                      const isRequired = hidden.hasAttribute('required');
                      const update = () => {
                        const checked = container.querySelector('input[type="radio"]:checked');
                        const value = checked ? checked.value : '';
                        if (isRequired && !value) {
                          hidden.value = '';
                          hidden.setAttribute('value', '');
                          hidden.setCustomValidity('Please select an option.');
                        } else {
                          hidden.value = value;
                          hidden.setAttribute('value', value);
                          hidden.setCustomValidity('');
                        }
                      };
                      radios.forEach(radio => {
                        radio.addEventListener('change', update);
                      });
                      update();
                      return; // Skip checkbox handling
                    }
                    
                    // Checkbox group
                    const checkboxesById = doc.querySelectorAll(`input[type="checkbox"][id^="${hiddenId}_"]`);
                    const checkboxesInContainer = container.querySelectorAll('input[type="checkbox"]');
                    const checkboxes = checkboxesById.length > 0 ? checkboxesById : checkboxesInContainer;
                    
                    if (checkboxes.length > 0) {
                      const isRequired = hidden.hasAttribute('required');
                      const update = () => {
                        const values = Array.from(checkboxes)
                          .filter(cb => cb.checked)
                          .map(cb => cb.value);
                        if (isRequired && values.length === 0) {
                          hidden.value = '';
                          hidden.setAttribute('value', '');
                          hidden.setCustomValidity('Please select at least one option.');
                        } else {
                          hidden.value = JSON.stringify(values);
                          hidden.setAttribute('value', hidden.value);
                          hidden.setCustomValidity('');
                        }
                      };
                      checkboxes.forEach(checkbox => {
                        checkbox.addEventListener('change', update);
                      });
                      update();
                    }
                  }
                });
              } catch (err) {
                console.error('Error initializing checkbox/radio groups in preview:', err);
              }
            }

      // Call eval_form to initialize form (run data-script, etc.)
      if (iframeWindow && typeof iframeWindow.eval_form === 'function') {
        try {
          iframeWindow.eval_form(null);
        } catch (err) {
          console.error('Error calling eval_form in preview:', err);
        }
      }
    };

    // After the iframe loads, initialize the preview
    const iframeWindow = previewFrameRef.current.contentWindow;
    if (iframeWindow) {
      iframeWindow.addEventListener('load', () => {
        setTimeout(initializePreview, 200);
      });
    }
    
    // Also run as fallback in case load event already fired
    setTimeout(initializePreview, 300);
  };

  const handleFormat = () => {
    const formatted = formatHtml(html);
    onHtmlChange(formatted);
  };

  const handleMouseDown = (e) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      
      const container = resizerRef.current?.parentElement;
      if (!container) return;
      
      const containerWidth = container.offsetWidth;
      const newWidth = (e.clientX / containerWidth) * 100;
      
      if (newWidth >= 20 && newWidth <= 80) {
        setSourceWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="col-md-9 col-lg-10 d-flex flex-column p-0" style={{ position: 'relative' }}>
      <div className="d-flex flex-grow-1" style={{ overflow: 'hidden' }}>
        {/* Source Code Panel */}
        <div
          className="d-flex flex-column p-0"
          style={{ width: `${sourceWidth}%`, flexShrink: 0 }}
        >
          <div className="p-2 border-bottom bg-white d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Source Code</h6>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleFormat}
              title="Format HTML"
            >
              ✨ Format Document
            </button>
          </div>
          <textarea
            className="flex-grow-1 border-0 p-3"
            style={{ fontFamily: 'monospace', fontSize: '14px', resize: 'none' }}
            value={html}
            onChange={(e) => onHtmlChange(e.target.value)}
            onKeyDown={(e) => {
              // Handle Tab key to insert tab character instead of moving focus
              if (e.key === 'Tab') {
                e.preventDefault();
                const textarea = e.target;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const newValue = html.slice(0, start) + '\t' + html.slice(end);
                onHtmlChange(newValue);
                // Set cursor position after the inserted tab
                setTimeout(() => {
                  textarea.selectionStart = textarea.selectionEnd = start + 1;
                }, 0);
              }
            }}
            placeholder="Enter HTML form code here..."
            disabled={loading}
          />
        </div>

        {/* Resizable Divider */}
        <div
          ref={resizerRef}
          className="border-end"
          style={{
            width: '4px',
            backgroundColor: '#dee2e6',
            cursor: 'col-resize',
            flexShrink: 0,
            userSelect: 'none',
            zIndex: 10
          }}
          onMouseDown={handleMouseDown}
        />

        {/* Preview Panel */}
        <div
          className="d-flex flex-column p-0"
          style={{ flex: 1, minWidth: 0 }}
        >
          <div className="p-2 border-bottom bg-white d-flex justify-content-between align-items-center">
            <h6 className="mb-0">Preview</h6>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => updatePreview(html)}
              title="Refresh preview"
            >
              🔄
            </button>
          </div>
          <iframe
            ref={previewFrameRef}
            className="flex-grow-1 border-0"
            title="Preview"
          />
        </div>
      </div>
    </div>
  );
}

export default EditorMain;
