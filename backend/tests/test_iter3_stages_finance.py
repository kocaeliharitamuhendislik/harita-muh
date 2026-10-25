# Iteration 3: categories, stages, planned payments, finance report, schedules by employee
import os, uuid, pytest, requests

BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://survey-tracker-29.preview.emergentagent.com').rstrip('/')
API = BASE + '/api'
FIN_KEYS = ("offer_amount", "agreed_amount", "received_amount", "remaining_amount", "payment_completed")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def owner():
    d = _login("patron@haritapro.com", "PatronSifre123!")
    return {"Authorization": f"Bearer {d['access_token']}"}


@pytest.fixture(scope="module")
def emp():
    d = _login("calisan@haritapro.com", "Calisan123!")
    return {"h": {"Authorization": f"Bearer {d['access_token']}"}, "id": d["user_id"]}


@pytest.fixture(scope="module")
def created(owner):
    ids = []
    yield ids
    for pid in ids:
        requests.delete(f"{API}/projects/{pid}", headers=owner, timeout=20)


def _mk(owner, created, **kw):
    body = {"name": f"TEST_{uuid.uuid4().hex[:6]}", **kw}
    r = requests.post(f"{API}/projects", json=body, headers=owner, timeout=20)
    assert r.status_code == 200, r.text
    created.append(r.json()["id"])
    return r.json()


# Projects: category + payment_completed
def test_create_finished_paid(owner, created):
    p = _mk(owner, created, category="belediye", status="bitti", payment_completed=True, agreed_amount=5000)
    assert p["category"] == "belediye" and p["payment_completed"] is True
    assert p["remaining_amount"] == 0 and p["stage_index"] == 6  # finished job lands on last belediye stage
    g = requests.get(f"{API}/projects/{p['id']}", headers=owner).json()
    assert g["remaining_amount"] == 0


def test_create_invalid_category(owner):
    r = requests.post(f"{API}/projects", json={"name": "TEST_x", "category": "foo"}, headers=owner)
    assert r.status_code == 422


def test_patch_payment_completed_toggle_and_category_reset(owner, created):
    p = _mk(owner, created, category="kadastro", agreed_amount=1000)
    assert p["remaining_amount"] == 1000
    requests.post(f"{API}/projects/{p['id']}/stage", json={"stage_index": 3}, headers=owner)
    r = requests.patch(f"{API}/projects/{p['id']}", json={"payment_completed": True}, headers=owner)
    assert r.status_code == 200 and r.json()["remaining_amount"] == 0
    r = requests.patch(f"{API}/projects/{p['id']}", json={"payment_completed": False}, headers=owner)
    assert r.json()["remaining_amount"] == 1000
    assert r.json()["stage_index"] == 3
    r = requests.patch(f"{API}/projects/{p['id']}", json={"category": "belediye"}, headers=owner)
    assert r.json()["stage_index"] == 0 and r.json()["category"] == "belediye"


# Stages
def test_stage_owner_and_errors(owner, created):
    p = _mk(owner, created, category="kadastro")
    r = requests.post(f"{API}/projects/{p['id']}/stage", json={"stage_index": 2, "note": " not "}, headers=owner)
    assert r.status_code == 200
    d = r.json()
    assert d["stage_index"] == 2 and d["stage_history"][-1]["note"] == "not"
    assert d["stage_history"][-1]["by"] and d["stage_history"][-1]["at"]
    assert requests.post(f"{API}/projects/{p['id']}/stage", json={"stage_index": 6}, headers=owner).status_code == 400
    assert requests.post(f"{API}/projects/{p['id']}/stage", json={"stage_index": -1}, headers=owner).status_code == 400
    b = _mk(owner, created, category="belediye")
    assert requests.post(f"{API}/projects/{b['id']}/stage", json={"stage_index": 6}, headers=owner).status_code == 200
    dg = _mk(owner, created, category="diger")
    r = requests.post(f"{API}/projects/{dg['id']}/stage", json={"stage_index": 0}, headers=owner)
    assert r.status_code == 400


