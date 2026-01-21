import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import RefreshIcon from '@mui/icons-material/Refresh';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const STATUS_COLORS = {
  queued: 'default',
  processing: 'info',
  completed: 'success',
  failed: 'error',
};

function JobsListPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/jobs`);
      setJobs(response.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // Refresh every 5 seconds
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  if (loading && jobs.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Jobs List</Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchJobs}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {jobs.length === 0 ? (
        <Typography variant="body1" color="text.secondary">
          No jobs found. Upload DICOM files to create a job.
        </Typography>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Job ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Filename</TableCell>
                <TableCell>Created At</TableCell>
                <TableCell>Updated At</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.job_id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {job.job_id.substring(0, 8)}...
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={job.status}
                      color={STATUS_COLORS[job.status] || 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{job.filename || 'N/A'}</TableCell>
                  <TableCell>{formatDate(job.created_at)}</TableCell>
                  <TableCell>{formatDate(job.updated_at)}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => navigate(`/jobs/${job.job_id}`)}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

export default JobsListPage;
