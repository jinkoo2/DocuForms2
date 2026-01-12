import React, { useState, useEffect, useRef } from 'react';
import { formatHtml } from '../utils/formBuilderUtils';

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
        ${htmlContent || '<p class="text-muted">Start editing to see preview...</p>'}
      </body>
      </html>
    `;

    const doc = previewFrameRef.current.contentDocument || previewFrameRef.current.contentWindow.document;
    doc.open();
    doc.write(fullHtml);
    doc.close();
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
