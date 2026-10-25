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
- Iteration 2: employee assignment on projects/schedules (schedules inherit project team), tap-to-pick date/time sheet, WhatsApp remaining-balance reminder (client phone), PDF project report (finance only for owner), week navigation in calendar, Turkish labels, timezone fix (tz_aware Mongo)
- Auth, owner seeding, employee create/delete
- Projects CRUD, payments with auto remaining calc, expenses, finance summary + monthly chart
- Schedules (14-day strip calendar, completion toggle)
- Institution steps grouped by institution, tap to cycle status
- Document upload (file picker + camera) and open
- Backend tests: /app/backend/tests/test_api.py (27 passing)

## Backlog
- P1: Edit project screen (name/amounts/status); employee password change
- P2: PDF/Excel reports, customer payment reminders, employee password change
