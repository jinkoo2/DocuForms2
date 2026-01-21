# CTQA React Client

React client application for CTQA Image Analysis with Material UI.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (optional):
```
REACT_APP_API_URL=http://localhost:8000
```

3. Start the development server:
```bash
npm start
```

The app will open at http://localhost:3000

## Features

- Upload DICOM files (automatically zipped)
- View list of submitted jobs
- View job status and details
- View analysis reports

## Build for Production

```bash
npm run build
```
