import React from 'react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ListAltIcon from '@mui/icons-material/ListAlt';
import UploadPage from './components/UploadPage';
import JobsListPage from './components/JobsListPage';
import JobDetailPage from './components/JobDetailPage';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';

function NavBar() {
  const location = useLocation();
  
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          CTQA Image Analysis
        </Typography>
        <Button
          color="inherit"
          component={Link}
          to="/"
          startIcon={<HomeIcon />}
          sx={{
            mr: 1,
            backgroundColor: location.pathname === '/' ? 'rgba(255,255,255,0.15)' : 'transparent',
          }}
        >
          Home
        </Button>
        <Button
          color="inherit"
          component={Link}
          to="/jobs"
          startIcon={<ListAltIcon />}
          sx={{
            backgroundColor: location.pathname.startsWith('/jobs') ? 'rgba(255,255,255,0.15)' : 'transparent',
          }}
        >
          Jobs
        </Button>
      </Toolbar>
    </AppBar>
  );
}

function App() {
  return (
    <Router>
      <Box sx={{ flexGrow: 1 }}>
        <NavBar />
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/jobs" element={<JobsListPage />} />
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          </Routes>
        </Container>
      </Box>
    </Router>
  );
}

export default App;
