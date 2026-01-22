#!/usr/bin/env python3
"""
FastAPI server for CTQA (CT Quality Assurance) analysis
"""

import os
import sys
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
import redis
from rq import Queue
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

# Load environment variables
load_dotenv()

# Add parent directory to path to import CTQA modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "python_app"))

from worker import process_ctqa_analysis

app = FastAPI(title="CTQA Analysis API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://root:CHANGE_ME@localhost:27019/")
db = None
jobs_collection = None
results_collection = None
try:
    mongo_client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
    mongo_client.admin.command('ping')
    db = mongo_client["ctqa"]
    jobs_collection = db["jobs"]
    results_collection = db["results"]
    print("Connected to MongoDB")
except Exception as e:
    print(f"Warning: Could not connect to MongoDB: {e}. Some features may not work.")

# Redis connection for RQ
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6381/0")
job_queue = None
try:
    redis_conn = redis.from_url(REDIS_URL, socket_connect_timeout=5)
    redis_conn.ping()
    job_queue = Queue("ctqa_analysis", connection=redis_conn)
    print("Connected to Redis")
except Exception as e:
    print(f"Warning: Could not connect to Redis: {e}. Job queue may not work.")

# Configuration
DATA_DIR = Path(os.getenv("DATA_DIR", "./_data/devices"))
DEFAULT_DEVICE_ID = os.getenv("DEFAULT_DEVICE_ID", "pfcc_gect_catphan604")
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT", "600"))  # Default 10 minutes

def get_device_dir(device_id: str) -> Path:
    """Get the data directory for a specific device"""
    return DATA_DIR / device_id

def get_cases_dir(device_id: str) -> Path:
    """Get the cases directory for a specific device"""
    cases_dir = get_device_dir(device_id) / "cases"
    cases_dir.mkdir(parents=True, exist_ok=True)
    return cases_dir

def get_param_file(device_id: str) -> Path:
    """Get the parameter file for a specific device"""
    return get_device_dir(device_id) / "param.txt"

def get_baseline_dir(device_id: str) -> Path:
    """Get the baseline directory for a specific device"""
    return get_device_dir(device_id) / "baseline"

# Default upload directory (for backwards compatibility with browsing endpoints)
CASES_DIR = get_cases_dir(DEFAULT_DEVICE_ID)


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    created_at: str
    updated_at: Optional[str] = None
    error: Optional[str] = None
    result_path: Optional[str] = None
    device_id: Optional[str] = None
    progress: Optional[int] = None  # Progress percentage (0-100)


class JobCreateResponse(BaseModel):
    job_id: str
    status: str
    message: str


@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "CTQA Analysis API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    mongo_status = "connected" if db else "disconnected"
    redis_status = "connected" if job_queue else "disconnected"
    return {
        "status": "healthy",
        "mongodb": mongo_status,
        "redis": redis_status
    }


