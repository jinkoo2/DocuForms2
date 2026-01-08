from fastapi import FastAPI
from app.routers.forms import router as forms_router
from app.routers.submissions import router as submissions_router

app = FastAPI(title="DocuForms Backend (FastAPI + Mongo)")

app.include_router(forms_router)
app.include_router(submissions_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
