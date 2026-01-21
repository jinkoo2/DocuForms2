# CTQA FastAPI Server

FastAPI server for CTQA (CT Quality Assurance) analysis with job queue support.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Ensure MongoDB and Redis are running (via docker-compose):
```bash
cd ..
docker-compose up -d mongodb redis
```

4. Run the server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

5. Run the worker (in a separate terminal):
```bash
python run_worker.py
```

## API Endpoints

- `POST /api/jobs` - Upload zipped DICOM files and create analysis job
- `GET /api/jobs/{job_id}` - Get job status
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/{job_id}/result` - Get analysis result
- `GET /api/jobs/{job_id}/report` - Get HTML report file

## Configuration

Set environment variables in `.env`:
- `MONGODB_URL` - MongoDB connection string
- `REDIS_URL` - Redis connection string
- `UPLOAD_DIR` - Directory for uploaded files (results are saved here too)
- `MACHINE_PARAM_FILE` - Path to machine parameter file
- `SERVICE_PARAM_FILE` - Path to service parameter file
