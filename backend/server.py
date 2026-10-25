from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal
from pathlib import Path
import os, uuid, bcrypt, jwt, requests, logging, secrets as pysecrets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
ACCESS_MINUTES = 60 * 24 * 7  # 7 days
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')
APP_NAME = os.environ.get('APP_NAME', 'haritapro')

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
_storage_key: Optional[str] = None

client = AsyncIOMotorClient(MONGO_URL, tz_aware=True)
db = client[DB_NAME]

app = FastAPI()

@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}

api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)
log = logging.getLogger("haritapro")

# ---------- Storage helpers ----------
def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# ---------- Auth helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(12)).decode()

def verify_pw(pw: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), h.encode())
    except Exception:
        return False

def make_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=ACCESS_MINUTES)},
        JWT_SECRET, algorithm=JWT_ALG,
    )

async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "Yetkisiz")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(401, "Geçersiz token")
    user = await db.users.find_one({"id": uid, "disabled": {"$ne": True}}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "Yetkisiz")
    return user

def require_owner(user=Depends(current_user)):
    if user["role"] != "owner":
        raise HTTPException(403, "Sadece işletme sahibi erişebilir")
    return user

# ---------- Models ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Literal["owner", "employee"]
    user_id: str
    name: str
    email: EmailStr

class InviteIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6, max_length=64)
    phone: str = ""

