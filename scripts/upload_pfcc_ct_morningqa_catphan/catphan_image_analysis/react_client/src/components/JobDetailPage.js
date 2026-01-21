import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  LinearProgress,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';
const REFRESH_INTERVAL = 5000; // 5 seconds

const STATUS_COLORS = {
  uploading: 'default',
  queued: 'warning',
  processing: 'info',
  completed: 'success',
  failed: 'error',
};

const STATUS_LABELS = {
  uploading: 'Uploading',
  queued: 'Queued',
  processing: 'Processing...',
  completed: 'Completed',
  failed: 'Failed',
};

function JobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchJobStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}`);
      setJob(response.data);
      setLastUpdated(new Date());
      
      // If job is completed, fetch result
      if (response.data.status === 'completed') {
        try {
          const resultResponse = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/result`);
          setResult(resultResponse.data);
        } catch (err) {
          console.warn('Could not fetch result:', err);
        }
        setAutoRefresh(false); // Stop auto-refresh when completed
      } else if (response.data.status === 'failed') {
        setAutoRefresh(false); // Stop auto-refresh when failed
      }
      
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch job status');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJobStatus();
  }, [fetchJobStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchJobStatus();
    }, REFRESH_INTERVAL);
    
    return () => clearInterval(interval);
  }, [autoRefresh, fetchJobStatus]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString();
  };

  const calculateExecutionTime = (createdAt, updatedAt) => {
    if (!createdAt || !updatedAt) return null;
    
    const start = new Date(createdAt);
    const end = new Date(updatedAt);
    const diffMs = end - start;
    
    if (diffMs < 0) return null;
    
    const diffSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const handleViewReportNewTab = () => {
    if (result?.report_url) {
      window.open(`${API_BASE_URL}${result.report_url}`, '_blank');
    }
  };

  const getReportUrl = () => {
    if (result?.report_url) {
      return `${API_BASE_URL}${result.report_url}`;
    }
    return null;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !job) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/jobs')}
          sx={{ mt: 2 }}
        >
          Back to Jobs
        </Button>
      </Paper>
    );
  }

  const isRunning = job?.status === 'queued' || job?.status === 'processing';

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/jobs')}
        sx={{ mb: 2 }}
      >
        Back to Jobs
      </Button>

      <Paper sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5">Job Details</Typography>
          <Box display="flex" alignItems="center" gap={2}>
            {lastUpdated && (
              <Typography variant="caption" color="text.secondary">
                Last updated: {formatTime(lastUpdated)}
              </Typography>
            )}
            <Chip
              label={STATUS_LABELS[job?.status] || job?.status || 'Unknown'}
              color={STATUS_COLORS[job?.status] || 'default'}
            />
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={fetchJobStatus}
            >
              Refresh
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FolderOpenIcon />}
              onClick={() => window.open(`${API_BASE_URL}/cases/${jobId}/`, '_blank')}
            >
              Files
            </Button>
          </Box>
        </Box>

        {isRunning && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Auto-refreshing every {REFRESH_INTERVAL / 1000} seconds...
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {job && (
          <Box>
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Job Information</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Job ID:</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{job.job_id}</Typography>
                  
                  <Typography variant="body2" color="text.secondary">Status:</Typography>
                  <Typography variant="body2">{STATUS_LABELS[job.status] || job.status}</Typography>
                  
                  <Typography variant="body2" color="text.secondary">Created:</Typography>
                  <Typography variant="body2">{formatDate(job.created_at)}</Typography>
                  
                  <Typography variant="body2" color="text.secondary">Updated:</Typography>
                  <Typography variant="body2">{formatDate(job.updated_at)}</Typography>
                  
                  {(job.status === 'completed' || job.status === 'failed') && calculateExecutionTime(job.created_at, job.updated_at) && (
                    <>
                      <Typography variant="body2" color="text.secondary">Execution Time:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {calculateExecutionTime(job.created_at, job.updated_at)}
                      </Typography>
                    </>
                  )}
                </Box>
              </CardContent>
            </Card>

            {job.status === 'queued' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Job is queued and waiting to be processed...
              </Alert>
            )}

            {job.status === 'processing' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Analysis is in progress. This page will automatically update when complete.
              </Alert>
            )}

            {job.status === 'completed' && result && (
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6">Analysis Results</Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<OpenInNewIcon />}
                      onClick={handleViewReportNewTab}
                    >
                      Open in New Tab
                    </Button>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  
                  {/* Embedded Report */}
                  {getReportUrl() && (
                    <Box sx={{ 
                      border: '1px solid #ddd', 
                      borderRadius: 1,
                      overflow: 'hidden',
                      height: '70vh',
                      minHeight: 500
                    }}>
                      <iframe
                        src={getReportUrl()}
                        title="Analysis Report"
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                        }}
                      />
                    </Box>
                  )}
                </CardContent>
              </Card>
            )}

            {job.status === 'failed' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="body2"><strong>Analysis Failed</strong></Typography>
                {job.error && (
                  <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {job.error}
                  </Typography>
                )}
              </Alert>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default JobDetailPage;
