import React, { useState } from 'react';
import {
  Paper,
  Box,
  Button,
  Typography,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  IconButton,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import axios from 'axios';
import JSZip from 'jszip';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function UploadPage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  const handleFileSelect = (event) => {
    const selectedFiles = Array.from(event.target.files);
    setFiles(prev => [...prev, ...selectedFiles]);
    setError(null);
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one DICOM file');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setSuccess(null);

    try {
      // Create ZIP file
      const zip = new JSZip();
      
      files.forEach((file) => {
        zip.file(file.name, file);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setUploadProgress(metadata.percent);
      });

      // Create FormData
      const formData = new FormData();
      formData.append('file', zipBlob, 'dicom_files.zip');

      // Upload to server
      const response = await axios.post(`${API_BASE_URL}/api/jobs`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setSuccess(`Job created successfully! Job ID: ${response.data.job_id}`);
      setFiles([]);
      
      // Navigate to job detail page after a short delay
      setTimeout(() => {
        navigate(`/jobs/${response.data.job_id}`);
      }, 2000);

    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Upload DICOM Files
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select DICOM files (.dcm) to analyze. Files will be zipped and uploaded to the server.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Box sx={{ mb: 3 }}>
        <input
          accept=".dcm"
          style={{ display: 'none' }}
          id="file-upload"
          multiple
          type="file"
          onChange={handleFileSelect}
        />
        <label htmlFor="file-upload">
          <Button
            variant="contained"
            component="span"
            startIcon={<CloudUploadIcon />}
            disabled={uploading}
            sx={{ mr: 2 }}
          >
            Select DICOM Files
          </Button>
        </label>
        <Button
          variant="contained"
          color="primary"
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
        >
          Upload and Analyze
        </Button>
      </Box>

      {uploading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            Uploading... {uploadProgress}%
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}

      {files.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Selected Files ({files.length})
          </Typography>
          <List>
            {files.map((file, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleRemoveFile(index)}
                    disabled={uploading}
                  >
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={file.name}
                  secondary={`${(file.size / 1024 / 1024).toFixed(2)} MB`}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Paper>
  );
}

export default UploadPage;
