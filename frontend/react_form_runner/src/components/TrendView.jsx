import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSubmissions } from '../utils/api';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

function TrendView() {
  const { formId, fieldKey } = useParams();
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  
  // Initialize date range: 30 days ago to today
  const getDefaultDateRange = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    // Format as YYYY-MM-DD for date input
    const formatDateForInput = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    return {
      start: formatDateForInput(thirtyDaysAgo),
      end: formatDateForInput(today)
    };
  };

  const defaultRange = getDefaultDateRange();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  // Convert date format to ISO format for API
  // Start date: beginning of day (00:00:00), End date: end of day (23:59:59)
  const convertToISO = (dateStr, isEndDate = false) => {
    if (!dateStr) return null;
    // date format is YYYY-MM-DD
    if (isEndDate) {
      // End date: set to end of day (23:59:59.999)
      return `${dateStr}T23:59:59.999`;
    } else {
      // Start date: set to beginning of day (00:00:00)
      return `${dateStr}T00:00:00`;
    }
  };

  // Filter submissions by date range using performedAt if present, otherwise submittedAt
  const filterSubmissionsByDateRange = (submissions, start, end) => {
    if (!start && !end) return submissions;
    
    const startDateObj = start ? new Date(convertToISO(start, false)) : null;
    const endDateObj = end ? new Date(convertToISO(end, true)) : null;
    
    return submissions.filter((s) => {
      // Use performedAt if present, otherwise submittedAt
      const dateValue = s.performedAt || s.submittedAt;
      if (!dateValue) return false;
      
      const submissionDate = new Date(dateValue);
      
      // Check if submission is within date range (inclusive on both ends)
      if (startDateObj && submissionDate < startDateObj) {
        return false;
      }
      if (endDateObj && submissionDate > endDateObj) {
        return false;
      }
      return true;
    });
  };

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const startISO = convertToISO(startDate, false); // Start of day
      const endISO = convertToISO(endDate, true); // End of day
      const data = await fetchSubmissions(formId, startISO, endISO);
      // Backend already filters by date range using performedAt/submittedAt
      // Apply additional client-side filtering to ensure correctness
      const filtered = filterSubmissionsByDateRange(data, startDate, endDate);
      setSubmissions(filtered);
    } catch (err) {
      console.error('Error loading submissions:', err);
      setError(`Failed to load submissions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (formId) {
      loadSubmissions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  useEffect(() => {
    if (!canvasRef.current || !submissions || submissions.length === 0 || !fieldKey) {
      // Clear error if we have submissions but no data points
      if (submissions && submissions.length > 0 && fieldKey) {
        setError('No numeric values found for this field in the selected date range.');
      }
      return;
    }

    const points = [];
    submissions.forEach((s) => {
      const val = s.values?.[fieldKey];
      if (val === undefined || val === null) return;
      
      const num = parseFloat(val);
      // Use performedAt if present, otherwise fall back to submittedAt
      const dateValue = s.performedAt || s.submittedAt;
      if (!Number.isNaN(num) && dateValue) {
        points.push({
          x: new Date(dateValue),
          y: num
        });
      }
    });

    if (points.length === 0) {
      setError('No numeric values found for this field in the selected date range.');
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }

    // Sort by date (using performedAt if present, otherwise submittedAt)
    points.sort((a, b) => a.x - b.x);

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: points.map(p => p.x.toLocaleString()),
        datasets: [{
          label: fieldKey || 'Value',
          data: points.map(p => p.y),
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });

    // Clear error if chart is successfully created
    setError(null);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [fieldKey, submissions]);

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">Loading trend data...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      <div className="bg-dark text-white p-3">
        <div className="d-flex align-items-center justify-content-between">
          <h5 className="mb-0">Value Plot: {fieldKey}</h5>
          <div className="d-flex align-items-center gap-2">
            <label className="form-label mb-0 text-white">Date Range:</label>
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: 'auto' }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-white-50">to</span>
            <input
              type="date"
              className="form-control form-control-sm"
              style={{ width: 'auto' }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={loadSubmissions}
            >
              Update
            </button>
          </div>
        </div>
      </div>
      <div className="p-4" style={{ height: 'calc(100vh - 80px)' }}>
        {error && (
          <div className="alert alert-warning mb-3">{error}</div>
        )}
        <canvas ref={canvasRef} style={{ maxHeight: '100%' }}></canvas>
      </div>
    </div>
  );
}

export default TrendView;
