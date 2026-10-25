"""HaritaPro backend API tests."""
import os, io, uuid, pytest, requests
from datetime import datetime, timezone

BASE = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') if os.environ.get('EXPO_PUBLIC_BACKEND_URL') else 'https://survey-tracker-29.preview.emergentagent.com'
API = BASE + '/api'

OWNER = {"email": "patron@haritapro.com", "password": "PatronSifre123!"}
EMP = {"name": "Test Çalışan", "email": f"calisan_{uuid.uuid4().hex[:6]}@haritapro.com", "password": "Calisan123!"}

STATE = {}

def _hdr(tok): return {"Authorization": f"Bearer {tok}"}

# ---- auth ----
def test_health():
    r = requests.get(BASE + '/health', timeout=15)
    assert r.status_code == 200

def test_login_owner():
    r = requests.post(API + '/auth/login', json=OWNER, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['role'] == 'owner' and d['access_token']
    STATE['owner_tok'] = d['access_token']
    STATE['owner_id'] = d['user_id']

def test_auth_me_owner():
    r = requests.get(API + '/auth/me', headers=_hdr(STATE['owner_tok']), timeout=15)
    assert r.status_code == 200 and r.json()['role'] == 'owner'

def test_login_bad():
    r = requests.post(API + '/auth/login', json={"email": OWNER['email'], "password": "wrong"})
    assert r.status_code == 401

# ---- user mgmt ----
def test_create_employee():
    r = requests.post(API + '/users', json=EMP, headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200, r.text
    STATE['emp_id'] = r.json()['id']
    assert r.json()['role'] == 'employee'

def test_login_employee():
    r = requests.post(API + '/auth/login', json={"email": EMP['email'], "password": EMP['password']})
    assert r.status_code == 200
    STATE['emp_tok'] = r.json()['access_token']
    assert r.json()['role'] == 'employee'

def test_list_users_owner_only():
    r = requests.get(API + '/users', headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200 and any(u['id'] == STATE['emp_id'] for u in r.json())
    r2 = requests.get(API + '/users', headers=_hdr(STATE['emp_tok']))
    assert r2.status_code == 403

# ---- projects ----
def test_create_project_owner():
    body = {"name": "TEST Proje", "client_name": "Müşteri", "location": "İstanbul",
            "offer_amount": 10000, "agreed_amount": 8000,
            "assigned_user_ids": [STATE['emp_id']]}
    r = requests.post(API + '/projects', json=body, headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200, r.text
    STATE['pid'] = r.json()['id']
    assert r.json()['remaining_amount'] == 8000

def test_create_project_employee_forbidden():
    r = requests.post(API + '/projects', json={"name": "X"}, headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 403

def test_list_projects_owner_sees_finance():
    r = requests.get(API + '/projects', headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200
    p = [x for x in r.json() if x['id'] == STATE['pid']][0]
    assert 'agreed_amount' in p

def test_list_projects_employee_no_finance():
    r = requests.get(API + '/projects', headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 200
    projs = [x for x in r.json() if x['id'] == STATE['pid']]
    assert len(projs) == 1
    for k in ('offer_amount', 'agreed_amount', 'received_amount', 'remaining_amount'):
        assert k not in projs[0], f"employee saw {k}"

# ---- payments ----
def test_add_payment_owner():
    body = {"amount": 3000, "date": datetime.now(timezone.utc).isoformat(), "note": "ilk"}
    r = requests.post(f"{API}/projects/{STATE['pid']}/payments", json=body, headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200, r.text
    STATE['pay_id'] = r.json()['id']

def test_payment_recalc():
    r = requests.get(f"{API}/projects/{STATE['pid']}", headers=_hdr(STATE['owner_tok']))
    assert r.json()['received_amount'] == 3000 and r.json()['remaining_amount'] == 5000

def test_payments_employee_forbidden():
    r = requests.get(f"{API}/projects/{STATE['pid']}/payments", headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 403

# ---- expenses ----
def test_add_expense_owner():
    body = {"amount": 500, "date": datetime.now(timezone.utc).isoformat(), "category": "ulasim"}
    r = requests.post(API + '/expenses', json=body, headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200
    STATE['exp_id'] = r.json()['id']

def test_expenses_employee_forbidden():
    r = requests.get(API + '/expenses', headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 403

# ---- finance summary ----
def test_finance_summary_owner():
    r = requests.get(API + '/finance/summary', headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200
    d = r.json()
    for k in ('total_agreed','total_received','total_expenses','net_profit','monthly_payments','expenses_by_category'):
        assert k in d, f"missing {k}"
    assert d['total_received'] >= 3000

def test_finance_summary_employee_forbidden():
    r = requests.get(API + '/finance/summary', headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 403

# ---- schedules ----
def test_create_schedule():
    body = {"project_id": STATE['pid'], "title": "TEST Arazi", "date": datetime.now(timezone.utc).isoformat(),
            "assigned_user_ids": [STATE['emp_id']]}
    r = requests.post(API + '/schedules', json=body, headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200
    STATE['sid'] = r.json()['id']

def test_schedule_status():
    r = requests.post(f"{API}/schedules/{STATE['sid']}/status", data={"status": "tamamlandi"},
                      headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 200
    r2 = requests.get(API + '/schedules', headers=_hdr(STATE['emp_tok']))
    assert any(s['id'] == STATE['sid'] and s['status'] == 'tamamlandi' for s in r2.json())

# ---- steps ----
def test_add_step():
    body = {"institution": "Kadastro", "title": "TEST Başvuru", "status": "beklemede"}
    r = requests.post(f"{API}/projects/{STATE['pid']}/steps", json=body, headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200
    STATE['step_id'] = r.json()['id']

def test_update_step_status_employee():
    body = {"institution": "Kadastro", "title": "TEST Başvuru", "status": "onaylandi"}
    r = requests.put(f"{API}/steps/{STATE['step_id']}", json=body, headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 200 and r.json()['status'] == 'onaylandi'

def test_list_steps_employee():
    r = requests.get(f"{API}/projects/{STATE['pid']}/steps", headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 200 and len(r.json()) >= 1

# ---- documents ----
def test_upload_document():
    files = {"file": ("test.txt", io.BytesIO(b"hello world"), "text/plain")}
    r = requests.post(f"{API}/projects/{STATE['pid']}/documents",
                      files=files, data={"category": "diger"}, headers=_hdr(STATE['owner_tok']))
    if r.status_code == 402:
        pytest.skip("Storage credit exhausted")
    assert r.status_code == 200, r.text
    STATE['doc_id'] = r.json()['id']

def test_file_token_and_download():
    if 'doc_id' not in STATE:
        pytest.skip("no doc")
    r = requests.get(API + '/file-token', headers=_hdr(STATE['owner_tok']))
    assert r.status_code == 200
    tok = r.json()['token']
    r2 = requests.get(f"{API}/documents/{STATE['doc_id']}/file?token={tok}")
    assert r2.status_code == 200 and r2.content == b"hello world"

def test_download_bearer():
    if 'doc_id' not in STATE:
        pytest.skip("no doc")
    r = requests.get(f"{API}/documents/{STATE['doc_id']}/file", headers=_hdr(STATE['emp_tok']))
    assert r.status_code == 200

# ---- cleanup ----
def test_zz_cleanup():
    if 'doc_id' in STATE:
        requests.delete(f"{API}/documents/{STATE['doc_id']}", headers=_hdr(STATE['owner_tok']))
    if 'pid' in STATE:
        requests.delete(f"{API}/projects/{STATE['pid']}", headers=_hdr(STATE['owner_tok']))
    if 'exp_id' in STATE:
        requests.delete(f"{API}/expenses/{STATE['exp_id']}", headers=_hdr(STATE['owner_tok']))
    if 'emp_id' in STATE:
        requests.delete(f"{API}/users/{STATE['emp_id']}", headers=_hdr(STATE['owner_tok']))
