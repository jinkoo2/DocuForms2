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
from dicomtools import dicom_series_to_mhd

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://root:CHANGE_ME@localhost:27019/")
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


def update_job_status(job_id: str, status: str, error: str = None, result_dir: str = None):
    """Update job status in MongoDB"""
    if jobs_collection is not None:
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
    if results_collection is not None:
        import json
        
        # Read report HTML if available
        report_data = None
        if report_path and os.path.exists(report_path):
            try:
                with open(report_path, 'r', encoding='utf-8') as f:
                    report_data = f.read()
            except Exception as e:
                logging.warning(f"Could not read report file: {e}")
        
        # Read analysis_results.json if available
        analysis_results = None
        result_json_path = Path(result_dir) / "3.analysis" / "analysis_results.json"
        if result_json_path.exists():
            try:
                with open(result_json_path, 'r', encoding='utf-8') as f:
                    analysis_results = json.load(f)
                logging.info(f"Loaded analysis results from {result_json_path}")
            except Exception as e:
                logging.warning(f"Could not read analysis_results.json: {e}")
        
        result_doc = {
            "job_id": job_id,
            "result_dir": result_dir,
            "report_path": report_path,
            "created_at": datetime.utcnow().isoformat(),
            "data": {
                "report_html": report_data,
                "analysis_results": analysis_results
            }
        }
        
        results_collection.update_one(
            {"job_id": job_id},
            {"$set": result_doc},
            upsert=True
        )
        
        logging.info(f"Saved results to MongoDB for job {job_id}")


def setup_job_logger(job_id: str, log_file: str):
    """Set up file logging for a job"""
    # Create a logger specific to this job
    logger = logging.getLogger(f"ctqa.job.{job_id}")
    logger.setLevel(logging.DEBUG)
    
    # Remove any existing handlers
    logger.handlers = []
    
    # Create file handler
    file_handler = logging.FileHandler(log_file, mode='w', encoding='utf-8')
    file_handler.setLevel(logging.DEBUG)
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    # Add handlers
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    # Also configure root logger to write to the same file
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    # Remove existing file handlers from root
    root_logger.handlers = [h for h in root_logger.handlers if not isinstance(h, logging.FileHandler)]
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    return logger


def process_ctqa_analysis(ctqa_job_id: str, extract_dir: str, result_dir: str):
    """
    Process CTQA analysis for a job
    
    Args:
        ctqa_job_id: Job identifier (named to avoid conflict with RQ's job_id)
        extract_dir: Directory containing extracted DICOM files (0.inputs folder)
        result_dir: Directory to save results (case root folder)
    """
    job_id = ctqa_job_id  # Alias for clarity
    
    # Create result directory first so we can set up logging
    Path(result_dir).mkdir(parents=True, exist_ok=True)
    
    # Set up file logging for this job
    log_file = Path(result_dir) / "worker.log"
    logger = setup_job_logger(job_id, str(log_file))
    logger.info(f"Starting CTQA analysis for job {job_id}")
    logger.info(f"Extract dir (inputs): {extract_dir}")
    logger.info(f"Result dir (case root): {result_dir}")
    logger.info(f"Log file: {log_file}")
    
    try:
        # Update job status to processing
        update_job_status(job_id, "processing")
        
        # Initialize CTQA with parameter file
        machine_param_file = MACHINE_PARAM_FILE
        
        # Check if parameter file exists
        logger.info(f"Machine param file: {machine_param_file}")
        
        if not os.path.exists(machine_param_file):
            raise Exception(f"Machine parameter file not found: {machine_param_file}")
        
        # Convert DICOM files from extract_dir (0.inputs) to CT.mhd in result_dir (case root)
        # This ensures CTQA creates output folders (1.reg, 2.seg, 3.analysis) in the case root
        ct_mhd_path = Path(result_dir) / "CT.mhd"
        if not ct_mhd_path.exists():
            logger.info(f"Converting DICOM files from {extract_dir} to {result_dir}/CT.mhd...")
            try:
                dicom_series_to_mhd(extract_dir, result_dir)
                logger.info(f"DICOM to MHD conversion completed: {ct_mhd_path}")
            except Exception as e:
                logger.error(f"Failed to convert DICOM to MHD: {e}")
                raise
        else:
            logger.info(f"CT.mhd already exists: {ct_mhd_path}")
        
        logger.info("Initializing CTQA...")
        ctqa = CTQA(machine_param_file=machine_param_file)
        
        # Run CTQA analysis on the case root (result_dir)
        # CTQA will find CT.mhd there and create 1.reg, 2.seg, 3.analysis in the same directory
        logger.info("Starting CTQA.run()...")
        ctqa.run(result_dir)
        logger.info("CTQA.run() completed")
        
        # Find report file (outputs are now directly in result_dir)
        report_path = Path(result_dir) / "3.analysis" / "report.html"
        
        # Update job status to completed
        update_job_status(job_id, "completed", result_dir=str(result_dir))
        
        # Save result to MongoDB
        save_result_to_db(job_id, str(result_dir), str(report_path) if report_path.exists() else None)
        
        logger.info(f"Job {job_id} completed successfully")
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Job {job_id} failed: {error_msg}")
        logger.exception("Full traceback:")
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
