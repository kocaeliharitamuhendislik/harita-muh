# HaritaPro – Kendi Sunucunuza Kurulum Notu

## Parçalar
- `backend/` – FastAPI sunucusu (Python 3.11). Tüm API adresleri `/api` ile başlar.
- `frontend/` – Expo (React Native) uygulaması: iOS, Android ve web.
- Veritabanı: MongoDB (koda dahil değildir, ayrıca kurulmalıdır).

## 1. Sunucu (backend)
```bash
cd backend
pip install -r requirements.txt
```
`backend/.env` dosyası oluşturun:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=haritapro
JWT_SECRET=<uzun-rastgele-bir-metin>
APP_NAME=haritapro
OWNER_EMAIL=<işletme sahibinin e-postası>
OWNER_PASSWORD=<işletme sahibinin şifresi>
EMERGENT_LLM_KEY=<evrak depolama için, aşağıya bakın>
```
Çalıştırma:
```bash
uvicorn server:app --host 0.0.0.0 --port 8001
```
İlk açılışta işletme sahibi hesabı OWNER_EMAIL / OWNER_PASSWORD ile otomatik oluşturulur.

## 2. Evrak (dosya) depolama – ÖNEMLİ
Evrak dosyaları şu an Emergent'in depolama hizmetinde tutuluyor (`server.py` içindeki `put_object` / `get_object`).
Bu hizmet `EMERGENT_LLM_KEY` ve Emergent kredisi ister. Tamamen bağımsız olmak için bu iki fonksiyon
yerel diske (ör. `backend/uploads/`) veya başka bir depolama hizmetine yazacak şekilde değiştirilmelidir.

## 3. Windows / tarayıcı sürümü
Web sürümü hazır olarak `backend/web_dist` içindedir ve sunucu tarafından `http://<sunucu-adresi>:8001/api/web` adresinden açılır.
Kod değişirse yeniden üretmek için: `cd frontend && yarn install && bash scripts/build-web.sh`

## 4. Telefon uygulaması (Android / iOS)
`frontend/.env` içinde `EXPO_PUBLIC_BACKEND_URL=http(s)://<sunucu-adresi>` yazın.
Telefonlar sunucuya ağ üzerinden erişebilmelidir (aynı ağ veya internete açık adres + HTTPS önerilir).
Android APK ve iOS sürümü Expo araçlarıyla (EAS Build) bu ayarla yeniden oluşturulmalıdır.

## 5. Mevcut veriler
Emergent'teki mevcut veriler (işler, ödemeler, kullanıcılar) bu koda dahil değildir; yeni kurulum boş veritabanıyla başlar.
