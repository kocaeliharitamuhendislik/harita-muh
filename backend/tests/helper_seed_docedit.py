# Seed helper for iter5 UI: creates TEST_UI_DocEdit (kadastro) + one tapu doc, and a diger-category project with one doc
import os, requests, json
API = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://survey-tracker-29.preview.emergentagent.com').rstrip('/') + '/api'
tok = requests.post(f"{API}/auth/login", json={"email": "patron@haritapro.com", "password": "PatronSifre123!"}).json()["access_token"]
h = {"Authorization": f"Bearer {tok}"}
out = {}
for cat, dcat in (("kadastro", "tapu"), ("diger", "foto")):
    p = requests.post(f"{API}/projects", json={"name": f"TEST_UI_DocEdit_{cat}", "category": cat}, headers=h).json()
    d = requests.post(f"{API}/projects/{p['id']}/documents", data={"category": dcat},
                      files={"file": ("TEST_yanlis.txt", b"wrong upload", "text/plain")}, headers=h).json()
    out[cat] = {"pid": p["id"], "did": d["id"]}
print(json.dumps(out))
