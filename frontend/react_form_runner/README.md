# React Form Runner

A React-based form runner for DocuForms, replicating the functionality of the CKEditor form runner.

## Features

- Form loading and display
- Form submission with validation
- Submissions list (table and list views)
- Submission preview with iframe
- Trend plotting for numeric fields
- Baseline submission support
- File upload support
- Image preview support

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3001`

## Build

To build for production:
```bash
npm run build
```

## Configuration

Update the API base URL in `src/utils/api.js` if your backend is running on a different port:
```javascript
const API_BASE = "http://localhost:8001/api/forms";
```

## Dependencies

- React 18.2.0
- React Router DOM 6.20.0
- Chart.js 4.4.2
- React Chart.js 2 5.2.0
- Bootstrap 5.3.8 (via CDN)
- Vite (build tool)
