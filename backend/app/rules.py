from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Tuple

from app.database import submissions_collection


def _to_number(x: Any):
    # basic helper: allow numeric strings like "12.3"
    if isinstance(x, (int, float)):
        return x
    if isinstance(x, str):
        try:
            return float(x)
        except ValueError:
            return x
    return x


async def resolve_reference(right: Dict[str, Any]) -> Tuple[Any, str]:
    """
    right example:
      {"source":"reference","formId":"baseline_temp","field":"temperature","mode":"last"}

    Returns (value, reference_key_string)
    """
    mode = right.get("mode", "last")
    form_id = right.get("formId")
    field = right.get("field")

    ref_key = f"{form_id}.{field}.{mode}"

    if not form_id or not field:
        return None, ref_key

    if mode == "last":
        doc = await submissions_collection.find_one(
            {"formId": form_id},
            sort=[("submittedAt", -1)]
        )
        if not doc:
            return None, ref_key
        return doc.get("values", {}).get(field), ref_key

    # extend here later: avg/min/max/rolling, etc.
    return None, ref_key


def _compare(left: Any, op: str, right: Any) -> bool:
    left = _to_number(left)
    right = _to_number(right)

    if op == "<":
        return left < right
    if op == "<=":
        return left <= right
    if op == ">":
        return left > right
    if op == ">=":
        return left >= right
    if op == "==":
        return left == right
    if op == "!=":
        return left != right
    return False


async def evaluate_rules(
    rules: list[Dict[str, Any]],
    values: Dict[str, Any]
) -> Tuple[bool, Dict[str, Any], Dict[str, Any]]:
    """
    Returns:
      (all_passed, references_used, details)

    references_used is stored for audit.
    details can be returned to UI if desired.
    """
    references_used: Dict[str, Any] = {}
    details: Dict[str, Any] = {"rules": []}
    passed_all = True

    for r in rules:
        left_name = r.get("left")
        op = r.get("operator")
        right = r.get("right", {})

        left_val = values.get(left_name)

        right_val = None
        ref_key = None

        if right.get("source") == "reference":
            right_val, ref_key = await resolve_reference(right)
            references_used[ref_key] = right_val
        elif right.get("source") == "constant":
            right_val = right.get("value")

        ok = False
        try:
            ok = _compare(left_val, op, right_val)
        except Exception:
            ok = False

        details["rules"].append({
            "left": left_name,
            "leftValue": left_val,
            "operator": op,
            "right": right,
            "rightValue": right_val,
            "passed": ok,
            "referenceKey": ref_key
        })

        if not ok:
            passed_all = False

    return passed_all, references_used, details
