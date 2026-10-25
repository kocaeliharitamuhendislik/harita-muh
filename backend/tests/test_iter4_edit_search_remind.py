# Iteration 4: user PATCH (name/phone), schedule kind (arazi|gorev), project PATCH editing + category stage reset
import os, uuid, pytest, requests
from datetime import datetime, timezone

BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://survey-tracker-29.preview.emergentagent.com').rstrip('/')
API = BASE + '/api'


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
def tmp_user(owner):
    email = f"test_{uuid.uuid4().hex[:6]}@haritapro.com"
    r = requests.post(f"{API}/users", json={"name": "TEST_Kişi", "email": email, "password": "Sifre123!",
                                             "phone": " 0532 111 22 33 "}, headers=owner, timeout=20)
    assert r.status_code == 200, r.text
    u = r.json()
    yield u
    requests.delete(f"{API}/users/{u['id']}", headers=owner, timeout=20)


@pytest.fixture(scope="module")
def created(owner):
    ids = {"p": [], "s": []}
    yield ids
    for pid in ids["p"]:
        requests.delete(f"{API}/projects/{pid}", headers=owner, timeout=20)
    for sid in ids["s"]:
        requests.delete(f"{API}/schedules/{sid}", headers=owner, timeout=20)


# ---- Users: phone + PATCH ----
class TestUsers:
    def test_create_user_phone_trimmed(self, tmp_user):
        assert tmp_user["phone"] == "0532 111 22 33"

    def test_list_users_returns_phone(self, owner, emp):
        r = requests.get(f"{API}/users", headers=owner, timeout=20)
        assert r.status_code == 200
        me = [u for u in r.json() if u["id"] == emp["id"]][0]
        assert "phone" in me and me["phone"].replace(" ", "").endswith("5334445566")

    def test_patch_user_name_phone_persist(self, owner, tmp_user):
        r = requests.patch(f"{API}/users/{tmp_user['id']}", json={"name": "TEST_Yeni Ad", "phone": "05550000000"},
                           headers=owner, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "TEST_Yeni Ad" and r.json()["phone"] == "05550000000"
        u = [x for x in requests.get(f"{API}/users", headers=owner, timeout=20).json() if x["id"] == tmp_user["id"]][0]
        assert u["name"] == "TEST_Yeni Ad" and u["phone"] == "05550000000"

    def test_patch_user_clear_phone(self, owner, tmp_user):
        r = requests.patch(f"{API}/users/{tmp_user['id']}", json={"phone": ""}, headers=owner, timeout=20)
        assert r.status_code == 200 and r.json()["phone"] == ""

    def test_patch_user_empty_name_400(self, owner, tmp_user):
        r = requests.patch(f"{API}/users/{tmp_user['id']}", json={"name": "   "}, headers=owner, timeout=20)
        assert r.status_code == 400

    def test_patch_user_unknown_404(self, owner):
        r = requests.patch(f"{API}/users/nope-{uuid.uuid4()}", json={"name": "X"}, headers=owner, timeout=20)
        assert r.status_code == 404

    def test_patch_user_employee_403(self, emp, tmp_user):
        r = requests.patch(f"{API}/users/{tmp_user['id']}", json={"name": "Hack"}, headers=emp["h"], timeout=20)
        assert r.status_code == 403


# ---- Schedules: kind ----
class TestScheduleKind:
    def _body(self, **kw):
        return {"title": f"TEST_{uuid.uuid4().hex[:5]}", "date": datetime.now(timezone.utc).isoformat(), **kw}

    def test_default_kind_arazi(self, owner, created):
        r = requests.post(f"{API}/schedules", json=self._body(), headers=owner, timeout=20)
        assert r.status_code == 200 and r.json()["kind"] == "arazi"
        created["s"].append(r.json()["id"])

    def test_kind_gorev_and_put_switch(self, owner, created):
        r = requests.post(f"{API}/schedules", json=self._body(kind="gorev"), headers=owner, timeout=20)
        assert r.status_code == 200 and r.json()["kind"] == "gorev"
        sid = r.json()["id"]; created["s"].append(sid)
        r2 = requests.put(f"{API}/schedules/{sid}", json=self._body(kind="arazi"), headers=owner, timeout=20)
        assert r2.status_code == 200 and r2.json()["kind"] == "arazi"
        lst = requests.get(f"{API}/schedules", headers=owner, timeout=20).json()
        assert [s for s in lst if s["id"] == sid][0]["kind"] == "arazi"

    def test_invalid_kind_422(self, owner, created):
        r = requests.post(f"{API}/schedules", json=self._body(kind="xyz"), headers=owner, timeout=20)
        assert r.status_code == 422
        r = requests.post(f"{API}/schedules", json=self._body(), headers=owner, timeout=20)
        created["s"].append(r.json()["id"])
        r2 = requests.put(f"{API}/schedules/{r.json()['id']}", json=self._body(kind="bad"), headers=owner, timeout=20)
        assert r2.status_code == 422


# ---- Projects: PATCH edit ----
class TestProjectEdit:
    def test_patch_fields_persist(self, owner, created):
        p = requests.post(f"{API}/projects", json={"name": "TEST_edit", "category": "kadastro"}, headers=owner, timeout=20).json()
        created["p"].append(p["id"])
        body = {"name": "TEST_edit2", "client_name": "Çağrı Öz", "client_phone": "0500", "location": "İzmir/Konak",
                "description": "açıklama", "status": "bitti"}
        r = requests.patch(f"{API}/projects/{p['id']}", json=body, headers=owner, timeout=20)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/projects/{p['id']}", headers=owner, timeout=20).json()
        for k, v in body.items():
            assert g[k] == v, k

    def test_same_category_keeps_stage_diff_resets(self, owner, created):
        p = requests.post(f"{API}/projects", json={"name": "TEST_cat", "category": "kadastro"}, headers=owner, timeout=20).json()
        created["p"].append(p["id"])
        assert requests.post(f"{API}/projects/{p['id']}/stage", json={"stage_index": 3}, headers=owner, timeout=20).status_code == 200
        r = requests.patch(f"{API}/projects/{p['id']}", json={"category": "kadastro", "name": "TEST_cat2"}, headers=owner, timeout=20)
        assert r.json()["stage_index"] == 3
        r = requests.patch(f"{API}/projects/{p['id']}", json={"category": "belediye"}, headers=owner, timeout=20)
        assert r.json()["stage_index"] == 0 and r.json()["category"] == "belediye"
        g = requests.get(f"{API}/projects/{p['id']}", headers=owner, timeout=20).json()
        assert g["stage_index"] == 0 and g["category"] == "belediye"

    def test_patch_invalid_category_422(self, owner, created):
        pid = created["p"][0]
        r = requests.patch(f"{API}/projects/{pid}", json={"category": "foo"}, headers=owner, timeout=20)
        assert r.status_code == 422

    def test_patch_employee_403(self, emp, created):
        r = requests.patch(f"{API}/projects/{created['p'][0]}", json={"name": "x"}, headers=emp["h"], timeout=20)
        assert r.status_code == 403

    def test_patch_unknown_404(self, owner):
        r = requests.patch(f"{API}/projects/nope-{uuid.uuid4()}", json={"name": "x"}, headers=owner, timeout=20)
        assert r.status_code == 404

    # validation gaps (expected to be rejected)
    def test_patch_invalid_status_rejected(self, owner, created):
        r = requests.patch(f"{API}/projects/{created['p'][0]}", json={"status": "xyz"}, headers=owner, timeout=20)
        assert r.status_code in (400, 422), f"invalid status accepted: {r.status_code}"

    def test_patch_empty_name_rejected(self, owner, created):
        r = requests.patch(f"{API}/projects/{created['p'][0]}", json={"name": "  "}, headers=owner, timeout=20)
        assert r.status_code in (400, 422), f"empty name accepted: {r.status_code}"
