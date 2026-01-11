import requests

BASE_URL = "http://localhost:8001/api/forms"


def test_submission_includes_metadata_and_html_snapshot():
    form_payload = {
        "id": "room_check",
        "name": "Room Check",
        "html": "<div><input id='room1_temperature_f' name='room1_temperature_f' /></div>",
        "fields": []
    }

    r = requests.post(BASE_URL, json=form_payload)
    assert r.status_code == 200

    submission_payload = {
        "values": {"room1_temperature_f": "25"},
        "metadata": {"room1_temperature_f": {"passRange": "-50:50", "warningRange": "-70:70"}},
        "result": "PASS"
    }

    r = requests.post(f"{BASE_URL}/room_check/submit", json=submission_payload)
    assert r.status_code == 200
    data = r.json()

    assert data["formId"] == "room_check"
    assert data["values"]["room1_temperature_f"] == "25"
    assert data["metadata"]["room1_temperature_f"]["passRange"] == "-50:50"
    assert data["result"] == "PASS"
    assert data["formHtml"] == form_payload["html"]
    assert "referencesUsed" not in data


def test_submission_without_metadata_defaults():
    form_payload = {
        "id": "simple_check",
        "name": "Simple",
        "html": "<div><input id='field' name='field' /></div>",
        "fields": []
    }

    r = requests.post(BASE_URL, json=form_payload)
    assert r.status_code == 200

    submission_payload = {
        "values": {"field": "abc"},
        "result": "PASS"
    }

    r = requests.post(f"{BASE_URL}/simple_check/submit", json=submission_payload)
    assert r.status_code == 200
    data = r.json()

    assert data["metadata"] == {}
    assert data["result"] == "PASS"
