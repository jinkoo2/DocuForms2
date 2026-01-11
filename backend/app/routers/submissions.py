from fastapi import APIRouter, HTTPException
from datetime import datetime

from app.database import forms_collection, submissions_collection, convert_objectid_to_str
from app.schemas import SubmissionIn

router = APIRouter(prefix="/api/forms", tags=["submissions"])


@router.post("/{form_id}/submit")
async def submit_form(form_id: str, submission: SubmissionIn):
    form = await forms_collection.find_one({"_id": form_id})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    # Caller provides the computed result; backend simply stores it with metadata and HTML snapshot.
    doc = {
        "formId": form_id,
        "values": submission.values,
        "metadata": submission.metadata,
        "result": submission.result,
        "formHtml": form.get("html", ""),
        "submittedAt": datetime.utcnow()
    }

    await submissions_collection.insert_one(doc)
    return convert_objectid_to_str(doc)
