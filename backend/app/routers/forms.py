from fastapi import APIRouter, HTTPException
from datetime import datetime

from app.database import forms_collection, submissions_collection, convert_objectid_to_str
from app.schemas import FormTemplateIn

router = APIRouter(prefix="/api/forms", tags=["forms"])


@router.get("")
async def list_forms():
    """Get a list of all forms with basic info."""
    forms = []
    async for form in forms_collection.find({}, {"_id": 1, "name": 1, "createdAt": 1}):
        form["id"] = form["_id"]
        del form["_id"]
        forms.append(convert_objectid_to_str(form))
    return forms


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


@router.delete("/{form_id}")
async def delete_form(form_id: str):
    """Delete a form and all its submissions."""
    form = await forms_collection.find_one({"_id": form_id})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    # Delete the form
    await forms_collection.delete_one({"_id": form_id})
    
    # Also delete all submissions for this form
    await submissions_collection.delete_many({"formId": form_id})
    
    return {"status": "ok", "formId": form_id}


# Rules/references endpoints removed; all evaluation is handled by callers.