class UserPatch(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: str
    phone: str = ""
    disabled: bool = False
    created_at: datetime

class ProjectIn(BaseModel):
    name: str
    client_name: str = ""
    client_phone: str = ""
    location: str = ""
    description: str = ""
    status: str = "aktif"  # aktif, bitti, iptal
    category: Literal["kadastro", "belediye", "diger"] = "diger"
    payment_completed: bool = False
    offer_amount: float = 0
    agreed_amount: float = 0
    assigned_user_ids: List[str] = []

STAGE_COUNTS = {"kadastro": 6, "belediye": 7}

class StageIn(BaseModel):
    stage_index: int
    note: str = ""

class PlannedIn(BaseModel):
    amount: float = Field(gt=0)
    due_date: datetime
    note: str = ""

class ProjectPatch(BaseModel):
    category: Optional[Literal["kadastro", "belediye", "diger"]] = None
    payment_completed: Optional[bool] = None
    status: Optional[Literal["aktif", "bitti", "iptal"]] = None
    name: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    offer_amount: Optional[float] = None
    agreed_amount: Optional[float] = None
    assigned_user_ids: Optional[List[str]] = None

class ProjectOut(ProjectIn):
    id: str
    received_amount: float = 0
    remaining_amount: float = 0
    created_at: datetime
    created_by: str

class PaymentIn(BaseModel):
    amount: float
    date: datetime
    note: str = ""

class PaymentOut(PaymentIn):
    id: str
    project_id: str
    created_at: datetime

class ExpenseIn(BaseModel):
    amount: float
    date: datetime
    category: str = "genel"  # arazi, ulasim, kurum_harc, malzeme, genel
    note: str = ""
    project_id: Optional[str] = None

class ExpenseOut(ExpenseIn):
    id: str
    created_at: datetime

class ScheduleIn(BaseModel):
    project_id: Optional[str] = None
    title: str
    date: datetime
    duration_hours: float = 1
    location: str = ""
    note: str = ""
    assigned_user_ids: List[str] = []
    status: Literal["planlandi", "tamamlandi", "iptal"] = "planlandi"
    kind: Literal["arazi", "gorev"] = "arazi"

class ScheduleOut(ScheduleIn):
    id: str
    created_at: datetime
    created_by: str

class StepIn(BaseModel):
    institution: str  # Kadastro, Tapu, Belediye, vb
    title: str
    status: Literal["beklemede", "onaylandi", "reddedildi"] = "beklemede"
    responsible_user_id: Optional[str] = None
    note: str = ""
    due_date: Optional[datetime] = None

class StepOut(StepIn):
    id: str
    project_id: str
    created_at: datetime

class DocOut(BaseModel):
    id: str
    project_id: str
    name: str
    category: str  # tapu, imar, kroki, foto, diger
    content_type: str
    size: int
    storage_path: str
    uploaded_by: str
    created_at: datetime

# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.projects.create_index("id", unique=True)
    await db.payments.create_index("project_id")
    await db.expenses.create_index("project_id")
    await db.schedules.create_index("date")
    await db.steps.create_index("project_id")
    await db.documents.create_index("project_id")

    owner_email = os.environ["OWNER_EMAIL"].lower()
    owner_pw = os.environ["OWNER_PASSWORD"]
    existing = await db.users.find_one({"email": owner_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "İşletme Sahibi",
            "email": owner_email,
            "password_hash": hash_pw(owner_pw),
            "role": "owner",
            "disabled": False,
            "created_at": datetime.now(timezone.utc),
        })
        log.info(f"Seeded owner: {owner_email}")

    # Older jobs created before categories/stages existed
    await db.projects.update_many({"category": {"$exists": False}}, {"$set": {"category": "diger"}})
    await db.projects.update_many({"stage_index": {"$exists": False}}, {"$set": {"stage_index": 0, "stage_history": []}})

    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        log.warning(f"Storage init skipped: {e}")

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ---------- Auth routes ----------
@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not verify_pw(body.password, u["password_hash"]):
        raise HTTPException(401, "E-posta veya şifre hatalı")
    if u.get("disabled"):
        raise HTTPException(401, "Hesap devre dışı")
    return TokenOut(
        access_token=make_token(u["id"]), role=u["role"],
        user_id=u["id"], name=u["name"], email=u["email"],
    )

@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user

# ---------- User management (owner) ----------
@api.get("/users", response_model=List[UserOut])
async def list_users(owner=Depends(require_owner)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return docs

@api.post("/users", response_model=UserOut)
async def create_user(body: InviteIn, owner=Depends(require_owner)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Bu e-posta ile kayıtlı kullanıcı var")
    user = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "email": email,
        "password_hash": hash_pw(body.password),
        "role": "employee",
        "phone": body.phone.strip(),
        "disabled": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    user.pop("password_hash", None)
    return user

@api.patch("/users/{uid}", response_model=UserOut)
async def patch_user(uid: str, body: UserPatch, owner=Depends(require_owner)):
    update = {k: v.strip() for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "name" in update and not update["name"]:
        raise HTTPException(400, "Ad boş olamaz")
    if not update:
        raise HTTPException(400, "Güncellenecek alan yok")
    r = await db.users.update_one({"id": uid}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})

@api.delete("/users/{uid}")
async def delete_user(uid: str, owner=Depends(require_owner)):
    if uid == owner["id"]:
        raise HTTPException(400, "Kendinizi silemezsiniz")
    res = await db.users.delete_one({"id": uid, "role": {"$ne": "owner"}})
    if res.deleted_count == 0:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return {"ok": True}

# ---------- Projects ----------
async def _recalc_project(project_id: str):
    agg = await db.payments.aggregate([
        {"$match": {"project_id": project_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]).to_list(1)
    received = agg[0]["total"] if agg else 0
    proj = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if proj:
        remaining = 0.0 if proj.get("payment_completed") else max(0.0, (proj.get("agreed_amount") or 0) - received)
        await db.projects.update_one({"id": project_id},
            {"$set": {"received_amount": received, "remaining_amount": remaining}})

def _project_scope(user) -> dict:
    """Employees see only projects assigned to them."""
    if user["role"] == "owner":
        return {}
    return {"assigned_user_ids": user["id"]}

def _strip_finance(proj: dict, user) -> dict:
    if user["role"] != "owner":
        for k in ("offer_amount", "agreed_amount", "received_amount", "remaining_amount", "payment_completed"):
            proj.pop(k, None)
    return proj

@api.get("/projects")
async def list_projects(user=Depends(current_user)):
    q = _project_scope(user)
    docs = await db.projects.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [_strip_finance(d, user) for d in docs]

@api.post("/projects")
async def create_project(body: ProjectIn, owner=Depends(require_owner)):
    now = datetime.now(timezone.utc)
    doc = body.dict()
    doc.update({
        "id": str(uuid.uuid4()),
        "received_amount": 0,
        "remaining_amount": 0 if body.payment_completed else body.agreed_amount,
        "stage_index": (STAGE_COUNTS[body.category] - 1) if body.status == "bitti" and body.category in STAGE_COUNTS else 0,
        "stage_history": [],
        "created_at": now,
        "created_by": owner["id"],
    })
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.post("/projects/{pid}/stage")
async def set_stage(pid: str, body: StageIn, user=Depends(current_user)):
    proj = await db.projects.find_one({"id": pid, **_project_scope(user)}, {"_id": 0})
    if not proj:
        raise HTTPException(404, "Proje bulunamadı")
    n = STAGE_COUNTS.get(proj.get("category"))
    if not n:
        raise HTTPException(400, "Bu iş türünde süreç aşaması yok")
    if not 0 <= body.stage_index < n:
        raise HTTPException(400, "Geçersiz aşama")
    entry = {"stage_index": body.stage_index, "note": body.note.strip(), "by": user["name"],
             "at": datetime.now(timezone.utc)}
    await db.projects.update_one({"id": pid}, {"$set": {"stage_index": body.stage_index},
                                              "$push": {"stage_history": entry}})
    doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    return _strip_finance(doc, user)

# ---------- Planned (upcoming) payments, owner only ----------
@api.get("/planned-payments")
async def list_planned(project_id: Optional[str] = None, owner=Depends(require_owner)):
    q = {"project_id": project_id} if project_id else {}
    docs = await db.planned_payments.find(q, {"_id": 0}).sort("due_date", 1).to_list(1000)
    names = {p["id"]: p["name"] for p in await db.projects.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    for d in docs:
        d["project_name"] = names.get(d["project_id"], "")
    return docs

@api.post("/projects/{pid}/planned-payments")
async def add_planned(pid: str, body: PlannedIn, owner=Depends(require_owner)):
    if not await db.projects.find_one({"id": pid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Proje bulunamadı")
    doc = body.dict()
    doc.update({"id": str(uuid.uuid4()), "project_id": pid, "status": "bekliyor",
                "created_at": datetime.now(timezone.utc)})
    await db.planned_payments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.post("/planned-payments/{ppid}/pay")
async def pay_planned(ppid: str, owner=Depends(require_owner)):
    now = datetime.now(timezone.utc)
    pay_id = str(uuid.uuid4())
    # Atomic claim: only one request can flip bekliyor -> odendi
    pp = await db.planned_payments.find_one_and_update(
        {"id": ppid, "status": "bekliyor"},
        {"$set": {"status": "odendi", "paid_at": now, "payment_id": pay_id}},
        projection={"_id": 0},
    )
    if not pp:
        raise HTTPException(404, "Bekleyen ödeme bulunamadı")
    pay = {"id": pay_id, "project_id": pp["project_id"], "amount": pp["amount"], "date": now,
           "note": pp.get("note") or "Planlı ödeme", "created_at": now}
    await db.payments.insert_one(pay)
    await _recalc_project(pp["project_id"])
    return {"ok": True}

@api.delete("/planned-payments/{ppid}")
async def delete_planned(ppid: str, owner=Depends(require_owner)):
    r = await db.planned_payments.delete_one({"id": ppid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Planlı ödeme bulunamadı")
    return {"ok": True}

@api.get("/finance/report")
async def finance_report(year: int, owner=Depends(require_owner)):
    tz = "Europe/Istanbul"
    async def grouped(coll, fmt):
        rows = await db[coll].aggregate([
            {"$group": {"_id": {"$dateToString": {"format": fmt, "date": "$date", "timezone": tz}},
                        "total": {"$sum": "$amount"}}},
        ]).to_list(500)
        return {r["_id"]: r["total"] for r in rows if r["_id"]}
    inc_m, exp_m = await grouped("payments", "%Y-%m"), await grouped("expenses", "%Y-%m")
    inc_y, exp_y = await grouped("payments", "%Y"), await grouped("expenses", "%Y")
    months = [{"month": m, "income": inc_m.get(f"{year}-{m:02d}", 0), "expense": exp_m.get(f"{year}-{m:02d}", 0)}
              for m in range(1, 13)]
    years = sorted(set(inc_y) | set(exp_y) | {str(year)}, reverse=True)
    return {
        "year": year,
        "months": months,
        "year_income": sum(m["income"] for m in months),
        "year_expense": sum(m["expense"] for m in months),
        "years": [{"year": int(y), "income": inc_y.get(y, 0), "expense": exp_y.get(y, 0)} for y in years],
    }

@api.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(current_user)):
    q = {"id": pid, **_project_scope(user)}
    doc = await db.projects.find_one(q, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Proje bulunamadı")
    return _strip_finance(doc, user)

@api.put("/projects/{pid}")
async def update_project(pid: str, body: ProjectIn, owner=Depends(require_owner)):
    update = body.dict()
    r = await db.projects.update_one({"id": pid}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Proje bulunamadı")
    await _recalc_project(pid)
    doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    return doc

@api.patch("/projects/{pid}")
async def patch_project(pid: str, body: ProjectPatch, owner=Depends(require_owner)):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(400, "Güncellenecek alan yok")
    if update.get("assigned_user_ids"):
        ids = list(dict.fromkeys(update["assigned_user_ids"]))
        found = await db.users.count_documents({"id": {"$in": ids}})
        if found != len(ids):
            raise HTTPException(400, "Geçersiz çalışan seçimi")
        update["assigned_user_ids"] = ids
    if "category" in update:
        cur = await db.projects.find_one({"id": pid}, {"_id": 0, "category": 1})
        if cur and cur.get("category") != update["category"]:
            update["stage_index"] = 0
    if "name" in update and not (update["name"] or "").strip():
        raise HTTPException(400, "İş adı boş olamaz")
    if "category" in update or update.get("status") == "bitti":
        cur = await db.projects.find_one({"id": pid}, {"_id": 0, "category": 1, "status": 1})
        if cur:
            cat = update.get("category", cur.get("category"))
            st = update.get("status", cur.get("status"))
            if st == "bitti" and cat in STAGE_COUNTS and (update.get("status") == "bitti" and cur.get("status") != "bitti" or "stage_index" in update):
                update["stage_index"] = STAGE_COUNTS[cat] - 1
    r = await db.projects.update_one({"id": pid}, {"$set": update})
    if r.matched_count == 0:
        raise HTTPException(404, "Proje bulunamadı")
    await _recalc_project(pid)
    return await db.projects.find_one({"id": pid}, {"_id": 0})

@api.get("/team")
async def list_team(user=Depends(current_user)):
    return await db.users.find({"disabled": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(500)

@api.delete("/projects/{pid}")
async def delete_project(pid: str, owner=Depends(require_owner)):
    await db.projects.delete_one({"id": pid})
    await db.payments.delete_many({"project_id": pid})
    await db.expenses.delete_many({"project_id": pid})
    await db.schedules.delete_many({"project_id": pid})
    await db.steps.delete_many({"project_id": pid})
    await db.documents.delete_many({"project_id": pid})
    await db.planned_payments.delete_many({"project_id": pid})
    return {"ok": True}

# ---------- Payments (owner only) ----------
@api.get("/projects/{pid}/payments")
async def list_payments(pid: str, owner=Depends(require_owner)):
    docs = await db.payments.find({"project_id": pid}, {"_id": 0}).sort("date", -1).to_list(500)
    return docs

@api.post("/projects/{pid}/payments")
async def add_payment(pid: str, body: PaymentIn, owner=Depends(require_owner)):
    doc = body.dict()
    doc.update({
        "id": str(uuid.uuid4()),
        "project_id": pid,
        "created_at": datetime.now(timezone.utc),
    })
    await db.payments.insert_one(doc)
    doc.pop("_id", None)
    await _recalc_project(pid)
    return doc

@api.delete("/payments/{pay_id}")
async def delete_payment(pay_id: str, owner=Depends(require_owner)):
    doc = await db.payments.find_one({"id": pay_id})
    if not doc:
        raise HTTPException(404, "Ödeme bulunamadı")
    await db.payments.delete_one({"id": pay_id})
    await _recalc_project(doc["project_id"])
    return {"ok": True}

# ---------- Expenses (owner only) ----------
@api.get("/expenses")
async def list_expenses(owner=Depends(require_owner)):
    docs = await db.expenses.find({}, {"_id": 0}).sort("date", -1).to_list(500)
    return docs

@api.post("/expenses")
async def add_expense(body: ExpenseIn, owner=Depends(require_owner)):
    doc = body.dict()
    doc.update({"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc)})
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.delete("/expenses/{eid}")
async def delete_expense(eid: str, owner=Depends(require_owner)):
    r = await db.expenses.delete_one({"id": eid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Gider bulunamadı")
    return {"ok": True}

# ---------- Finance Summary ----------
@api.get("/finance/summary")
async def finance_summary(owner=Depends(require_owner)):
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    total_agreed = sum(p.get("agreed_amount") or 0 for p in projects)
    total_received = sum(p.get("received_amount") or 0 for p in projects)
    total_remaining = sum(p.get("remaining_amount") or 0 for p in projects)
    total_offer = sum(p.get("offer_amount") or 0 for p in projects)

    exp_agg = await db.expenses.aggregate([
        {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}}
    ]).to_list(50)
    expenses_by_cat = {x["_id"]: x["total"] for x in exp_agg}
    total_expenses = sum(expenses_by_cat.values())

    # last 6 months payments
    six_mo = datetime.now(timezone.utc) - timedelta(days=180)
    pay_agg = await db.payments.aggregate([
        {"$match": {"date": {"$gte": six_mo}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$date", "timezone": "Europe/Istanbul"}},
                    "total": {"$sum": "$amount"}}},
        {"$sort": {"_id": 1}},
    ]).to_list(50)
    monthly = [{"month": x["_id"], "total": x["total"]} for x in pay_agg]

    return {
        "total_offer": total_offer,
        "total_agreed": total_agreed,
        "total_received": total_received,
        "total_remaining": total_remaining,
        "total_expenses": total_expenses,
        "net_profit": total_received - total_expenses,
        "expenses_by_category": expenses_by_cat,
        "monthly_payments": monthly,
        "active_projects": sum(1 for p in projects if p.get("status") == "aktif"),
        "total_projects": len(projects),
    }

# ---------- Schedules (calendar) ----------
@api.get("/schedules")
async def list_schedules(user=Depends(current_user)):
    q = {} if user["role"] == "owner" else {"$or": [{"assigned_user_ids": user["id"]}, {"created_by": user["id"]}]}
    docs = await db.schedules.find(q, {"_id": 0}).sort("date", 1).to_list(500)
    return docs

@api.post("/schedules")
async def create_schedule(body: ScheduleIn, user=Depends(current_user)):
    doc = body.dict()
    if body.project_id and user["role"] != "owner":
        if not await db.projects.find_one({"id": body.project_id, "assigned_user_ids": user["id"]}, {"_id": 0, "id": 1}):
            raise HTTPException(403, "Bu işe atanmadınız")
    if body.project_id and not body.assigned_user_ids:
        proj = await db.projects.find_one({"id": body.project_id}, {"_id": 0, "assigned_user_ids": 1})
        if proj:
            doc["assigned_user_ids"] = proj.get("assigned_user_ids") or []
    doc.update({
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc),
        "created_by": user["id"],
    })
    await db.schedules.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/schedules/{sid}")
async def update_schedule(sid: str, body: ScheduleIn, user=Depends(current_user)):
    if user["role"] != "owner":
        own = await db.schedules.find_one({"id": sid, "$or": [{"assigned_user_ids": user["id"]}, {"created_by": user["id"]}]}, {"_id": 0, "id": 1})
        if not own:
            raise HTTPException(403, "Erişim yok")
    await db.schedules.update_one({"id": sid}, {"$set": body.dict()})
    doc = await db.schedules.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    return doc

@api.post("/schedules/{sid}/status")
async def set_schedule_status(sid: str, status: str = Form(...), user=Depends(current_user)):
    if status not in ("planlandi", "tamamlandi", "iptal"):
        raise HTTPException(400, "Geçersiz durum")
    q = {"id": sid}
    if user["role"] != "owner":
        q["$or"] = [{"assigned_user_ids": user["id"]}, {"created_by": user["id"]}]
    r = await db.schedules.update_one(q, {"$set": {"status": status}})
    if r.matched_count == 0:
        raise HTTPException(404, "Program bulunamadı")
    return {"ok": True}

@api.delete("/schedules/{sid}")
async def delete_schedule(sid: str, user=Depends(current_user)):
    q = {"id": sid}
    if user["role"] != "owner":
        q["$or"] = [{"assigned_user_ids": user["id"]}, {"created_by": user["id"]}]
    r = await db.schedules.delete_one(q)
    if r.deleted_count == 0:
        raise HTTPException(403, "Erişim yok")
    return {"ok": True}

# ---------- Institution process steps ----------
@api.get("/projects/{pid}/steps")
async def list_steps(pid: str, user=Depends(current_user)):
    q = {"id": pid, **_project_scope(user)}
    proj = await db.projects.find_one(q, {"_id": 0, "id": 1})
    if not proj:
        raise HTTPException(404, "Proje bulunamadı")
    docs = await db.steps.find({"project_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return docs

@api.post("/projects/{pid}/steps")
async def add_step(pid: str, body: StepIn, user=Depends(current_user)):
    doc = body.dict()
    doc.update({"id": str(uuid.uuid4()), "project_id": pid, "created_at": datetime.now(timezone.utc)})
    await db.steps.insert_one(doc)
    doc.pop("_id", None)
    return doc

async def _check_step_access(sid: str, user):
    step = await db.steps.find_one({"id": sid}, {"_id": 0, "project_id": 1})
    if not step:
        raise HTTPException(404, "Kayıt bulunamadı")
    if user["role"] != "owner":
        proj = await db.projects.find_one({"id": step["project_id"], "assigned_user_ids": user["id"]}, {"_id": 0, "id": 1})
        if not proj:
            raise HTTPException(403, "Erişim yok")

@api.put("/steps/{sid}")
async def update_step(sid: str, body: StepIn, user=Depends(current_user)):
    await _check_step_access(sid, user)
    await db.steps.update_one({"id": sid}, {"$set": body.dict()})
    doc = await db.steps.find_one({"id": sid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    return doc

@api.delete("/steps/{sid}")
async def delete_step(sid: str, user=Depends(current_user)):
    await _check_step_access(sid, user)
    await db.steps.delete_one({"id": sid})
    return {"ok": True}

# ---------- Documents ----------
@api.get("/projects/{pid}/documents")
async def list_documents(pid: str, user=Depends(current_user)):
    q = {"id": pid, **_project_scope(user)}
    proj = await db.projects.find_one(q, {"_id": 0, "id": 1})
    if not proj:
        raise HTTPException(404, "Proje bulunamadı")
    docs = await db.documents.find({"project_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@api.post("/projects/{pid}/documents")
async def upload_document(
    pid: str,
    category: str = Form("diger"),
    file: UploadFile = File(...),
    user=Depends(current_user),
):
    q = {"id": pid, **_project_scope(user)}
    proj = await db.projects.find_one(q, {"_id": 0, "id": 1})
    if not proj:
        raise HTTPException(404, "Proje bulunamadı")

    data = await file.read()
    if not data:
        raise HTTPException(400, "Dosya boş")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin").lower()
    doc_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/uploads/{user['id']}/{doc_id}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    try:
        await run_in_threadpool(put_object, storage_path, data, content_type)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 500
        if code == 402:
            raise HTTPException(402, "Depolama kredisi tükendi")
        raise HTTPException(500, f"Yükleme başarısız: {code}")

    doc = {
        "id": doc_id,
        "project_id": pid,
        "name": file.filename or f"dosya.{ext}",
        "category": category,
        "content_type": content_type,
        "size": len(data),
        "storage_path": storage_path,
        "uploaded_by": user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    await db.documents.insert_one(doc)
    doc.pop("_id", None)
    return doc

# Short-lived file-access token for web <img>/window.open fetches (no Authorization header)
class FileToken(BaseModel):
    token: str

@api.get("/file-token", response_model=FileToken)
async def file_token(user=Depends(current_user)):
    tok = jwt.encode(
        {"sub": user["id"], "iat": datetime.now(timezone.utc),
         "exp": datetime.now(timezone.utc) + timedelta(minutes=10), "scope": "file"},
        JWT_SECRET, algorithm=JWT_ALG,
    )
    return {"token": tok}

async def _authorize_file_access(doc, user_id: str, user_role: str):
    if user_role == "owner":
        return
    proj = await db.projects.find_one({"id": doc["project_id"]}, {"_id": 0, "assigned_user_ids": 1})
    if not proj or user_id not in (proj.get("assigned_user_ids") or []):
        raise HTTPException(403, "Erişim yok")

@api.get("/documents/{doc_id}/file")
async def download_document(
    doc_id: str,
    token: Optional[str] = None,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
):
    uid, role = None, None
    if creds and creds.scheme.lower() == "bearer":
        try:
            payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
            uid = payload.get("sub")
        except jwt.PyJWTError:
            pass
    if not uid and token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
            uid = payload.get("sub")
        except jwt.PyJWTError:
            pass
    if not uid:
        raise HTTPException(401, "Yetkisiz")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1})
    if not user:
        raise HTTPException(401, "Yetkisiz")
    role = user["role"]
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    await _authorize_file_access(doc, uid, role)
    try:
        content, ctype = await run_in_threadpool(get_object, doc["storage_path"])
    except Exception:
        raise HTTPException(500, "Dosya alınamadı")
    return Response(content=content, media_type=ctype,
                    headers={"Content-Disposition": f'inline; filename="{doc["name"]}"'})

@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user=Depends(current_user)):
    doc = await db.documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    if user["role"] != "owner" and doc["uploaded_by"] != user["id"]:
        raise HTTPException(403, "Erişim yok")
    await db.documents.delete_one({"id": doc_id})
    return {"ok": True}


class DocPatch(BaseModel):
    category: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=200)


@api.patch("/documents/{doc_id}")
async def update_document(doc_id: str, body: DocPatch, user=Depends(current_user)):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    await _authorize_file_access(doc, user["id"], user["role"])
    upd = {k: v.strip() for k, v in body.model_dump(exclude_none=True).items()}
    if any(not v for v in upd.values()):
        raise HTTPException(400, "Boş değer girilemez")
    if upd:
        await db.documents.update_one({"id": doc_id}, {"$set": upd})
        doc.update(upd)
    return doc


@api.put("/documents/{doc_id}/file")
async def replace_document_file(doc_id: str, file: UploadFile = File(...), user=Depends(current_user)):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    await _authorize_file_access(doc, user["id"], user["role"])
    data = await file.read()
    if not data:
        raise HTTPException(400, "Dosya boş")
    ext = (file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin").lower()
    storage_path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    try:
        await run_in_threadpool(put_object, storage_path, data, content_type)
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else 500
        if code == 402:
            raise HTTPException(402, "Depolama kredisi tükendi")
        raise HTTPException(500, f"Yükleme başarısız: {code}")
    upd = {
        "name": file.filename or f"dosya.{ext}",
        "content_type": content_type,
        "size": len(data),
        "storage_path": storage_path,
        "updated_at": datetime.now(timezone.utc),
    }
    await db.documents.update_one({"id": doc_id}, {"$set": upd})
    doc.update(upd)
    return doc

app.include_router(api)
app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=["*"],
    allow_methods=["*"], allow_headers=["*"],
)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
