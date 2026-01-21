#!/usr/bin/env python3
"""
FastAPI server for CTQA (CT Quality Assurance) analysis
"""

import os
import sys
import uuid
import zipfile
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://root:catphan123@localhost:27018/")
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
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6380/0")
job_queue = None
try:
    redis_conn = redis.from_url(REDIS_URL, socket_connect_timeout=5)
    redis_conn.ping()
    job_queue = Queue("ctqa_analysis", connection=redis_conn)
    print("Connected to Redis")
except Exception as e:
    print(f"Warning: Could not connect to Redis: {e}. Job queue may not work.")

# Configuration
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
RESULTS_DIR = Path(os.getenv("RESULTS_DIR", "./results"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


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


@app.post("/api/jobs", response_model=JobCreateResponse)
async def create_job(file: UploadFile = File(...)):
    """
    Upload a zipped DICOM file and create an analysis job
    
    Args:
        file: Zipped DICOM files
        
    Returns:
        Job information with job_id
    """
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="File must be a ZIP archive")
    
    # Generate unique job ID
    job_id = str(uuid.uuid4())
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Save uploaded file
    zip_path = job_dir / file.filename
    try:
        with open(zip_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Extract ZIP file
    extract_dir = job_dir / "extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract ZIP file: {str(e)}")
    
    # Create job record in MongoDB
    job_doc = {
        "job_id": job_id,
        "status": "queued",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "filename": file.filename,
        "extract_dir": str(extract_dir),
        "result_dir": None,
        "error": None
    }
    
    if jobs_collection:
        jobs_collection.insert_one(job_doc)
    
    # Enqueue job
    if job_queue:
        job = job_queue.enqueue(
            process_ctqa_analysis,
            job_id=job_id,
            extract_dir=str(extract_dir),
            result_dir=str(RESULTS_DIR / job_id)
        )
        job_id_in_queue = job.id
    else:
        # Fallback: process synchronously if Redis is not available
        # This is not recommended for production
        try:
            process_ctqa_analysis(job_id, str(extract_dir), str(RESULTS_DIR / job_id))
            job_doc["status"] = "completed"
            job_doc["updated_at"] = datetime.utcnow().isoformat()
            if jobs_collection:
                jobs_collection.update_one(
                    {"job_id": job_id},
                    {"$set": job_doc}
                )
        except Exception as e:
            job_doc["status"] = "failed"
            job_doc["error"] = str(e)
            job_doc["updated_at"] = datetime.utcnow().isoformat()
            if jobs_collection:
                jobs_collection.update_one(
                    {"job_id": job_id},
                    {"$set": job_doc}
                )
            raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    
    return JobCreateResponse(
        job_id=job_id,
        status="queued",
        message="Job created successfully"
    )


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """
    Get job status by job_id
    
    Args:
        job_id: Job identifier
        
    Returns:
        Job status information
    """
    if jobs_collection:
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
    if jobs_collection:
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
    if jobs_collection:
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
        report_path = Path(result_dir) / "3.analysis" / "report.test.html"
        if not report_path.exists():
            report_path = Path(result_dir) / "3.analysis" / "report.html"
        
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Report file not found")
        
        # Get result document from MongoDB
        result_doc = None
        if results_collection:
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
        HTML report content
    """
    if jobs_collection:
        job_doc = jobs_collection.find_one({"job_id": job_id})
        if not job_doc:
            raise HTTPException(status_code=404, detail="Job not found")
        
        result_dir = job_doc.get("result_dir")
        if not result_dir or not os.path.exists(result_dir):
            raise HTTPException(status_code=404, detail="Result not found")
        
        # Find report.html
        report_path = Path(result_dir) / "3.analysis" / "report.test.html"
        if not report_path.exists():
            report_path = Path(result_dir) / "3.analysis" / "report.html"
        
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="Report file not found")
        
        from fastapi.responses import FileResponse
        return FileResponse(
            report_path,
            media_type="text/html",
            filename=f"report_{job_id}.html"
        )
    else:
        raise HTTPException(status_code=503, detail="Database not available")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
