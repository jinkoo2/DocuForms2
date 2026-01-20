import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

function PlotModal({ fieldKey, submissions, onClose }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !submissions || submissions.length === 0) return;

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
      alert('No numeric values found for this field.');
      return;
    }

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
        scales: {
          y: { beginAtZero: true }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [fieldKey, submissions]);

  return (
    <>
      <div className="modal fade show" style={{ display: 'block', zIndex: 1055 }} tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Value Plot: {fieldKey}</h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
            <div className="modal-body">
              <canvas ref={canvasRef} height="200"></canvas>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" style={{ zIndex: 1054 }} onClick={onClose}></div>
    </>
  );
}

export default PlotModal;
