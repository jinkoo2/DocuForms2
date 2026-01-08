from fastapi import APIRouter, HTTPException
from datetime import datetime

from app.database import forms_collection, submissions_collection, convert_objectid_to_str
from app.schemas import SubmissionIn
from app.rules import evaluate_rules

router = APIRouter(prefix="/api/forms", tags=["submissions"])


@router.post("/{form_id}/submit")
async def submit_form(form_id: str, submission: SubmissionIn):
    form = await forms_collection.find_one({"_id": form_id})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    rules = form.get("rules", [])
    all_passed, references_used, details = await evaluate_rules(rules, submission.values)

    computed = {
        "result": "PASS" if all_passed else "FAIL",
        "details": details,  # keep/remove depending on what you want to return
    }

    doc = {
        "formId": form_id,
        "values": submission.values,
        "referencesUsed": references_used,
        "computed": computed,
        "submittedAt": datetime.utcnow()
    }

    await submissions_collection.insert_one(doc)
    return convert_objectid_to_str(doc)
