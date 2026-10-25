# HaritaPro — PRD

## Original Problem
Harita mühendislik firması için mobil takip uygulaması: sahip ve çalışanlar aynı uygulamada evrak, arazi programı ve kurum süreçlerini takip eder. Teklifler, anlaşılan tutarlar, kalan ödemeler tek yerde. Sahip finansı görür; çalışanlar sadece iş süreçlerini görür. iOS, Android ve Web (Windows tarayıcı) erişimi.

## User Choices
- Manual user management (owner creates employees with email+password)
- File upload + viewing (Emergent Object Storage)
- Calendar-based field program
- Finance: offer, agreed, payments, remaining, collection date + expenses + simple charts
- Institution process checklist (beklemede/onaylandı/reddedildi) per institution

## Architecture
- Expo Router (tabs: Projeler, Takvim, Finans[owner only], Ayarlar) + /project/[id] detail (Finans, Evraklar, Arazi, Kurum)
- FastAPI + MongoDB, JWT (bcrypt), RBAC enforced server-side; finance fields stripped for employees
- Files: Emergent Object Storage via backend; web viewing uses short-lived ?token=

## Implemented (2026-06)
- Auth, owner seeding, employee create/delete
- Projects CRUD, payments with auto remaining calc, expenses, finance summary + monthly chart
- Schedules (14-day strip calendar, completion toggle)
- Institution steps grouped by institution, tap to cycle status
- Document upload (file picker + camera) and open
- Backend tests: /app/backend/tests/test_api.py (27 passing)

## Backlog
- P1: Assign employees to projects/schedules from UI (backend supports assigned_user_ids)
- P1: Native date/time pickers; edit project screen
- P2: PDF/Excel reports, customer payment reminders, employee password change
