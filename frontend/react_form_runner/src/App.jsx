import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams, Link, useNavigate } from 'react-router-dom';
import FormList from './components/FormList';
import FormRunner from './components/FormRunner';
import FormBuilder from './components/FormBuilder';
import { BACKEND_URL } from './utils/api';
import './utils/testFunctions'; // Make test functions available globally
import './styles/styles.css';

// Make BACKEND_URL available globally for static test_functions.js
if (typeof window !== 'undefined') {
  window.BACKEND_URL = BACKEND_URL;
}

function RunnerContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const formId = searchParams.get('formId');

  const handleFormSelect = (selectedFormId) => {
    if (selectedFormId) {
      setSearchParams({ formId: selectedFormId });
    } else {
      setSearchParams({});
    }
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid">
          <a className="navbar-brand" href="/">DocuForms Runner</a>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbarNav">
            <ul className="navbar-nav ms-auto">
              <li className="nav-item">
                <Link className="nav-link active" to="/">Runner</Link>
              </li>
              <li className="nav-item ms-2">
                <Link className="btn btn-outline-light btn-sm" to="/builder">Form Builder</Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <div className="runner-container">
        <div className="panel__left">
          <FormList 
            selectedFormId={formId} 
            onFormSelect={handleFormSelect}
          />
        </div>
        <div className="panel__main">
          <FormRunner formId={formId} />
        </div>
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/builder" element={<FormBuilder />} />
        <Route path="/" element={<RunnerContent />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
