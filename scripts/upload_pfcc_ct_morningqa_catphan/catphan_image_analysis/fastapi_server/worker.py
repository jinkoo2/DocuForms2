#!/usr/bin/env python3
"""
RQ worker for processing CTQA analysis jobs
"""

import os
import sys
import logging
from pathlib import Path
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path to import CTQA modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "python_app"))

from ctqa import CTQA
from param import Param

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://root:catphan123@localhost:27018/")
try:
    mongo_client = MongoClient(MONGODB_URL)
    db = mongo_client["ctqa"]
    jobs_collection = db["jobs"]
    results_collection = db["results"]
except Exception as e:
    print(f"Warning: Could not connect to MongoDB: {e}")
    jobs_collection = None
    results_collection = None

# Configuration
MACHINE_PARAM_FILE = os.getenv("MACHINE_PARAM_FILE", "./config/machine_param.txt")
SERVICE_PARAM_FILE = os.getenv("SERVICE_PARAM_FILE", "./config/service_param.txt")


def update_job_status(job_id: str, status: str, error: str = None, result_dir: str = None):
    """Update job status in MongoDB"""
    if jobs_collection:
        update_doc = {
            "status": status,
            "updated_at": datetime.utcnow().isoformat()
        }
        if error:
            update_doc["error"] = error
        if result_dir:
            update_doc["result_dir"] = result_dir
        
        jobs_collection.update_one(
            {"job_id": job_id},
            {"$set": update_doc}
        )


def save_result_to_db(job_id: str, result_dir: str, report_path: str = None):
    """Save analysis result to MongoDB"""
    if results_collection:
        # Read report HTML if available
        report_data = None
        if report_path and os.path.exists(report_path):
            try:
                with open(report_path, 'r', encoding='utf-8') as f:
                    report_data = f.read()
            except Exception as e:
                logging.warning(f"Could not read report file: {e}")
        
        result_doc = {
            "job_id": job_id,
            "result_dir": result_dir,
            "report_path": report_path,
            "created_at": datetime.utcnow().isoformat(),
            "data": {
                "report_html": report_data
            }
        }
        
        results_collection.update_one(
            {"job_id": job_id},
            {"$set": result_doc},
            upsert=True
        )


def process_ctqa_analysis(job_id: str, extract_dir: str, result_dir: str):
    """
    Process CTQA analysis for a job
    
    Args:
        job_id: Job identifier
        extract_dir: Directory containing extracted DICOM files
        result_dir: Directory to save results
    """
    try:
        # Update job status to processing
        update_job_status(job_id, "processing")
        
        # Create result directory
        Path(result_dir).mkdir(parents=True, exist_ok=True)
        
        # Initialize CTQA with parameter files
        machine_param_file = MACHINE_PARAM_FILE
        service_param_file = SERVICE_PARAM_FILE
        
        # Check if parameter files exist
        if not os.path.exists(machine_param_file):
            raise Exception(f"Machine parameter file not found: {machine_param_file}")
        
        ctqa = CTQA(
            machine_param_file=machine_param_file,
            service_param_file=service_param_file
        )
        
        # Run CTQA analysis
        # The extract_dir contains the DICOM files
        # CTQA will create CT.mhd from DICOM files and process
        # Note: CTQA.run() expects case_dir to contain DICOM files or CT.mhd
        # It will create CT.mhd if not present, then process
        ctqa.run(extract_dir)
        
        # After processing, results are in extract_dir/3.analysis/report.test.html
        
        # Move results to result_dir
        # CTQA creates results in extract_dir/3.analysis
        analysis_dir = Path(extract_dir) / "3.analysis"
        if analysis_dir.exists():
            result_analysis_dir = Path(result_dir) / "3.analysis"
            result_analysis_dir.mkdir(parents=True, exist_ok=True)
            
            # Copy all files from analysis_dir to result_analysis_dir
            import shutil
            for file in analysis_dir.iterdir():
                if file.is_file():
                    shutil.copy2(file, result_analysis_dir / file.name)
        
        # Also copy other directories if they exist (1.reg, 2.seg, etc.)
        for subdir in ["1.reg", "2.seg"]:
            src_subdir = Path(extract_dir) / subdir
            if src_subdir.exists():
                dst_subdir = Path(result_dir) / subdir
                shutil.copytree(src_subdir, dst_subdir, dirs_exist_ok=True)
        
        # Copy CT.mhd if it exists
        ct_mhd_src = Path(extract_dir) / "CT.mhd"
        if ct_mhd_src.exists():
            shutil.copy2(ct_mhd_src, Path(result_dir) / "CT.mhd")
            ct_raw_src = Path(extract_dir) / "CT.raw"
            if ct_raw_src.exists():
                shutil.copy2(ct_raw_src, Path(result_dir) / "CT.raw")
        
        # Find report file
        report_path = Path(result_dir) / "3.analysis" / "report.test.html"
        if not report_path.exists():
            report_path = Path(result_dir) / "3.analysis" / "report.html"
        
        # Update job status to completed
        update_job_status(job_id, "completed", result_dir=str(result_dir))
        
        # Save result to MongoDB
        save_result_to_db(job_id, str(result_dir), str(report_path) if report_path.exists() else None)
        
        logging.info(f"Job {job_id} completed successfully")
        
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Job {job_id} failed: {error_msg}")
        update_job_status(job_id, "failed", error=error_msg)
        raise


if __name__ == "__main__":
    # This can be used to test the worker function directly
    import sys
    if len(sys.argv) >= 4:
        job_id = sys.argv[1]
        extract_dir = sys.argv[2]
        result_dir = sys.argv[3]
        process_ctqa_analysis(job_id, extract_dir, result_dir)
    else:
        print("Usage: worker.py <job_id> <extract_dir> <result_dir>")
