import React, { useState, useEffect } from 'react';
import { fetchSubmissions, deleteSubmission, setBaseline, BACKEND_URL } from '../utils/api';
import SubmissionPreview from './SubmissionPreview';
import PlotModal from './PlotModal';

function SubmissionsList({ formId }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [plotField, setPlotField] = useState(null);

  const loadSubmissions = async () => {
    if (!formId) return;
    
    try {
      setLoading(true);
      const data = await fetchSubmissions(formId);
      console.log('Loaded submissions:', JSON.stringify(data, null, 2));
      if (data && data.length > 0) {
        data.forEach((sub, idx) => {
          console.log(`Submission ${idx} id:`, sub.id || sub._id, 'attachments:', sub.attachments);
        });
        // Check for duplicates by ID
        const ids = data.map(s => s.id || s._id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
          console.warn('Duplicate submission IDs detected!', ids);
          // Remove duplicates, keeping the first occurrence
          const seen = new Set();
          const unique = data.filter(s => {
            const id = s.id || s._id;
            if (seen.has(id)) {
              console.warn('Removing duplicate submission:', id);
              return false;
            }
            seen.add(id);
            return true;
          });
          setSubmissions(unique);
        } else {
          setSubmissions(data);
        }
      } else {
        setSubmissions([]);
      }
    } catch (err) {
      console.error('Error loading submissions:', err);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
    
    const handleReload = () => loadSubmissions();
    window.addEventListener('reloadSubmissions', handleReload);
    
    // Set up function for iframe to call to show plot modal
    window.showPlotModalFromIframe = (fieldKey) => {
      setPlotField(fieldKey);
    };
    
    return () => {
      window.removeEventListener('reloadSubmissions', handleReload);
      // Clean up the function when component unmounts
      if (window.showPlotModalFromIframe) {
        delete window.showPlotModalFromIframe;
      }
    };
  }, [formId]);

  const handleDelete = async (submissionId) => {
    if (!confirm('Delete this submission?')) return;
    
    try {
      await deleteSubmission(formId, submissionId);
      loadSubmissions();
    } catch (err) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const handleBaselineToggle = async (submissionId, isChecked) => {
    try {
      await setBaseline(formId, submissionId, isChecked);
      loadSubmissions();
      window.dispatchEvent(new CustomEvent('baselineUpdated'));
    } catch (err) {
      alert(`Failed to set baseline: ${err.message}`);
    }
  };

  const handleView = (submission) => {
    setSelectedSubmission(submission);
    setShowPreview(true);
  };

  if (loading) {
    return <div className="form-list-loading">Loading submissions...</div>;
  }

  if (submissions.length === 0) {
    return <div className="form-list-empty">No submissions yet.</div>;
  }

  if (viewMode === 'table') {
    return (
      <>
        <div className="d-flex align-items-center justify-content-end gap-2 mb-2">
          <label className="form-label mb-0" htmlFor="submissions-view-mode">View:</label>
          <select
            id="submissions-view-mode"
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="list">List</option>
            <option value="table">Table</option>
          </select>
        </div>
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th scope="col">Date/Time</th>
                <th scope="col">Result</th>
                <th scope="col">Comments</th>
                <th scope="col">Attachments</th>
                <th scope="col" className="text-center">Baseline</th>
                <th scope="col">Commands</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '';
                const result = (s.result || '').toUpperCase();
                const resultBadge =
                  result === 'PASS' ? 'bg-success' :
                  result === 'WARNING' ? 'bg-warning text-dark' :
                  result === 'FAIL' ? 'bg-danger' : 'bg-secondary';
                const comments = (s.comments || '').trim();
                const isBaseline = s.baseline || false;
                const attachmentsList = Array.isArray(s.attachments) ? s.attachments : [];

                return (
                  <tr key={s.id || s._id}>
                    <td className="text-nowrap">{date}</td>
                    <td>
                      <span className={`badge ${resultBadge}`}>{result || '—'}</span>
                    </td>
                    <td>
                      {comments ? (
                        <span className="text-muted" title={comments}>
                          {comments.length > 50 ? comments.substring(0, 50) + '...' : comments}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {attachmentsList.length > 0 ? (
                        <div>
                          {attachmentsList.map((att, idx) => (
                            <div key={idx} style={{ marginBottom: idx < attachmentsList.length - 1 ? '4px' : '0' }}>
                              <a
                                href={`${BACKEND_URL}${att.url}`}
                                target="_blank"
                                download={att.originalName || 'attachment'}
                                className="text-decoration-none"
                              >
                                {att.originalName || 'Download'}
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={isBaseline}
                        onChange={(e) => handleBaselineToggle(s.id || s._id, e.target.checked)}
                      />
                    </td>
                    <td className="text-nowrap">
                      {s.formHtml && (
                        <button
                          className="btn btn-sm btn-outline-primary me-2"
                          onClick={() => handleView(s)}
                        >
                          View Form
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDelete(s.id || s._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {showPreview && selectedSubmission && (
          <SubmissionPreview
            submission={selectedSubmission}
            onClose={() => {
              setShowPreview(false);
              setSelectedSubmission(null);
            }}
          />
        )}
        {plotField && (
          <PlotModal
            fieldKey={plotField}
            submissions={submissions}
            onClose={() => setPlotField(null)}
          />
        )}
      </>
    );
  }

  // List view
  return (
    <>
      <div className="d-flex align-items-center justify-content-end gap-2 mb-2">
        <label className="form-label mb-0" htmlFor="submissions-view-mode">View:</label>
        <select
          id="submissions-view-mode"
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
        >
          <option value="list">List</option>
          <option value="table">Table</option>
        </select>
      </div>
      {submissions.map((s) => {
        const date = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '';
        const result = (s.result || '').toUpperCase();
        const resultBadge =
          result === 'PASS' ? 'bg-success' :
          result === 'WARNING' ? 'bg-warning text-dark' :
          result === 'FAIL' ? 'bg-danger' : 'bg-secondary';
        const comments = (s.comments || '').trim();
        const isBaseline = s.baseline || false;
        const attachmentsList = Array.isArray(s.attachments) ? s.attachments : [];

        return (
          <div key={s.id || s._id} className="card mb-2">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div className="fw-bold">Result: {result || '—'}</div>
                  <div className="text-muted small">{date}</div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <div className={`badge ${resultBadge}`}>{result || '—'}</div>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={isBaseline}
                      onChange={(e) => handleBaselineToggle(s.id || s._id, e.target.checked)}
                      title="Baseline"
                    />
                    <label className="form-check-label small text-muted" style={{ marginLeft: '4px' }}>
                      Baseline
                    </label>
                  </div>
                </div>
              </div>
              {comments && (
                <div className="mt-2 mb-2 p-2 bg-light rounded">
                  <strong>Comments:</strong><br />
                  <span style={{ whiteSpace: 'pre-wrap' }}>{comments}</span>
                </div>
              )}
              <pre className="mt-2 mb-3" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(s.values, null, 2)}
              </pre>
              {attachmentsList.length > 0 && (
                <div className="mt-2 mb-2">
                  <strong>Attachments:</strong>
                  <div style={{ marginTop: '4px' }}>
                    {attachmentsList.map((att, idx) => (
                      <div key={idx} style={{ marginBottom: '4px' }}>
                        <a
                          href={`${BACKEND_URL}${att.url}`}
                          target="_blank"
                          download={att.originalName || 'attachment'}
                          className="text-decoration-none"
                        >
                          {att.originalName || 'Download'}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="d-flex justify-content-end gap-2">
                {s.formHtml && (
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => handleView(s)}
                  >
                    View Form
                  </button>
                )}
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => handleDelete(s.id || s._id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {showPreview && selectedSubmission && (
        <SubmissionPreview
          submission={selectedSubmission}
          onClose={() => {
            setShowPreview(false);
            setSelectedSubmission(null);
          }}
        />
      )}
      {plotField && (
        <PlotModal
          fieldKey={plotField}
          submissions={submissions}
          onClose={() => setPlotField(null)}
        />
      )}
    </>
  );
}

export default SubmissionsList;
