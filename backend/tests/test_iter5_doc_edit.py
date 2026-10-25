# Iteration 5: document edit (PATCH name/category), replace file (PUT /file), delete perms
import os, uuid, pytest, requests

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
def projects(owner, emp):
    assigned = requests.post(f"{API}/projects", json={"name": "TEST_docedit_assigned", "category": "kadastro",
                                                      "assigned_user_ids": [emp["id"]]}, headers=owner, timeout=20).json()
    unassigned = requests.post(f"{API}/projects", json={"name": "TEST_docedit_unassigned", "category": "kadastro"},
                               headers=owner, timeout=20).json()
    yield {"a": assigned, "u": unassigned}
    for p in (assigned, unassigned):
        requests.delete(f"{API}/projects/{p['id']}", headers=owner, timeout=20)


def _upload(h, pid, cat="tapu", name="TEST_a.txt", content=b"hello-one", ctype="text/plain"):
    r = requests.post(f"{API}/projects/{pid}/documents", data={"category": cat},
                      files={"file": (name, content, ctype)}, headers=h, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# --- PATCH /documents/{id}
class TestPatch:
    def test_owner_rename_and_change_category(self, owner, projects):
        d = _upload(owner, projects["u"]["id"])
        r = requests.patch(f"{API}/documents/{d['id']}", json={"name": "  TEST_renamed.txt "}, headers=owner, timeout=20)
        assert r.status_code == 200 and r.json()["name"] == "TEST_renamed.txt"
        assert "_id" not in r.json()
        r = requests.patch(f"{API}/documents/{d['id']}", json={"category": "kimlik"}, headers=owner, timeout=20)
        assert r.status_code == 200 and r.json()["category"] == "kimlik" and r.json()["name"] == "TEST_renamed.txt"
        lst = requests.get(f"{API}/projects/{projects['u']['id']}/documents", headers=owner, timeout=20).json()
        g = next(x for x in lst if x["id"] == d["id"])
        assert g["name"] == "TEST_renamed.txt" and g["category"] == "kimlik"

    def test_empty_body_noop(self, owner, projects):
        d = _upload(owner, projects["u"]["id"])
        r = requests.patch(f"{API}/documents/{d['id']}", json={}, headers=owner, timeout=20)
        assert r.status_code == 200 and r.json()["name"] == d["name"]

    def test_empty_name_422(self, owner, projects):
        d = _upload(owner, projects["u"]["id"])
        r = requests.patch(f"{API}/documents/{d['id']}", json={"name": ""}, headers=owner, timeout=20)
        assert r.status_code == 422

    def test_blank_name_rejected(self, owner, projects):
        d = _upload(owner, projects["u"]["id"])
        r = requests.patch(f"{API}/documents/{d['id']}", json={"name": "   "}, headers=owner, timeout=20)
        assert r.status_code in (400, 422), f"blank name accepted: {r.status_code} {r.text}"

    def test_404_unknown(self, owner):
        r = requests.patch(f"{API}/documents/nope-{uuid.uuid4()}", json={"name": "x"}, headers=owner, timeout=20)
        assert r.status_code == 404

    def test_employee_assigned_can_edit_owner_doc(self, owner, emp, projects):
        d = _upload(owner, projects["a"]["id"])
        r = requests.patch(f"{API}/documents/{d['id']}", json={"category": "sozlesme", "name": "TEST_emp.txt"},
                           headers=emp["h"], timeout=20)
        assert r.status_code == 200 and r.json()["category"] == "sozlesme" and r.json()["name"] == "TEST_emp.txt"

    def test_employee_unassigned_403(self, owner, emp, projects):
        d = _upload(owner, projects["u"]["id"])
        r = requests.patch(f"{API}/documents/{d['id']}", json={"name": "hack"}, headers=emp["h"], timeout=20)
        assert r.status_code == 403

    def test_no_auth_401(self, owner, projects):
        d = _upload(owner, projects["u"]["id"])
        r = requests.patch(f"{API}/documents/{d['id']}", json={"name": "x"}, timeout=20)
        assert r.status_code in (401, 403)


# --- PUT /documents/{id}/file
class TestReplace:
    def test_owner_replace_file(self, owner, projects):
        d = _upload(owner, projects["u"]["id"], cat="fatura")
        r = requests.put(f"{API}/documents/{d['id']}/file", files={"file": ("TEST_new.pdf", b"%PDF-new-content-xyz", "application/pdf")},
                         headers=owner, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"] == "TEST_new.pdf" and j["size"] == len(b"%PDF-new-content-xyz")
        assert j["content_type"] == "application/pdf" and j["category"] == "fatura" and j["id"] == d["id"]
        f = requests.get(f"{API}/documents/{d['id']}/file", headers=owner, timeout=30)
        assert f.status_code == 200 and f.content == b"%PDF-new-content-xyz"

    def test_replace_empty_400(self, owner, projects):
        d = _upload(owner, projects["u"]["id"])
        r = requests.put(f"{API}/documents/{d['id']}/file", files={"file": ("e.txt", b"", "text/plain")}, headers=owner, timeout=30)
        assert r.status_code == 400

    def test_replace_404(self, owner):
        r = requests.put(f"{API}/documents/nope-{uuid.uuid4()}/file", files={"file": ("e.txt", b"x", "text/plain")}, headers=owner, timeout=30)
        assert r.status_code == 404

    def test_employee_replace_assigned_ok_unassigned_403(self, owner, emp, projects):
        d1 = _upload(owner, projects["a"]["id"])
        r = requests.put(f"{API}/documents/{d1['id']}/file", files={"file": ("TEST_e.jpg", b"\xff\xd8img", "image/jpeg")}, headers=emp["h"], timeout=30)
        assert r.status_code == 200 and r.json()["content_type"] == "image/jpeg"
        d2 = _upload(owner, projects["u"]["id"])
        r = requests.put(f"{API}/documents/{d2['id']}/file", files={"file": ("x.txt", b"x", "text/plain")}, headers=emp["h"], timeout=30)
        assert r.status_code == 403


# --- DELETE /documents/{id}
class TestDelete:
    def test_owner_delete_any(self, owner, emp, projects):
        d = _upload(emp["h"], projects["a"]["id"])
        r = requests.delete(f"{API}/documents/{d['id']}", headers=owner, timeout=20)
        assert r.status_code == 200
        assert requests.get(f"{API}/documents/{d['id']}/file", headers=owner, timeout=20).status_code == 404

    def test_employee_delete_own_only(self, owner, emp, projects):
        mine = _upload(emp["h"], projects["a"]["id"])
        theirs = _upload(owner, projects["a"]["id"])
        assert requests.delete(f"{API}/documents/{theirs['id']}", headers=emp["h"], timeout=20).status_code == 403
        assert requests.delete(f"{API}/documents/{mine['id']}", headers=emp["h"], timeout=20).status_code == 200
        lst = requests.get(f"{API}/projects/{projects['a']['id']}/documents", headers=owner, timeout=20).json()
        ids = [x["id"] for x in lst]
        assert mine["id"] not in ids and theirs["id"] in ids
