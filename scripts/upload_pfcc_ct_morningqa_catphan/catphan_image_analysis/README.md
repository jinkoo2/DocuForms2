# Catphan Image Analysis

Complete system for CTQA (CT Quality Assurance) analysis with FastAPI server, React client, and MongoDB/Redis backend.

## Architecture

- **FastAPI Server**: REST API for job management and analysis
- **React Client**: Web interface for uploading DICOM files and viewing results
- **MongoDB**: Database for storing job metadata and results
- **Redis**: Job queue for asynchronous processing
- **RQ Workers**: Background workers for processing CTQA analysis
- **RQ Dashboard**: Web-based dashboard for monitoring RQ jobs and queues

## Quick Start with Docker

### 1. Configure Environment Variables

**IMPORTANT**: Before starting services, create a `.env` file with secure random passwords.

**Option 1: Use the setup script (recommended)**
```bash
./setup_env.sh
```

**Option 2: Manual setup**
```bash
# Copy the example file
cp .env.example .env

# Generate a secure random password
python3 -c "import secrets; pwd = secrets.token_urlsafe(24); print(f'MONGO_INITDB_ROOT_PASSWORD={pwd}'); print(f'MONGO_EXPRESS_ADMIN_PASSWORD={pwd}')"

# Edit .env and replace CHANGE_ME_GENERATE_RANDOM_PASSWORD with the generated password
```

**Option 3: One-liner**
```bash
python3 -c "import secrets; pwd = secrets.token_urlsafe(24); print(f'MONGO_INITDB_ROOT_USERNAME=root'); print(f'MONGO_INITDB_ROOT_PASSWORD={pwd}'); print(f'MONGO_EXPRESS_ADMIN_PASSWORD={pwd}')" > .env
```

⚠️ **Security Note**: The `.env` file contains sensitive passwords and is automatically excluded from git (see `.gitignore`). Never commit this file to version control.

### 2. Start All Services

```bash
docker-compose up -d
```

This starts:
- MongoDB on port 27019
- Redis on port 6381
- Mongo Express on port 8083
- FastAPI Server on port 8000
- RQ Worker (background job processor)
- RQ Dashboard on port 9181
- React Client on port 3000

### 3. Access Services

- **React Client**: http://localhost:3000
- **FastAPI API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Mongo Express**: http://localhost:8083
- **RQ Dashboard**: http://localhost:9181

### 4. Stop Services

```bash
docker-compose down
```

To also remove volumes:
```bash
docker-compose down -v
```

## Manual Setup (Without Docker)

### 1. Start Infrastructure Services

```bash
docker-compose up -d mongodb redis mongo-express
```

This starts:
- MongoDB on port 27019
- Redis on port 6381
- Mongo Express on port 8083

### 2. Setup FastAPI Server

```bash
cd fastapi_server
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
```

Ensure you have:
- Machine parameter file at `config/machine_param.txt`
- Service parameter file at `config/service_param.txt`
- Baseline directory with CT.nrrd and masks

Start the server:
```bash
uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

Start the worker (in a separate terminal):
```bash
python run_worker.py
```

### 3. Setup React Client

```bash
cd react_client
npm install
npm start
```

The client will be available at http://localhost:3000

## Configuration

### FastAPI Server (.env)

```
MONGODB_URL=mongodb://root:YOUR_PASSWORD_FROM_ENV@localhost:27019/
REDIS_URL=redis://localhost:6381/0
UPLOAD_DIR=./uploads
RESULTS_DIR=./results
MACHINE_PARAM_FILE=./config/machine_param.txt
SERVICE_PARAM_FILE=./config/service_param.txt
BASELINE_DIR=./baseline
```

### React Client (.env)

```
REACT_APP_API_URL=http://localhost:8000
```

## API Endpoints

- `POST /api/jobs` - Upload zipped DICOM files and create analysis job
- `GET /api/jobs/{job_id}` - Get job status
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/{job_id}/result` - Get analysis result
- `GET /api/jobs/{job_id}/report` - Get HTML report file

## Directory Structure

```
catphan_image_analysis/
├── docker-compose.yml          # All services orchestration
├── fastapi_server/              # FastAPI server
│   ├── Dockerfile              # Server Docker image
│   ├── main.py                  # API endpoints
│   ├── worker.py                # RQ worker function
│   ├── run_worker.py           # Worker runner script
│   ├── requirements.txt
│   ├── config/                  # Parameter files
│   └── baseline/                # Baseline CT and masks
├── react_client/                # React client
│   ├── Dockerfile              # Client Docker image
│   ├── nginx.conf              # Nginx configuration
│   ├── src/
│   │   ├── App.js
│   │   └── components/
│   │       ├── UploadPage.js
│   │       ├── JobsListPage.js
│   │       └── JobDetailPage.js
│   └── package.json
└── README.md
```

## Usage

1. **Upload DICOM Files**: Use the React client to select DICOM files and upload
2. **Monitor Jobs**: View job list and status in the client
3. **View Results**: Access completed analysis reports

## Development

### Building Images

```bash
# Build FastAPI server
docker-compose build fastapi-server

# Build React client
docker-compose build react-client

# Build all services
docker-compose build
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f fastapi-server
docker-compose logs -f rq-worker
docker-compose logs -f react-client
docker-compose logs -f rq-dashboard
docker-compose logs -f rq-dashboard
```

### Running Tests

```bash
# Test FastAPI server
cd fastapi_server
pytest

# Test React client
cd react_client
npm test
```

## Production Deployment

1. Update environment variables in `docker-compose.yml`
2. Set proper CORS origins in `fastapi_server/main.py`
3. Configure nginx reverse proxy if needed
4. Use production build for React: `npm run build`
5. Run multiple RQ workers for parallel processing

## Troubleshooting

### MongoDB Connection Issues
- Check MongoDB is running: `docker-compose ps mongodb`
- Verify connection string in environment variables
- Check network connectivity: `docker-compose exec fastapi-server ping mongodb`

### Redis Connection Issues
- Check Redis is running: `docker-compose ps redis`
- Verify Redis URL in environment variables
- Test Redis connection: `docker-compose exec fastapi-server redis-cli -h redis ping`

### Worker Not Processing Jobs
- Check worker logs: `docker-compose logs rq-worker`
- Verify Redis connection
- Ensure worker container is running: `docker-compose ps rq-worker`
- Monitor jobs in RQ Dashboard: http://localhost:9181

### RQ Dashboard Not Accessible
- Check dashboard logs: `docker-compose logs rq-dashboard`
- Verify Redis connection: `docker-compose exec rq-dashboard ping redis`
- Ensure dashboard container is running: `docker-compose ps rq-dashboard`