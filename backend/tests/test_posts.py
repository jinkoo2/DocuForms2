import requests

BASE_URL = "http://localhost:8001/api/forms"


def test_global_reference_flow():
    """
    Equivalent to Step 6 curl commands:

    1. Create baseline_temp form
    2. Submit baseline temperature
    3. Create daily_check form referencing baseline_temp.temperature
    4. Submit daily_check value and verify PASS
    """

    # ---------- 1. Create baseline form ----------
    baseline_form = {
        "id": "baseline_temp",
        "name": "Baseline Temperature",
        "html": "",
        "fields": [
            {"name": "temperature", "type": "number"}
        ],
        "rules": []
    }

    r = requests.post(BASE_URL, json=baseline_form)
    assert r.status_code == 200
    assert r.json()["formId"] == "baseline_temp"

    # ---------- 2. Submit baseline value ----------
    r = requests.post(
        f"{BASE_URL}/baseline_temp/submit",
        json={"values": {"temperature": 30}}
    )
    assert r.status_code == 200
    data = r.json()

    assert data["formId"] == "baseline_temp"
    assert data["values"]["temperature"] == 30
    assert data["computed"]["result"] == "PASS"

    # ---------- 3. Create daily check form (global reference) ----------
    daily_form = {
        "id": "daily_check",
        "name": "Daily Check",
        "html": "",
        "fields": [
            {"name": "temperature", "type": "number"}
        ],
        "rules": [
            {
                "type": "pass_fail",
                "left": "temperature",
                "operator": "<",
                "right": {
                    "source": "reference",
                    "formId": "baseline_temp",
                    "field": "temperature",
                    "mode": "last"
                }
            }
        ]
    }

    r = requests.post(BASE_URL, json=daily_form)
    assert r.status_code == 200
    assert r.json()["formId"] == "daily_check"

    # ---------- 4. Submit daily check (should PASS) ----------
    r = requests.post(
        f"{BASE_URL}/daily_check/submit",
        json={"values": {"temperature": 28}}
    )
    assert r.status_code == 200
    data = r.json()

    assert data["formId"] == "daily_check"
    assert data["values"]["temperature"] == 28
    assert data["computed"]["result"] == "PASS"

    # ---------- 5. Validate reference used ----------
    refs = data["referencesUsed"]
    key = "baseline_temp.temperature.last"

    assert key in refs
    assert refs[key] == 30


def test_fail_case_against_global_reference():
    """
    Same setup, but value should FAIL:
    temperature >= baseline_temp.temperature
    """

    r = requests.post(
        f"{BASE_URL}/daily_check/submit",
        json={"values": {"temperature": 35}}
    )

    assert r.status_code == 200
    data = r.json()

    assert data["computed"]["result"] == "FAIL"
