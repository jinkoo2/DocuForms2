from pydantic import BaseModel, Field
from typing import Any, Dict, List
from datetime import datetime


class FormTemplateIn(BaseModel):
    id: str
    name: str
    html: str = ""
    fields: List[Dict[str, Any]] = Field(default_factory=list)
    version: int = 1


class FormTemplateOut(FormTemplateIn):
    createdAt: datetime


class SubmissionIn(BaseModel):
    values: Dict[str, Any]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    result: str
    comments: str = ""


class SubmissionOut(BaseModel):
    formId: str
    values: Dict[str, Any]
    metadata: Dict[str, Any]
    result: str
    formHtml: str
    submittedAt: datetime
    comments: str = ""