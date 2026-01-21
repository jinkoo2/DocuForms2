import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const STATUS_COLORS = {
  queued: 'default',
  processing: 'info',
  completed: 'success',
  failed: 'error',
};

function JobDetailPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchJobStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}`);
      setJob(response.data);
      
      // If job is completed, fetch result
      if (response.data.status === 'completed') {
        try {
          const resultResponse = await axios.get(`${API_BASE_URL}/api/jobs/${jobId}/result`);
          setResult(resultResponse.data);
        } catch (err) {
          // Result might not be available yet
          console.warn('Could not fetch result:', err);
        }
      }
      
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch job status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobStatus();
    // Refresh every 3 seconds if job is not completed
    const interval = setInterval(() => {
      if (job?.status !== 'completed' && job?.status !== 'failed') {
        fetchJobStatus();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const handleViewReport = () => {
    if (result?.report_url) {
      window.open(`${API_BASE_URL}${result.report_url}`, '_blank');
    }
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
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5">Job Details</Typography>
          <Chip
            label={job?.status || 'Unknown'}
            color={STATUS_COLORS[job?.status] || 'default'}
          />
        </Box>

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
                <Typography variant="body2"><strong>Job ID:</strong> {job.job_id}</Typography>
                <Typography variant="body2"><strong>Status:</strong> {job.status}</Typography>
                <Typography variant="body2"><strong>Created At:</strong> {formatDate(job.created_at)}</Typography>
                <Typography variant="body2"><strong>Updated At:</strong> {formatDate(job.updated_at)}</Typography>
                {job.error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    <Typography variant="body2"><strong>Error:</strong> {job.error}</Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {job.status === 'processing' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Analysis is in progress. This page will automatically refresh when complete.
              </Alert>
            )}

            {job.status === 'completed' && result && (
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>Analysis Results</Typography>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2"><strong>Result Directory:</strong> {result.result_dir}</Typography>
                    <Typography variant="body2"><strong>Report Path:</strong> {result.report_path}</Typography>
                  </Box>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleViewReport}
                  >
                    View Report
                  </Button>
                </CardContent>
              </Card>
            )}

            {job.status === 'failed' && job.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="body2"><strong>Error:</strong> {job.error}</Typography>
              </Alert>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default JobDetailPage;
