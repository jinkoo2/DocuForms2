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
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./_uploads"))
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT", "600"))  # Default 10 minutes
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    created_at: str
    updated_at: Optional[str] = None
    error: Optional[str] = None
    result_path: Optional[str] = None


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
            result_path=job_doc.get("result_dir")
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

@app.post("/api/cases")
async def create_case():
    """
    Create a new case folder for uploading DICOM files
    
    Returns:
        Case ID (formatted as YYYYMMDD_HHMMSS)
    """
    # Generate case ID based on current datetime
    case_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    case_dir = UPLOAD_DIR / case_id
    inputs_dir = case_dir / "0.inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)
    
    # Create case record in MongoDB
    if jobs_collection is not None:
        case_doc = {
            "job_id": case_id,  # Use case_id as job_id for consistency
            "case_id": case_id,
            "status": "uploading",
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "file_count": 0,
            "case_dir": str(case_dir),
            "inputs_dir": str(inputs_dir)
        }
        jobs_collection.insert_one(case_doc)
    
    return {"case_id": case_id, "status": "created"}


@app.post("/api/cases/{case_id}/files")
async def upload_file_to_case(case_id: str, file: UploadFile = File(...)):
    """
    Upload a single DICOM file to an existing case folder
    
    Args:
        case_id: Case identifier
        file: Single DICOM file
        
    Returns:
        Upload status
    """
    case_dir = UPLOAD_DIR / case_id
    inputs_dir = case_dir / "0.inputs"
    if not inputs_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
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
            {"case_id": case_id},
            {
                "$inc": {"file_count": 1},
                "$set": {"updated_at": datetime.utcnow().isoformat()}
            }
        )
    
    return {"filename": file.filename, "status": "uploaded"}


@app.post("/api/cases/{case_id}/analyze", response_model=JobCreateResponse)
async def start_case_analysis(case_id: str):
    """
    Start analysis on an uploaded case
    
    Args:
        case_id: Case identifier
        
    Returns:
        Job information
    """
    case_dir = UPLOAD_DIR / case_id
    inputs_dir = case_dir / "0.inputs"
    
    if not inputs_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
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
            {"case_id": case_id},
            {
                "$set": {
                    "job_id": job_id,
                    "status": "queued",
                    "updated_at": datetime.utcnow().isoformat(),
                    "extract_dir": str(inputs_dir),
                    "result_dir": result_dir
                }
            }
        )
    
    # Enqueue job
    if job_queue:
        job_queue.enqueue(
            process_ctqa_analysis,
            ctqa_job_id=job_id,
            extract_dir=str(inputs_dir),
            result_dir=result_dir,
            job_timeout=JOB_TIMEOUT
        )
    else:
        # Fallback: process synchronously
        try:
            process_ctqa_analysis(job_id, str(inputs_dir), result_dir)
            if jobs_collection is not None:
                jobs_collection.update_one(
                    {"case_id": case_id},
                    {"$set": {"status": "completed", "updated_at": datetime.utcnow().isoformat()}}
                )
        except Exception as e:
            if jobs_collection is not None:
                jobs_collection.update_one(
                    {"case_id": case_id},
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
    case_dir = UPLOAD_DIR / case_id
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
    
    case_dir = UPLOAD_DIR / case_id
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
    if UPLOAD_DIR.exists():
        for item in sorted(UPLOAD_DIR.iterdir(), reverse=True):
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
    case_dir = UPLOAD_DIR / case_id
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
    file_path = UPLOAD_DIR / case_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} not found in case {case_id}")
    
    # Security check: ensure path is within UPLOAD_DIR
    try:
        file_path.resolve().relative_to(UPLOAD_DIR.resolve())
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
    case_dir = UPLOAD_DIR / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
    # Security check
    try:
        case_dir.resolve().relative_to(UPLOAD_DIR.resolve())
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

@app.get("/cases/", response_class=HTMLResponse)
@app.get("/cases", response_class=HTMLResponse)
async def browse_cases_html():
    """HTML directory listing for all cases"""
    rows = []
    if UPLOAD_DIR.exists():
        for item in sorted(UPLOAD_DIR.iterdir(), reverse=True):
            if item.is_dir():
                files = [f for f in item.iterdir() if f.is_file()]
                stat = item.stat()
                size = sum(f.stat().st_size for f in files)
                size_str = f"{size / 1024:.1f} KB" if size < 1024*1024 else f"{size / 1024 / 1024:.2f} MB"
                date_str = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
                rows.append(f"""
                    <tr>
                        <td><span class="folder">📁</span> <a href="/cases/{item.name}/">{item.name}/</a></td>
                        <td class="size">{len(files)} files</td>
                        <td class="size">{size_str}</td>
                        <td class="date">{date_str}</td>
                    </tr>
                """)
    
    content = "".join(rows) if rows else '<tr><td colspan="4" class="empty">No cases found</td></tr>'
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Cases - CTQA</title>
        {HTML_STYLE}
    </head>
    <body>
        <div class="container">
            <h1>📂 Cases</h1>
            <div class="breadcrumb">
                <strong>Path:</strong> /cases/
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Files</th>
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