def read_param_file(param_file: Path) -> dict:
    """Read a param.txt file and return key-value pairs"""
    params = {}
    if param_file.exists():
        with open(param_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    params[key.strip()] = value.strip()
    return params


@app.get("/api/devices")
async def list_devices():
    """
    List all available imaging devices
    
    Returns:
        List of devices with id, name, and description
    """
    devices = []
    if DATA_DIR.exists():
        for device_dir in sorted(DATA_DIR.iterdir()):
            if device_dir.is_dir():
                param_file = device_dir / "param.txt"
                if param_file.exists():
                    # Read device info from param.txt
                    params = read_param_file(param_file)
                    has_baseline = (device_dir / "baseline").exists()
                    devices.append({
                        "id": device_dir.name,
                        "name": params.get("device_name", device_dir.name),
                        "description": params.get("device_description", ""),
                        "phantom_id": params.get("phantom_id", ""),
                        "has_baseline": has_baseline,
                        "ready": has_baseline
                    })
    return {"devices": devices}


@app.get("/api/devices/{device_id}")
async def get_device_info(device_id: str):
    """
    Get information about a specific device
    
    Args:
        device_id: Device identifier
        
    Returns:
        Device information
    """
    device_dir = get_device_dir(device_id)
    if not device_dir.exists():
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
    
    param_file = get_param_file(device_id)
    baseline_dir = get_baseline_dir(device_id)
    cases_dir = get_cases_dir(device_id)
    
    # Read device info from param.txt
    params = read_param_file(param_file)
    
    # Count cases
    case_count = 0
    if cases_dir.exists():
        case_count = len([d for d in cases_dir.iterdir() if d.is_dir()])
    
    return {
        "id": device_id,
        "name": params.get("device_name", device_id),
        "description": params.get("device_description", ""),
        "phantom_id": params.get("phantom_id", ""),
        "param_file": str(param_file),
        "baseline_dir": str(baseline_dir),
        "cases_dir": str(cases_dir),
        "has_config": param_file.exists(),
        "has_baseline": baseline_dir.exists(),
        "case_count": case_count
    }


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Get job status by job_id
    
    Args:
        job_id: Job identifier
        
    Returns:
        Job status information
    """
    if jobs_collection is not None:
        job_doc = jobs_collection.find_one({"job_id": job_id})
        if not job_doc:
            raise HTTPException(status_code=404, detail="Job not found")
        
        return JobStatusResponse(
            job_id=job_doc["job_id"],
            status=job_doc["status"],
            created_at=job_doc["created_at"],
            updated_at=job_doc.get("updated_at"),
            error=job_doc.get("error"),
            result_path=job_doc.get("result_dir"),
            device_id=job_doc.get("device_id"),
            progress=job_doc.get("progress")
        )
    else:
        raise HTTPException(status_code=503, detail="Database not available")


@app.get("/api/jobs")
async def list_jobs(limit: int = 50, skip: int = 0):
    """
    List all jobs
    
    Args:
        limit: Maximum number of jobs to return
        skip: Number of jobs to skip
        
    Returns:
        List of jobs
    """
    if jobs_collection is not None:
        jobs = list(jobs_collection.find().sort("created_at", -1).skip(skip).limit(limit))
        return [
            {
                "job_id": job["job_id"],
                "status": job["status"],
                "created_at": job["created_at"],
                "updated_at": job.get("updated_at"),
                "filename": job.get("filename")
            }
            for job in jobs
        ]
    else:
        raise HTTPException(status_code=503, detail="Database not available")


@app.get("/api/jobs/{job_id}/result")
async def get_job_result(job_id: str):
    """
    Get analysis result for a job
    
    Args:
        job_id: Job identifier
        
    Returns:
        Result information including report path
    """
    if jobs_collection is not None:
        job_doc = jobs_collection.find_one({"job_id": job_id})
        if not job_doc:
            raise HTTPException(status_code=404, detail="Job not found")
        
        if job_doc["status"] != "completed":
            raise HTTPException(
                status_code=400,
                detail=f"Job is not completed. Current status: {job_doc['status']}"
            )
        
        result_dir = job_doc.get("result_dir")
        if not result_dir or not os.path.exists(result_dir):
            raise HTTPException(status_code=404, detail="Result not found")
        
        # Find report.html
        report_path = Path(result_dir) / "3.analysis" / "report.html"
        
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Report file not found")
        
        # Get result document from MongoDB
        result_doc = None
        if results_collection is not None:
            result_doc = results_collection.find_one({"job_id": job_id})
        
        return {
            "job_id": job_id,
            "result_dir": result_dir,
            "report_path": str(report_path),
            "report_url": f"/api/jobs/{job_id}/report",
            "result_data": result_doc.get("data") if result_doc else None
        }
    else:
        raise HTTPException(status_code=503, detail="Database not available")


@app.get("/api/jobs/{job_id}/report")
async def get_job_report(job_id: str):
    """
    Get the HTML report file for a job
    
    Args:
        job_id: Job identifier
        
    Returns:
        HTML report content (displayed inline, not downloaded)
    """
    if jobs_collection is not None:
        job_doc = jobs_collection.find_one({"job_id": job_id})
        if not job_doc:
            raise HTTPException(status_code=404, detail="Job not found")
        
        result_dir = job_doc.get("result_dir")
        if not result_dir or not os.path.exists(result_dir):
            raise HTTPException(status_code=404, detail="Result not found")
        
        # Find report.html
        report_path = Path(result_dir) / "3.analysis" / "report.html"
        
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Report file not found")
        
        # Read and return HTML content directly (displays inline instead of downloading)
        with open(report_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        return HTMLResponse(content=html_content)
    else:
        raise HTTPException(status_code=503, detail="Database not available")


# ============================================================================
# Case-based upload endpoints (individual file uploads without zipping)
# ============================================================================

@app.post("/api/devices/{device_id}/cases")
async def create_case(device_id: str):
    """
    Create a new case folder for uploading DICOM files
    
    Args:
        device_id: Device identifier (e.g., pfcc_gect_catphan604)
    
    Returns:
        Case ID (formatted as YYYYMMDD_HHMMSS)
    """
    # Verify device exists
    device_dir = get_device_dir(device_id)
    if not device_dir.exists():
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
    
    # Generate case ID based on current datetime
    case_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    cases_dir = get_cases_dir(device_id)
    case_dir = cases_dir / case_id
    inputs_dir = case_dir / "0.inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)
    
    # Create case record in MongoDB
    if jobs_collection is not None:
        case_doc = {
            "job_id": case_id,  # Use case_id as job_id for consistency
            "case_id": case_id,
            "device_id": device_id,
            "status": "uploading",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "file_count": 0,
            "case_dir": str(case_dir),
            "inputs_dir": str(inputs_dir)
        }
        jobs_collection.insert_one(case_doc)
    
    return {"case_id": case_id, "device_id": device_id, "status": "created"}


@app.post("/api/devices/{device_id}/cases/{case_id}/files")
async def upload_file_to_case(device_id: str, case_id: str, file: UploadFile = File(...)):
    """
    Upload a single DICOM file to an existing case folder
    
    Args:
        device_id: Device identifier
        case_id: Case identifier
        file: Single DICOM file
        
    Returns:
        Upload status
    """
    cases_dir = get_cases_dir(device_id)
    case_dir = cases_dir / case_id
    inputs_dir = case_dir / "0.inputs"
    if not inputs_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found for device {device_id}")
    
    # Save the file to 0.inputs folder
    file_path = inputs_dir / file.filename
    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Update file count in MongoDB
    if jobs_collection is not None:
        jobs_collection.update_one(
            {"case_id": case_id, "device_id": device_id},
            {
                "$inc": {"file_count": 1},
                "$set": {"updated_at": datetime.utcnow().isoformat()}
            }
        )
    
    return {"filename": file.filename, "status": "uploaded"}


@app.post("/api/devices/{device_id}/cases/{case_id}/analyze", response_model=JobCreateResponse)
async def start_case_analysis(device_id: str, case_id: str):
    """
    Start analysis on an uploaded case
    
    Args:
        device_id: Device identifier
        case_id: Case identifier
        
    Returns:
        Job information
    """
    cases_dir = get_cases_dir(device_id)
    case_dir = cases_dir / case_id
    inputs_dir = case_dir / "0.inputs"
    param_file = get_param_file(device_id)
    
    if not inputs_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found for device {device_id}")
    
    # Count DICOM files in 0.inputs folder (case-insensitive)
    dicom_files = list(inputs_dir.glob("*.dcm")) + list(inputs_dir.glob("*.DCM"))
    # Also include files without extension (common for DICOM)
    all_files = [f for f in inputs_dir.iterdir() if f.is_file()]
    
    if len(all_files) == 0:
        raise HTTPException(status_code=400, detail="No files found in case 0.inputs folder")
    
    # Use case_id as job_id
    job_id = case_id
    # Results go to the case root folder
    result_dir = str(case_dir)
    
    # Update status in MongoDB
    if jobs_collection is not None:
        jobs_collection.update_one(
            {"case_id": case_id, "device_id": device_id},
            {
                "$set": {
                    "job_id": job_id,
                    "status": "queued",
                    "updated_at": datetime.utcnow().isoformat(),
                    "extract_dir": str(inputs_dir),
                    "result_dir": result_dir,
                    "param_file": str(param_file)
                }
            }
        )
    
    # Enqueue job with device-specific config
    if job_queue:
        job_queue.enqueue(
            process_ctqa_analysis,
            ctqa_job_id=job_id,
            extract_dir=str(inputs_dir),
            result_dir=result_dir,
            param_file=str(param_file),
            job_timeout=JOB_TIMEOUT
        )
    else:
        # Fallback: process synchronously
        try:
            process_ctqa_analysis(job_id, str(inputs_dir), result_dir, str(param_file))
            if jobs_collection is not None:
                jobs_collection.update_one(
                    {"case_id": case_id, "device_id": device_id},
                    {"$set": {"status": "completed", "updated_at": datetime.utcnow().isoformat()}}
                )
        except Exception as e:
            if jobs_collection is not None:
                jobs_collection.update_one(
                    {"case_id": case_id, "device_id": device_id},
                    {"$set": {"status": "failed", "error": str(e), "updated_at": datetime.utcnow().isoformat()}}
                )
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    return JobCreateResponse(
        job_id=job_id,
        status="queued",
        message=f"Analysis started for case {case_id} with {len(all_files)} files"
    )


@app.get("/api/cases/{case_id}")
async def get_case_status(case_id: str):
    """Get case upload status"""
    if jobs_collection is not None:
        case_doc = jobs_collection.find_one({"case_id": case_id})
        if not case_doc:
            raise HTTPException(status_code=404, detail="Case not found")
        # Remove MongoDB _id field for JSON serialization
        case_doc.pop("_id", None)
        return case_doc
    raise HTTPException(status_code=503, detail="Database not available")


@app.get("/api/cases/{case_id}/log")
async def get_case_worker_log(case_id: str):
    """
    Get the worker log file contents for a case
    
    Args:
        case_id: Case identifier
        
    Returns:
        Log file contents as plain text
    """
    case_dir = CASES_DIR / case_id
    log_file = case_dir / "worker.log"
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
    if not log_file.exists():
        return {
            "case_id": case_id,
            "log_exists": False,
            "message": "Worker log file not found. Analysis may not have started yet.",
            "content": ""
        }
    
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            "case_id": case_id,
            "log_exists": True,
            "log_file": str(log_file),
            "size_bytes": log_file.stat().st_size,
            "modified_at": datetime.fromtimestamp(log_file.stat().st_mtime).isoformat(),
            "content": content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read log file: {str(e)}")


@app.get("/api/cases/{case_id}/log/raw")
async def get_case_worker_log_raw(case_id: str):
    """
    Get the worker log file as plain text (for direct viewing)
    
    Args:
        case_id: Case identifier
        
    Returns:
        Log file contents as plain text response
    """
    from fastapi.responses import PlainTextResponse
    
    case_dir = CASES_DIR / case_id
    log_file = case_dir / "worker.log"
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
    if not log_file.exists():
        return PlainTextResponse(
            content=f"Worker log file not found for case {case_id}.\nAnalysis may not have started yet.",
            status_code=200
        )
    
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            content = f.read()
        return PlainTextResponse(content=content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read log file: {str(e)}")


# ============================================================================
# File browsing endpoints
# ============================================================================

@app.get("/api/browse/cases")
async def list_all_cases():
    """
    List all case folders in the uploads directory
    
    Returns:
        List of case folders with metadata
    """
    cases = []
    if CASES_DIR.exists():
        for item in sorted(CASES_DIR.iterdir(), reverse=True):
            if item.is_dir():
                # Count files in the case folder
                files = [f for f in item.iterdir() if f.is_file()]
                # Get folder stats
                stat = item.stat()
                cases.append({
                    "case_id": item.name,
                    "file_count": len(files),
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "size_bytes": sum(f.stat().st_size for f in files)
                })
    return {"cases": cases, "total": len(cases)}


@app.get("/api/browse/cases/{case_id}/files")
async def list_case_files(case_id: str):
    """
    List all files in a specific case folder
    
    Args:
        case_id: Case identifier (folder name)
        
    Returns:
        List of files with metadata
    """
    case_dir = CASES_DIR / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
    files = []
    for item in sorted(case_dir.iterdir()):
        if item.is_file():
            stat = item.stat()
            files.append({
                "filename": item.name,
                "size_bytes": stat.st_size,
                "size_human": f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024*1024 else f"{stat.st_size / 1024 / 1024:.2f} MB",
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "download_url": f"/api/browse/cases/{case_id}/files/{item.name}"
            })
    
    return {
        "case_id": case_id,
        "files": files,
        "total": len(files),
        "total_size_bytes": sum(f["size_bytes"] for f in files)
    }


@app.get("/api/browse/cases/{case_id}/files/{filename}")
async def download_case_file(case_id: str, filename: str):
    """
    Download a specific file from a case folder
    
    Args:
        case_id: Case identifier
        filename: Name of the file to download
        
    Returns:
        File content
    """
    file_path = CASES_DIR / case_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} not found in case {case_id}")
    
    # Security check: ensure path is within CASES_DIR
    try:
        file_path.resolve().relative_to(CASES_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return FileResponse(
        file_path,
        filename=filename,
        media_type="application/octet-stream"
    )


@app.delete("/api/browse/cases/{case_id}")
async def delete_case(case_id: str):
    """
    Delete a case folder and all its files
    
    Args:
        case_id: Case identifier
        
    Returns:
        Deletion status
    """
    case_dir = CASES_DIR / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
    # Security check
    try:
        case_dir.resolve().relative_to(CASES_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        shutil.rmtree(case_dir)
        # Also remove from MongoDB if exists
        if jobs_collection is not None:
            jobs_collection.delete_one({"case_id": case_id})
        return {"message": f"Case {case_id} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete case: {str(e)}")


# ============================================================================
# HTML Directory Browser
# ============================================================================

HTML_STYLE = """
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; font-weight: 600; }
    tr:hover { background: #f8f9fa; }
    a { color: #007bff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .folder { color: #fd7e14; }
    .file { color: #28a745; }
    .size { color: #6c757d; font-size: 0.9em; }
    .date { color: #6c757d; font-size: 0.9em; }
    .breadcrumb { margin-bottom: 20px; padding: 10px; background: #e9ecef; border-radius: 4px; }
    .breadcrumb a { margin-right: 5px; }
    .empty { color: #6c757d; font-style: italic; padding: 20px; text-align: center; }
</style>
"""

@app.get("/data/", response_class=HTMLResponse)
@app.get("/data", response_class=HTMLResponse)
async def browse_data_root_html():
    """HTML directory listing for all devices"""
    rows = []
    if DATA_DIR.exists():
        for item in sorted(DATA_DIR.iterdir()):
            if item.is_dir():
                param_file = item / "param.txt"
                params = read_param_file(param_file) if param_file.exists() else {}
                device_name = params.get("device_name", item.name)
                description = params.get("device_description", "")
                stat = item.stat()
                date_str = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
                try:
                    item_count = len(list(item.iterdir()))
                except:
                    item_count = 0
                rows.append(f"""
                    <tr>
                        <td><span class="folder">📁</span> <a href="/data/{item.name}/">{item.name}/</a></td>
                        <td class="size">{device_name}</td>
                        <td class="size">{description}</td>
                        <td class="date">{date_str}</td>
                    </tr>
                """)
    
    content = "".join(rows) if rows else '<tr><td colspan="4" class="empty">No devices found</td></tr>'
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Data - CTQA</title>
        {HTML_STYLE}
    </head>
    <body>
        <div class="container">
            <h1>📂 Devices</h1>
            <div class="breadcrumb">
                <strong>Path:</strong> /data/
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Device ID</th>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Modified</th>
                    </tr>
                </thead>
                <tbody>
                    {content}
                </tbody>
            </table>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


@app.get("/data/{path:path}/", response_class=HTMLResponse)
async def browse_data_dir_html(path: str):
    """HTML directory listing for any path under /data/"""
    target_dir = DATA_DIR / path
    if not target_dir.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {path}")
    
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {path}")
    
    # Security check
    try:
        target_dir.resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    rows = []
    items = sorted(target_dir.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    for item in items:
        stat = item.stat()
        date_str = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
        item_path = f"{path}/{item.name}"
        if item.is_dir():
            try:
                item_count = len(list(item.iterdir()))
            except:
                item_count = 0
            rows.append(f"""
                <tr>
                    <td><span class="folder">📁</span> <a href="/data/{item_path}/">{item.name}/</a></td>
                    <td class="size">{item_count} items</td>
                    <td class="date">{date_str}</td>
                </tr>
            """)
        else:
            size_str = f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024*1024 else f"{stat.st_size / 1024 / 1024:.2f} MB"
            rows.append(f"""
                <tr>
                    <td><span class="file">📄</span> <a href="/data/{item_path}">{item.name}</a></td>
                    <td class="size">{size_str}</td>
                    <td class="date">{date_str}</td>
                </tr>
            """)
    
    content = "".join(rows) if rows else '<tr><td colspan="3" class="empty">No files or folders found</td></tr>'
    
    # Build breadcrumb
    parts = path.split('/')
    breadcrumb_links = [f'<a href="/data/">data</a>']
    current_path = ""
    for part in parts:
        if part:
            current_path = f"{current_path}/{part}" if current_path else part
            breadcrumb_links.append(f'<a href="/data/{current_path}/">{part}</a>')
    breadcrumb = " / ".join(breadcrumb_links)
    
    # Get title from last part of path
    title = parts[-1] if parts and parts[-1] else "Data"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{title} - CTQA</title>
        {HTML_STYLE}
    </head>
    <body>
        <div class="container">
            <h1>📂 {title}</h1>
            <div class="breadcrumb">
                <strong>Path:</strong> {breadcrumb}
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Size</th>
                        <th>Modified</th>
                    </tr>
                </thead>
                <tbody>
                    {content}
                </tbody>
            </table>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)


# Mount data directory as static files for direct file downloads
# This must be after HTML routes to let them handle directory listings
app.mount("/data", StaticFiles(directory=str(DATA_DIR), html=False), name="data")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
