import React, { useState, useEffect } from 'react';
import { fetchSubmissions, deleteSubmission, setBaseline } from '../utils/api';
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
      setSubmissions(data || []);
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

        return (
          <div key={s.id || s._id} className="card mb-2">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-bold">Result: {result || '—'}</div>
                  <div className="text-muted small">{date}</div>
                </div>
                <div className={`badge ${resultBadge}`}>{result || '—'}</div>
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
