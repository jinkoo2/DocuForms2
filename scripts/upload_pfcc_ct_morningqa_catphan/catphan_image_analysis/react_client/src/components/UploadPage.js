import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  ListItemIcon,
  IconButton,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8003';
const PARALLEL_UPLOADS = parseInt(process.env.REACT_APP_PARALLEL_UPLOADS || '5', 10);

function UploadPage() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [files, setFiles] = useState([]); // {file, status: 'pending'|'uploading'|'uploaded'|'error'}
  const [caseId, setCaseId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const completedCountRef = useRef(0);

  // Fetch available devices on mount
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/devices`);
        const deviceList = response.data.devices || [];
        setDevices(deviceList);
        // Auto-select first ready device
        const readyDevices = deviceList.filter(d => d.ready);
        if (readyDevices.length > 0) {
          setSelectedDevice(readyDevices[0].id);
        }
      } catch (err) {
        setError('Failed to load devices: ' + (err.response?.data?.detail || err.message));
      } finally {
        setLoadingDevices(false);
      }
    };
    fetchDevices();
  }, []);

  // Upload a single file and update its status
  const uploadSingleFile = useCallback(async (file, index, currentCaseId) => {
    // Update status to uploading
    setFiles(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], status: 'uploading' };
      }
      return updated;
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      await axios.post(`${API_BASE_URL}/api/devices/${selectedDevice}/cases/${currentCaseId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Update status to uploaded
      setFiles(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = { ...updated[index], status: 'uploaded' };
        }
        return updated;
      });

      // Update progress
      completedCountRef.current += 1;
      setUploadProgress(prev => ({ ...prev, completed: completedCountRef.current }));

      return true;
    } catch (err) {
      // Update status to error
      setFiles(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = { ...updated[index], status: 'error' };
        }
        return updated;
      });

      completedCountRef.current += 1;
      setUploadProgress(prev => ({ ...prev, completed: completedCountRef.current }));

      return false;
    }
  }, [selectedDevice]);

  // Process files in parallel with concurrency limit
  const uploadFilesParallel = useCallback(async (filesToUpload, startIndex, currentCaseId) => {
    const results = [];
    
    // Process in batches
    for (let i = 0; i < filesToUpload.length; i += PARALLEL_UPLOADS) {
      const batch = filesToUpload.slice(i, i + PARALLEL_UPLOADS);
      const batchPromises = batch.map((file, batchIndex) => 
        uploadSingleFile(file, startIndex + i + batchIndex, currentCaseId)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }, [uploadSingleFile]);

  const handleFileSelect = async (event) => {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;
    
    if (!selectedDevice) {
      setError('Please select a device first');
      return;
    }

    setError(null);
    setUploading(true);
    completedCountRef.current = 0;
    setUploadProgress({ completed: 0, total: selectedFiles.length });

    try {
      // Create case folder if not exists
      let currentCaseId = caseId;
      if (!currentCaseId) {
        const response = await axios.post(`${API_BASE_URL}/api/devices/${selectedDevice}/cases`);
        currentCaseId = response.data.case_id;
        setCaseId(currentCaseId);
      }

      // Add files to state with pending status
      const startIndex = files.length;
      const newFiles = selectedFiles.map(f => ({ file: f, status: 'pending' }));
      setFiles(prev => [...prev, ...newFiles]);

      // Upload files in parallel
      await uploadFilesParallel(selectedFiles, startIndex, currentCaseId);

      setSuccess(`Uploaded ${selectedFiles.length} files to case ${currentCaseId}`);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress({ completed: 0, total: 0 });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleRunAnalysis = async () => {
    if (!caseId) {
      setError('No case created yet. Please upload files first.');
      return;
    }

    const uploadedCount = files.filter(f => f.status === 'uploaded').length;
    if (uploadedCount === 0) {
      setError('No files uploaded successfully');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/devices/${selectedDevice}/cases/${caseId}/analyze`);
      setSuccess(`Analysis started! Job ID: ${response.data.job_id}`);
      
      // Navigate to job detail page
      setTimeout(() => {
        navigate(`/jobs/${response.data.job_id}`);
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to start analysis');
    } finally {
      setUploading(false);
    }
  };

  const handleNewCase = () => {
    setCaseId(null);
    setFiles([]);
    setSuccess(null);
    setError(null);
  };

  const uploadedCount = files.filter(f => f.status === 'uploaded').length;
  const uploadingCount = files.filter(f => f.status === 'uploading').length;

  const selectedDeviceInfo = devices.find(d => d.id === selectedDevice);

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Upload DICOM Files
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a device and upload DICOM files for analysis. Files are uploaded in parallel ({PARALLEL_UPLOADS} at a time).
      </Typography>

      {/* Device Selector */}
      <Box sx={{ mb: 3 }}>
        <FormControl fullWidth disabled={loadingDevices || uploading || caseId !== null}>
          <InputLabel id="device-select-label">Select Device</InputLabel>
          <Select
            labelId="device-select-label"
            value={selectedDevice}
            label="Select Device"
            onChange={(e) => setSelectedDevice(e.target.value)}
          >
            {loadingDevices ? (
              <MenuItem value="">
                <CircularProgress size={20} sx={{ mr: 1 }} /> Loading devices...
              </MenuItem>
            ) : devices.length === 0 ? (
              <MenuItem value="">No devices available</MenuItem>
            ) : (
              devices.map((device) => (
                <MenuItem 
                  key={device.id} 
                  value={device.id}
                  disabled={!device.ready}
                >
                  {device.name} {device.description && `- ${device.description}`}
                  {!device.ready && ' (Not Ready)'}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>
        {selectedDeviceInfo && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Device ID: {selectedDeviceInfo.id} | Phantom: {selectedDeviceInfo.phantom_id || 'N/A'}
          </Typography>
        )}
      </Box>

      {caseId && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Case ID: <strong>{caseId}</strong> (Device: {selectedDeviceInfo?.name || selectedDevice})
          <Button size="small" onClick={handleNewCase} sx={{ ml: 2 }}>
            Start New Case
          </Button>
        </Alert>
      )}

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

      <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
        <input
          accept=".dcm,.DCM,*"
          style={{ display: 'none' }}
          id="file-upload"
          multiple
          type="file"
          onChange={handleFileSelect}
          ref={fileInputRef}
          disabled={uploading || !selectedDevice}
        />
        <label htmlFor="file-upload">
          <Button
            variant="contained"
            component="span"
            startIcon={<CloudUploadIcon />}
            disabled={uploading || !selectedDevice}
          >
            Select & Upload Files
          </Button>
        </label>
        <Button
          variant="contained"
          color="success"
          onClick={handleRunAnalysis}
          disabled={uploadedCount === 0 || uploading}
          startIcon={<PlayArrowIcon />}
        >
          Run Analysis ({uploadedCount} files)
        </Button>
      </Box>

      {uploading && uploadProgress.total > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            Uploading... {uploadProgress.completed}/{uploadProgress.total} completed
            {uploadingCount > 0 && ` (${uploadingCount} in progress)`}
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={(uploadProgress.completed / uploadProgress.total) * 100} 
          />
        </Box>
      )}

      {files.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Files ({uploadedCount}/{files.length} uploaded)
          </Typography>
          <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
            {files.map((item, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleRemoveFile(index)}
                    disabled={uploading}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {item.status === 'uploaded' && <CheckCircleIcon color="success" fontSize="small" />}
                  {item.status === 'uploading' && <Chip label="↑" color="primary" size="small" />}
                  {item.status === 'error' && <Chip label="!" color="error" size="small" />}
                </ListItemIcon>
                <ListItemText
                  primary={item.file.name}
                  secondary={`${(item.file.size / 1024).toFixed(1)} KB`}
                  primaryTypographyProps={{ variant: 'body2' }}
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