@app.get("/cases/{case_id}/", response_class=HTMLResponse)
async def browse_case_files_html(case_id: str):
    """HTML directory listing for files and folders in a case"""
    case_dir = UPLOAD_DIR / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
    
    rows = []
    # First list directories, then files
    items = sorted(case_dir.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    for item in items:
        stat = item.stat()
        date_str = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
        if item.is_dir():
            # Count items in directory
            try:
                item_count = len(list(item.iterdir()))
            except:
                item_count = 0
            rows.append(f"""
                <tr>
                    <td><span class="folder">📁</span> <a href="/cases/{case_id}/{item.name}/">{item.name}/</a></td>
                    <td class="size">{item_count} items</td>
                    <td class="date">{date_str}</td>
                </tr>
            """)
        else:
            size_str = f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024*1024 else f"{stat.st_size / 1024 / 1024:.2f} MB"
            rows.append(f"""
                <tr>
                    <td><span class="file">📄</span> <a href="/cases/{case_id}/{item.name}">{item.name}</a></td>
                    <td class="size">{size_str}</td>
                    <td class="date">{date_str}</td>
                </tr>
            """)
    
    content = "".join(rows) if rows else '<tr><td colspan="3" class="empty">No files or folders found</td></tr>'
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{case_id} - CTQA</title>
        {HTML_STYLE}
    </head>
    <body>
        <div class="container">
            <h1>📂 {case_id}</h1>
            <div class="breadcrumb">
                <strong>Path:</strong> <a href="/cases/">cases</a> / {case_id}/
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


@app.get("/cases/{case_id}/{subpath:path}/", response_class=HTMLResponse)
async def browse_case_subdir_html(case_id: str, subpath: str):
    """HTML directory listing for subdirectories in a case"""
    target_dir = UPLOAD_DIR / case_id / subpath
    if not target_dir.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {case_id}/{subpath}")
    
    if not target_dir.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {case_id}/{subpath}")
    
    # Security check
    try:
        target_dir.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    rows = []
    items = sorted(target_dir.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    for item in items:
        stat = item.stat()
        date_str = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
        item_path = f"{case_id}/{subpath}/{item.name}"
        if item.is_dir():
            try:
                item_count = len(list(item.iterdir()))
            except:
                item_count = 0
            rows.append(f"""
                <tr>
                    <td><span class="folder">📁</span> <a href="/cases/{item_path}/">{item.name}/</a></td>
                    <td class="size">{item_count} items</td>
                    <td class="date">{date_str}</td>
                </tr>
            """)
        else:
            size_str = f"{stat.st_size / 1024:.1f} KB" if stat.st_size < 1024*1024 else f"{stat.st_size / 1024 / 1024:.2f} MB"
            rows.append(f"""
                <tr>
                    <td><span class="file">📄</span> <a href="/cases/{item_path}">{item.name}</a></td>
                    <td class="size">{size_str}</td>
                    <td class="date">{date_str}</td>
                </tr>
            """)
    
    content = "".join(rows) if rows else '<tr><td colspan="3" class="empty">No files or folders found</td></tr>'
    
    # Build breadcrumb
    parts = subpath.split('/')
    breadcrumb_links = [f'<a href="/cases/">cases</a>', f'<a href="/cases/{case_id}/">{case_id}</a>']
    current_path = case_id
    for part in parts:
        if part:
            current_path = f"{current_path}/{part}"
            breadcrumb_links.append(f'<a href="/cases/{current_path}/">{part}</a>')
    breadcrumb = " / ".join(breadcrumb_links)
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{case_id}/{subpath} - CTQA</title>
        {HTML_STYLE}
    </head>
    <body>
        <div class="container">
            <h1>📂 {subpath.split('/')[-1] or case_id}</h1>
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


# Mount uploads directory as static files for direct file downloads
# This must be after HTML routes to let them handle directory listings
app.mount("/cases", StaticFiles(directory=str(UPLOAD_DIR), html=False), name="cases")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
