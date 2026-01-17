from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime


class FormTemplateIn(BaseModel):
    id: str
    name: str
    html: str = ""
    fields: List[Dict[str, Any]] = Field(default_factory=list)
    version: int = 1
    type: str = "form"  # "form" or "folder"
    parentId: str = ""  # ID of parent folder, empty string for root level


class FormTemplateOut(FormTemplateIn):
    createdAt: datetime


class SubmissionIn(BaseModel):
    values: Dict[str, Any]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    result: str
    comments: str = ""
    submissionHtml: str = ""
    attachments: Optional[List[Dict[str, str]]] = None  # List of {url: str, originalName: str} or None


class SubmissionOut(BaseModel):
    formId: str
    values: Dict[str, Any]
    metadata: Dict[str, Any]
    result: str
    formHtml: str
    submittedAt: datetime
    comments: str = ""