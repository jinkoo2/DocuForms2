from fastapi import APIRouter, HTTPException, Query
from datetime import datetime

from app.database import forms_collection, submissions_collection, convert_objectid_to_str
from app.schemas import FormTemplateIn

router = APIRouter(prefix="/api/forms", tags=["forms"])


@router.get("")
async def list_forms():
    """Get a list of all forms and folders with basic info."""
    items = []
    async for item in forms_collection.find({}, {"_id": 1, "name": 1, "createdAt": 1, "type": 1, "parentId": 1}):
        item["id"] = item["_id"]
        del item["_id"]
        # Set defaults for backward compatibility
        if "type" not in item:
            item["type"] = "form"
        if "parentId" not in item:
            item["parentId"] = ""
        items.append(convert_objectid_to_str(item))
    return items


@router.post("")
async def upsert_form(form: FormTemplateIn):
    doc = form.model_dump()
    doc["_id"] = form.id
    # Only set createdAt if this is a new document
    existing = await forms_collection.find_one({"_id": form.id})
    if not existing:
        doc["createdAt"] = datetime.utcnow()
    else:
        # Preserve existing createdAt
        doc["createdAt"] = existing.get("createdAt", datetime.utcnow())
    
    # Set defaults for backward compatibility
    if "type" not in doc:
        doc["type"] = "form"
    if "parentId" not in doc:
        doc["parentId"] = ""

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


@router.patch("/{form_id}/move")
async def move_form(form_id: str, new_parent_id: str = Query("", description="ID of the new parent folder (empty string for root)")):
    """Move a form or folder to a new parent folder."""
    item = await forms_collection.find_one({"_id": form_id})
    if not item:
        raise HTTPException(status_code=404, detail="Form or folder not found")
    
    # Validate that new_parent_id is either empty (root) or exists and is a folder
    if new_parent_id:
        parent = await forms_collection.find_one({"_id": new_parent_id})
        if not parent:
            raise HTTPException(status_code=404, detail="Target folder not found")
        if parent.get("type") != "folder":
            raise HTTPException(status_code=400, detail="Target must be a folder")
        
        # Prevent moving a folder into itself or its descendants
        if form_id == new_parent_id:
            raise HTTPException(status_code=400, detail="Cannot move folder into itself")
        
        # Check if new_parent_id is a descendant of form_id (if form_id is a folder)
        if item.get("type") == "folder":
            current = new_parent_id
            while current:
                if current == form_id:
                    raise HTTPException(status_code=400, detail="Cannot move folder into its own descendant")
                parent_item = await forms_collection.find_one({"_id": current})
                if not parent_item:
                    break
                current = parent_item.get("parentId", "")
    
    # Update the parentId
    await forms_collection.update_one(
        {"_id": form_id},
        {"$set": {"parentId": new_parent_id}}
    )
    
    return {"status": "ok", "formId": form_id, "parentId": new_parent_id}


@router.delete("/{form_id}")
async def delete_form(form_id: str):
    """Delete a form/folder and all its submissions. If folder, also delete children."""
    item = await forms_collection.find_one({"_id": form_id})
    if not item:
        raise HTTPException(status_code=404, detail="Form or folder not found")
    
    item_type = item.get("type", "form")
    
    # If it's a folder, delete all children first
    if item_type == "folder":
        # Find all children (forms and folders) in this folder
        async for child in forms_collection.find({"parentId": form_id}):
            child_id = str(child["_id"])
            # Recursively delete children (handles nested folders)
            await delete_form(child_id)
    
    # Delete the item itself
    await forms_collection.delete_one({"_id": form_id})
    
    # If it's a form, also delete all submissions
    if item_type == "form":
        await submissions_collection.delete_many({"formId": form_id})
    
    return {"status": "ok", "formId": form_id}


# Rules/references endpoints removed; all evaluation is handled by callers.
