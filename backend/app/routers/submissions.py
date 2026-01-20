from fastapi import APIRouter, HTTPException, Query
from datetime import datetime
from bson import ObjectId

from app.database import forms_collection, submissions_collection, convert_objectid_to_str
from app.schemas import SubmissionIn

router = APIRouter(prefix="/api/forms", tags=["submissions"])


@router.post("/{form_id}/submit")
async def submit_form(form_id: str, submission: SubmissionIn):
    form = await forms_collection.find_one({"_id": form_id})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    # Process values to convert datetime-local fields to datetime objects
    # Check metadata for fields with type="datetime-local" and convert their values
    processed_values = submission.values.copy()
    for field_key, field_meta in submission.metadata.items():
        # Check if this field is a datetime-local input
        if isinstance(field_meta, dict) and field_meta.get('type') == 'datetime-local':
            if field_key in processed_values:
                field_value = processed_values[field_key]
                if isinstance(field_value, str) and field_value.strip():
                    try:
                        # Parse datetime-local format (YYYY-MM-DDTHH:mm) or ISO format to datetime
                        # datetime-local doesn't include seconds or timezone
                        if 'T' in field_value:
                            # Try parsing as ISO format first (handles with/without seconds, with/without timezone)
                            dt = datetime.fromisoformat(field_value.replace('Z', '+00:00'))
                            processed_values[field_key] = dt.replace(tzinfo=None)
                        else:
                            # Try other formats if needed
                            dt = datetime.strptime(field_value, '%Y-%m-%d %H:%M:%S')
                            processed_values[field_key] = dt
                    except (ValueError, AttributeError):
                        # If parsing fails, keep as string
                        pass

    # Special handling for performed_at: convert to performedAt as ISODate
    performed_at_value = None
    if "performed_at" in processed_values:
        performed_at_raw = processed_values["performed_at"]
        if isinstance(performed_at_raw, datetime):
            # Already a datetime object
            performed_at_value = performed_at_raw
        elif isinstance(performed_at_raw, str) and performed_at_raw.strip():
            # Try to parse as datetime string
            try:
                if 'T' in performed_at_raw:
                    # ISO format
                    dt = datetime.fromisoformat(performed_at_raw.replace('Z', '+00:00'))
                    performed_at_value = dt.replace(tzinfo=None)
                else:
                    # Try other common formats
                    for fmt in ['%Y-%m-%d %H:%M:%S', '%Y%m%d_%H%M%S', '%Y-%m-%d %H:%M']:
                        try:
                            performed_at_value = datetime.strptime(performed_at_raw, fmt)
                            break
                        except ValueError:
                            continue
            except (ValueError, AttributeError):
                # If parsing fails, leave as None
                pass

    # Caller provides the computed result; backend simply stores it with metadata and HTML snapshot.
    doc = {
        "formId": form_id,
        "values": processed_values,
        "metadata": submission.metadata,
        "result": submission.result,
        "formHtml": form.get("html", ""),
        "submissionHtml": submission.submissionHtml or "",
        "comments": submission.comments or "",
        "attachments": submission.attachments if submission.attachments and len(submission.attachments) > 0 else None,
        "submittedAt": datetime.utcnow()
    }
    
    # Add performedAt if we successfully parsed performed_at
    if performed_at_value:
        doc["performedAt"] = performed_at_value

    await submissions_collection.insert_one(doc)
    return convert_objectid_to_str(doc)


@router.get("/{form_id}/submissions")
async def list_submissions(form_id: str):
    """Return submissions for a form (most recent first)."""
    submissions = []
    cursor = submissions_collection.find(
        {"formId": form_id},
        sort=[("submittedAt", -1)]
    )
    async for doc in cursor:
        doc = convert_objectid_to_str(doc)
        attachments_data = doc.get("attachments")
        
        submissions.append({
            "id": doc.get("_id"),
            "formId": doc.get("formId"),  # Include formId to verify it matches
            "values": doc.get("values", {}),
            "metadata": doc.get("metadata", {}),
            "result": doc.get("result"),
            "submittedAt": doc.get("submittedAt"),
            "performedAt": doc.get("performedAt"),  # Include performedAt if present
            "formHtml": doc.get("formHtml", ""),
            "submissionHtml": doc.get("submissionHtml", ""),
            "baseline": doc.get("baseline", False),
            "comments": doc.get("comments", ""),
            "attachments": attachments_data if attachments_data else None,
        })
    return submissions


@router.delete("/{form_id}/submissions/{submission_id}")
async def delete_submission(form_id: str, submission_id: str):
    """Delete a single submission by id."""
    try:
        oid = ObjectId(submission_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid submission id")

    result = await submissions_collection.delete_one({"_id": oid, "formId": form_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Submission not found")
    return {"status": "ok", "deletedId": submission_id}


@router.put("/{form_id}/submissions/{submission_id}/baseline")
async def set_baseline(form_id: str, submission_id: str, is_baseline: bool = Query(True)):
    """Set or unset a submission as baseline. Only one baseline per form."""
    try:
        oid = ObjectId(submission_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid submission id")

    # Verify submission exists and belongs to this form
    submission = await submissions_collection.find_one({"_id": oid, "formId": form_id})
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if is_baseline:
        # Unset all other baselines for this form
        await submissions_collection.update_many(
            {"formId": form_id, "_id": {"$ne": oid}},
            {"$set": {"baseline": False}}
        )
        # Set this one as baseline
        await submissions_collection.update_one(
            {"_id": oid},
            {"$set": {"baseline": True}}
        )
    else:
        # Just unset this one
        await submissions_collection.update_one(
            {"_id": oid},
            {"$set": {"baseline": False}}
        )

    return {"status": "ok", "submissionId": submission_id, "baseline": is_baseline}
