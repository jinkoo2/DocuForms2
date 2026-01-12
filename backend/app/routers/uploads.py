from fastapi import APIRouter, UploadFile, File, HTTPException
import uuid
from pathlib import Path
from app.config import settings

router = APIRouter(prefix="/api", tags=["uploads"])

# Create uploads directory if it doesn't exist
# Note: Directory is named _uploads but endpoint is still /uploads
UPLOAD_DIR = Path("_uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload a file and return its URL.
    Files are served statically at /uploads/{filename}
    Supports large files up to MAX_UPLOAD_SIZE (default: 1GB)
    """
    try:
        # Generate a unique filename to avoid conflicts
        file_extension = Path(file.filename).suffix if file.filename else ""
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        file_path = UPLOAD_DIR / unique_filename
        
        # Stream the file in chunks to handle large files efficiently
        max_size = settings.MAX_UPLOAD_SIZE
        total_size = 0
        chunk_size = 1024 * 1024  # 1MB chunks
        
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                
                total_size += len(chunk)
                
                # Check size limit during upload
                if total_size > max_size:
                    # Delete the partial file
                    file_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File size exceeds maximum allowed size of {max_size / (1024*1024*1024):.2f}GB"
                    )
                
                buffer.write(chunk)
        
        # Return the URL (files are served statically at /uploads/{filename})
        file_url = f"/uploads/{unique_filename}"
        return {
            "url": file_url,
            "filename": unique_filename,
            "size": total_size
        }
    
    except HTTPException:
        raise
    except Exception as e:
        # Clean up partial file on error
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")
