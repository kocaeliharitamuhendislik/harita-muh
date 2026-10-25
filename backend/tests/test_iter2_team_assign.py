# Iteration 2: team listing, project PATCH (assignees/phone), schedule inheritance, employee visibility
import os
import pytest
import requests

BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://survey-tracker-29.preview.emergentagent.com').rstrip('/') + "/api"
OWNER = ("patron@haritapro.com", "PatronSifre123!")
EMP = ("calisan@haritapro.com", "Calisan123!")


def _login(e, p):
    r = requests.post(f"{BASE}/auth/login", json={"email": e, "password": p})
    assert r.status_code == 200, r.text
    d = r.json()
    return d["access_token"], {"id": d["user_id"]}


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctx():
    ot, ou = _login(*OWNER)
    try:
        et, eu = _login(*EMP)
    except AssertionError:
        pytest.skip("employee login failed")
    c = {"ot": ot, "et": et, "eid": eu["id"], "oid": ou["id"], "pids": [], "sids": []}
    yield c
    for sid in c["sids"]:
        requests.delete(f"{BASE}/schedules/{sid}", headers=H(ot))
    for pid in c["pids"]:
        requests.delete(f"{BASE}/projects/{pid}", headers=H(ot))


# Team list
def test_team_owner(ctx):
    r = requests.get(f"{BASE}/team", headers=H(ctx["ot"]))
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()}
    assert ctx["eid"] in ids and ctx["oid"] in ids
    for u in r.json():
        assert set(u.keys()) <= {"id", "name", "role"}, u


def test_team_employee(ctx):
    r = requests.get(f"{BASE}/team", headers=H(ctx["et"]))
    assert r.status_code == 200 and len(r.json()) >= 2


def test_team_unauth():
    assert requests.get(f"{BASE}/team").status_code in (401, 403)


# Create with phone, no assignees -> employee can't see
def test_create_project_phone(ctx):
    r = requests.post(f"{BASE}/projects", headers=H(ctx["ot"]), json={
        "name": "TEST_Iter2 Proje", "client_name": "TEST_Musteri", "client_phone": "0532 111 22 33",
        "agreed_amount": 10000, "offer_amount": 12000})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["client_phone"] == "0532 111 22 33"
    assert d.get("assigned_user_ids") == []
    ctx["pids"].append(d["id"])
    g = requests.get(f"{BASE}/projects/{d['id']}", headers=H(ctx["ot"])).json()
    assert g["client_phone"] == "0532 111 22 33"


def test_employee_not_see_unassigned(ctx):
    pid = ctx["pids"][0]
    assert requests.get(f"{BASE}/projects/{pid}", headers=H(ctx["et"])).status_code == 404
    lst = requests.get(f"{BASE}/projects", headers=H(ctx["et"])).json()
    assert pid not in [p["id"] for p in lst]


# PATCH
def test_patch_empty_400(ctx):
    r = requests.patch(f"{BASE}/projects/{ctx['pids'][0]}", headers=H(ctx["ot"]), json={})
    assert r.status_code == 400


def test_patch_employee_403(ctx):
    r = requests.patch(f"{BASE}/projects/{ctx['pids'][0]}", headers=H(ctx["et"]), json={"client_phone": "1"})
    assert r.status_code == 403


def test_patch_404(ctx):
    r = requests.patch(f"{BASE}/projects/nonexistent-id", headers=H(ctx["ot"]), json={"client_phone": "1"})
    assert r.status_code == 404


def test_patch_assign_and_phone(ctx):
    pid = ctx["pids"][0]
    r = requests.patch(f"{BASE}/projects/{pid}", headers=H(ctx["ot"]), json={"assigned_user_ids": [ctx["eid"]]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["assigned_user_ids"] == [ctx["eid"]]
    assert d["client_phone"] == "0532 111 22 33"  # untouched
    assert d["name"] == "TEST_Iter2 Proje"
    assert d["remaining_amount"] == 10000
    r2 = requests.patch(f"{BASE}/projects/{pid}", headers=H(ctx["ot"]), json={"client_phone": "05551234567"})
    assert r2.json()["client_phone"] == "05551234567"
    assert r2.json()["assigned_user_ids"] == [ctx["eid"]]


def test_employee_sees_after_assign(ctx):
    pid = ctx["pids"][0]
    r = requests.get(f"{BASE}/projects/{pid}", headers=H(ctx["et"]))
    assert r.status_code == 200
    d = r.json()
    for k in ("offer_amount", "agreed_amount", "received_amount", "remaining_amount"):
        assert k not in d
    assert pid in [p["id"] for p in requests.get(f"{BASE}/projects", headers=H(ctx["et"])).json()]
    assert requests.get(f"{BASE}/projects/{pid}/steps", headers=H(ctx["et"])).status_code == 200
    assert requests.get(f"{BASE}/projects/{pid}/documents", headers=H(ctx["et"])).status_code == 200


# Schedule inherits assignees
def test_schedule_inherits(ctx):
    pid = ctx["pids"][0]
    r = requests.post(f"{BASE}/schedules", headers=H(ctx["ot"]), json={
        "title": "TEST_Arazi", "date": "2026-02-10T09:30:00Z", "project_id": pid, "assigned_user_ids": []})
    assert r.status_code == 200, r.text
    d = r.json()
    ctx["sids"].append(d["id"])
    assert d["assigned_user_ids"] == [ctx["eid"]]
    lst = requests.get(f"{BASE}/schedules", headers=H(ctx["et"])).json()
    assert d["id"] in [s["id"] for s in lst]


def test_schedule_explicit_assignees_kept(ctx):
    pid = ctx["pids"][0]
    r = requests.post(f"{BASE}/schedules", headers=H(ctx["ot"]), json={
        "title": "TEST_Arazi2", "date": "2026-02-11T09:30:00Z", "project_id": pid, "assigned_user_ids": [ctx["oid"]]})
    assert r.status_code == 200
    ctx["sids"].append(r.json()["id"])
    assert r.json()["assigned_user_ids"] == [ctx["oid"]]


# Unassign -> employee loses access
def test_unassign(ctx):
    pid = ctx["pids"][0]
    r = requests.patch(f"{BASE}/projects/{pid}", headers=H(ctx["ot"]), json={"assigned_user_ids": []})
    assert r.status_code == 200 and r.json()["assigned_user_ids"] == []
    assert requests.get(f"{BASE}/projects/{pid}", headers=H(ctx["et"])).status_code == 404
    assert requests.get(f"{BASE}/projects/{pid}/steps", headers=H(ctx["et"])).status_code in (403, 404)


# Test Projesi visible to employee
def test_employee_sees_test_projesi(ctx):
    names = [p["name"] for p in requests.get(f"{BASE}/projects", headers=H(ctx["et"])).json()]
    assert "Test Projesi" in names, names