def test_stage_employee_assigned_and_unassigned(owner, emp, created):
    p = _mk(owner, created, category="belediye", agreed_amount=999, assigned_user_ids=[emp["id"]])
    r = requests.post(f"{API}/projects/{p['id']}/stage", json={"stage_index": 1, "note": "emp"}, headers=emp["h"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["stage_index"] == 1 and d["stage_history"][-1]["note"] == "emp"
    for k in FIN_KEYS:
        assert k not in d
    u = _mk(owner, created, category="kadastro")
    assert requests.post(f"{API}/projects/{u['id']}/stage", json={"stage_index": 1}, headers=emp["h"]).status_code == 404


def test_employee_project_list_no_finance(emp):
    r = requests.get(f"{API}/projects", headers=emp["h"])
    assert r.status_code == 200
    for p in r.json():
        assert emp["id"] in p.get("assigned_user_ids", [])
        for k in FIN_KEYS:
            assert k not in p


# Planned payments
def test_planned_payments_flow(owner, emp, created):
    p = _mk(owner, created, category="kadastro", agreed_amount=10000)
    r = requests.post(f"{API}/projects/{p['id']}/planned-payments",
                      json={"amount": 2500, "due_date": "2026-03-01T00:00:00Z", "note": "TEST"}, headers=owner)
    assert r.status_code == 200 and r.json()["status"] == "bekliyor"
    ppid = r.json()["id"]
    lst = requests.get(f"{API}/planned-payments", params={"project_id": p["id"]}, headers=owner).json()
    assert len(lst) == 1 and lst[0]["project_name"] == p["name"]
    allp = requests.get(f"{API}/planned-payments", headers=owner).json()
    assert any(x["id"] == ppid for x in allp)
    # employee forbidden
    assert requests.get(f"{API}/planned-payments", headers=emp["h"]).status_code == 403
    assert requests.post(f"{API}/planned-payments/{ppid}/pay", headers=emp["h"]).status_code == 403
    assert requests.post(f"{API}/projects/{p['id']}/planned-payments",
                         json={"amount": 1, "due_date": "2026-03-01T00:00:00Z"}, headers=emp["h"]).status_code == 403
    assert requests.delete(f"{API}/planned-payments/{ppid}", headers=emp["h"]).status_code == 403
    # invalid amount
    assert requests.post(f"{API}/projects/{p['id']}/planned-payments",
                         json={"amount": 0, "due_date": "2026-03-01T00:00:00Z"}, headers=owner).status_code == 422
    # pay
    r = requests.post(f"{API}/planned-payments/{ppid}/pay", headers=owner)
    assert r.status_code == 200
    g = requests.get(f"{API}/projects/{p['id']}", headers=owner).json()
    assert g["received_amount"] == 2500 and g["remaining_amount"] == 7500
    pays = requests.get(f"{API}/projects/{p['id']}/payments", headers=owner).json()
    assert len(pays) == 1 and pays[0]["amount"] == 2500
    lst = requests.get(f"{API}/planned-payments", params={"project_id": p["id"]}, headers=owner).json()
    assert lst[0]["status"] == "odendi"
    assert requests.post(f"{API}/planned-payments/{ppid}/pay", headers=owner).status_code == 404
    # delete
    assert requests.delete(f"{API}/planned-payments/{ppid}", headers=owner).status_code == 200
    assert requests.get(f"{API}/planned-payments", params={"project_id": p["id"]}, headers=owner).json() == []


def test_planned_unknown_project(owner):
    r = requests.post(f"{API}/projects/nope/planned-payments",
                      json={"amount": 1, "due_date": "2026-03-01T00:00:00Z"}, headers=owner)
    assert r.status_code == 404


# Finance report
def test_finance_report(owner, emp):
    r = requests.get(f"{API}/finance/report", params={"year": 2026}, headers=owner)
    assert r.status_code == 200
    d = r.json()
    assert d["year"] == 2026 and len(d["months"]) == 12
    assert [m["month"] for m in d["months"]] == list(range(1, 13))
    assert d["year_income"] == sum(m["income"] for m in d["months"])
    assert d["year_expense"] == sum(m["expense"] for m in d["months"])
    assert any(y["year"] == 2026 for y in d["years"])
    assert requests.get(f"{API}/finance/report", params={"year": 2026}, headers=emp["h"]).status_code == 403


# Schedules by employee
def test_employee_schedule_crud(owner, emp, created):
    p = _mk(owner, created, category="kadastro", assigned_user_ids=[emp["id"]])
    body = {"project_id": p["id"], "title": "TEST_sch", "date": "2026-02-10T09:00:00Z"}
    r = requests.post(f"{API}/schedules", json=body, headers=emp["h"])
    assert r.status_code == 200
    s = r.json()
    assert emp["id"] in s["assigned_user_ids"] and s["created_by"] == emp["id"]
    r = requests.put(f"{API}/schedules/{s['id']}", json={**body, "title": "TEST_sch2", "status": "tamamlandi"}, headers=emp["h"])
    assert r.status_code == 200 and r.json()["status"] == "tamamlandi" and r.json()["title"] == "TEST_sch2"
    # owner-only schedule (not assigned to employee)
    o = requests.post(f"{API}/schedules", json={"title": "TEST_owner", "date": "2026-02-11T09:00:00Z"}, headers=owner).json()
    assert requests.delete(f"{API}/schedules/{o['id']}", headers=emp["h"]).status_code == 403
    assert requests.put(f"{API}/schedules/{o['id']}", json={"title": "x", "date": "2026-02-11T09:00:00Z"}, headers=emp["h"]).status_code == 403
    assert requests.delete(f"{API}/schedules/{o['id']}", headers=owner).status_code == 200
    assert requests.delete(f"{API}/schedules/{s['id']}", headers=emp["h"]).status_code == 200
    assert all(x["id"] != s["id"] for x in requests.get(f"{API}/schedules", headers=owner).json())
