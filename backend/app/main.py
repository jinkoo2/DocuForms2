from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.routers.forms import router as forms_router
from app.routers.submissions import router as submissions_router
from app.routers.uploads import router as uploads_router

app = FastAPI(title="DocuForms Backend (FastAPI + Mongo)")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forms_router)
app.include_router(submissions_router)
app.include_router(uploads_router)

# Mount static files for uploads directory
# Note: Directory is named _uploads but endpoint is still /uploads
uploads_dir = Path("_uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="_uploads"), name="uploads")


@app.get("/health")
async def health():
    return {"status": "ok"}
