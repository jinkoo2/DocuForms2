from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.forms import router as forms_router
from app.routers.submissions import router as submissions_router

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


@app.get("/health")
async def health():
    return {"status": "ok"}
