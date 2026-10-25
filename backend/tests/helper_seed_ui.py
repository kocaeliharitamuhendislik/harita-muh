# Helper (not a test): create/cleanup TEST_ UI projects. Usage: python helper_seed_ui.py create|cleanup
import sys, requests
API = "https://survey-tracker-29.preview.emergentagent.com/api"
tok = requests.post(f"{API}/auth/login", json={"email": "patron@haritapro.com", "password": "PatronSifre123!"}).json()["access_token"]
H = {"Authorization": f"Bearer {tok}"}
if sys.argv[1] == "create":
    p = requests.post(f"{API}/projects", json={"name": "TEST_Fin_Proje", "category": "belediye", "client_phone": "05321234567"}, headers=H).json()
    print(p["id"])
elif sys.argv[1] == "show":
    for p in requests.get(f"{API}/projects", headers=H).json():
        if p["name"].startswith("TEST_"):
            print(p["id"], p["name"], p.get("offer_amount"), p.get("agreed_amount"), p.get("received_amount"), p.get("remaining_amount"), p.get("payment_completed"), p.get("stage_index"))
    print([ (x["project_name"], x["amount"], x["status"]) for x in requests.get(f"{API}/planned-payments", headers=H).json()])
else:
    for p in requests.get(f"{API}/projects", headers=H).json():
        if p["name"].startswith("TEST_"):
            requests.delete(f"{API}/projects/{p['id']}", headers=H); print("deleted", p["name"])
    for s in requests.get(f"{API}/schedules", headers=H).json():
        if s["title"].startswith("TEST_"):
            requests.delete(f"{API}/schedules/{s['id']}", headers=H); print("deleted sch", s["title"])
    for e in requests.get(f"{API}/expenses", headers=H).json():
        if (e.get("note") or "").startswith("TEST_"):
            requests.delete(f"{API}/expenses/{e['id']}", headers=H); print("deleted exp", e["note"])
