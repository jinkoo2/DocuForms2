from fastapi import APIRouter, HTTPException
from datetime import datetime

from app.database import forms_collection, submissions_collection, convert_objectid_to_str
from app.schemas import FormTemplateIn

router = APIRouter(prefix="/api/forms", tags=["forms"])


@router.post("")
async def upsert_form(form: FormTemplateIn):
    doc = form.model_dump()
    doc["_id"] = form.id
    doc["createdAt"] = datetime.utcnow()

    await forms_collection.replace_one({"_id": form.id}, doc, upsert=True)
    return {"status": "ok", "formId": form.id}


@router.get("/{form_id}")
async def get_form(form_id: str):
    form = await forms_collection.find_one({"_id": form_id})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    form["id"] = form["_id"]
    del form["_id"]
    return form


@router.get("/{form_id}/references")
async def get_form_references_preview(form_id: str):
    """
    Optional helper endpoint for the frontend:
    returns last submission values for THIS form.

    Note: your evaluations can still reference other forms globally
    via rules (right.source=reference, right.formId=...).
    """
    last = await submissions_collection.find_one(
        {"formId": form_id},
        sort=[("submittedAt", -1)]
    )
    if last:
        return convert_objectid_to_str(last).get("values", {})
    return {}
