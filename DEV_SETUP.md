## Dev Environment Setup

These steps spin up the FastAPI + MongoDB backend and optional static form runners for local development.

### Prerequisites
- Python 3.10+ with `python3` on PATH
- Docker + Docker Compose
- (Optional) A static file server for the frontend runners (e.g., VS Code Live Server, `python3 -m http.server`)

### 1) Clone and create a virtualenv
```bash
cd /home/jk/projects/DocuForms2
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
```

### 2) Install backend dependencies
```bash
pip install fastapi uvicorn[standard] motor pymongo pydantic-settings python-dotenv requests pytest
```

### 3) Configure environment variables
Create `/home/jk/projects/DocuForms2/backend/.env`:
```bash
MONGO_URI="mongodb://root:example@localhost:27017/?authSource=admin"
DB_NAME="docuforms2"
MAX_UPLOAD_SIZE=1073741824
```
Note: `MAX_UPLOAD_SIZE` is in bytes. Default is 1GB (1073741824 bytes). For example:
- 1GB = 1073741824
- 2GB = 2147483648
- 500MB = 524288000

### 4) Start infrastructure (MongoDB + mongo-express)
```bash
docker compose -f docker-compose.dev.yml up -d
```
- MongoDB: `mongodb://localhost:27017`
- Mongo Express UI: http://localhost:8082

### 5) Run the backend (FastAPI)
From `/home/jk/projects/DocuForms2/backend`:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```
- Health check: http://localhost:8001/health
- API base: http://localhost:8001/api/forms

### 6) Run tests
With the server running in another terminal:
```bash
pytest tests
```

### 7) Frontend runners (optional)
Two static runners live under `frontend/CKEditor_form_runner` and `frontend/grapesjs_form_runner`.
- Serve the desired folder with any static server (example):
  ```bash
  cd /home/jk/projects/DocuForms2/frontend/CKEditor_form_runner
  python3 -m http.server 3000
  ```
- Update API URLs in the runner JS if you change the backend port.

### 8) Tear down
```bash
docker compose -f docker-compose.dev.yml down
```

### Troubleshooting
- Connection refused to Mongo: ensure step 4 is running and credentials match `.env`.
- Tests failing with 404/connection errors: verify backend is running on port 8001.
- CORS issues in the browser: FastAPI CORS is currently wide-open for local development; restart the server after changes.
