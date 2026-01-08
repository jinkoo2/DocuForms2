from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime


Operator = Literal["<", "<=", ">", ">=", "==", "!="]


class RuleRightReference(BaseModel):
    source: Literal["reference"]
    # GLOBAL scope: you must specify which form’s submissions to reference
    formId: str
    field: str
    mode: Literal["last"] = "last"


class RuleRightConstant(BaseModel):
    source: Literal["constant"]
    value: Any


class Rule(BaseModel):
    type: Literal["pass_fail"] = "pass_fail"
    left: str
    operator: Operator
    right: Dict[str, Any]  # validated in code to allow easy extension


class FormTemplateIn(BaseModel):
    id: str
    name: str
    html: str = ""
    fields: List[Dict[str, Any]] = Field(default_factory=list)
    rules: List[Rule] = Field(default_factory=list)
    version: int = 1


class FormTemplateOut(FormTemplateIn):
    createdAt: datetime


class SubmissionIn(BaseModel):
    values: Dict[str, Any]


class SubmissionOut(BaseModel):
    formId: str
    values: Dict[str, Any]
    referencesUsed: Dict[str, Any]
    computed: Dict[str, Any]
    submittedAt: datetime
