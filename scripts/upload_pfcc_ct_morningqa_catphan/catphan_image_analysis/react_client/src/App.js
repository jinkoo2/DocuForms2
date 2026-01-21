import React, { useState, useEffect } from 'react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import UploadPage from './components/UploadPage';
import JobsListPage from './components/JobsListPage';
import JobDetailPage from './components/JobDetailPage';
import { BrowserRouter as Router, Routes, Route, Link, useParams } from 'react-router-dom';

function App() {
  return (
    <Router>
      <Box sx={{ flexGrow: 1 }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              CTQA Image Analysis
            </Typography>
          </Toolbar>
        </AppBar>
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/jobs" element={<JobsListPage />} />
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          </Routes>
        </Container>
      </Box>
    </Router>
  );
}

function HomePage() {
  const [value, setValue] = useState(0);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box>
      <Paper sx={{ mb: 3 }}>
        <Tabs value={value} onChange={handleChange} aria-label="navigation tabs">
          <Tab label="Upload" component={Link} to="/" />
          <Tab label="Jobs" component={Link} to="/jobs" />
        </Tabs>
      </Paper>
      {value === 0 && <UploadPage />}
    </Box>
  );
}

export default App;
