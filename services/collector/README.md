# Koleksiyon Servisi (Python) — v1

İşletme adayı toplama katmanı; React panelinden **bağımsızdır**. Netlify
Functions ile KARIŞTIRILMAZ: Netlify tarafı yalnız vekildir
(`netlify/functions/collector-proxy.mts`), toplama mantığının tamamı burada.

## Mimari

```
Tarayıcı (admin paneli)
   │  /api/collector/*          (anahtar İSTEMCİDE YOK)
   ▼
Netlify Function (collector-proxy)   ← x-collector-key'i sunucuda ekler
   │  COLLECTOR_BASE_URL
   ▼
Bu servis (FastAPI)  ──►  Adaptörler (değiştirilebilir kaynaklar)
   jobs (bellek-içi)          google-places / csv / fake / maps-scraper(kapalı)
```

- **İş-tabanlı**: uzun süren arama HTTP bağlantısı açık tutulmaz. `POST /jobs`
  işi başlatır; `GET /jobs/{id}` durum + yarılamayı verir; adaylar
  `GET /jobs/{id}/candidates` ile alınır; `POST /jobs/{id}/cancel` iptal eder.
- **Tekrar iş koruması**: aynı (il, ilçe, kategori, kaynak) kombinasyonu
  çalışırken ikinci istek `409` + mevcut iş kimliği döner.
- **Zaman aşımı**: iş 120 saniyeyi aşarsa iptal edilip `failed` olur
  (`JOB_TIMEOUT_SECONDS`, contract.py).
- **Yetkiler**: `COLLECTOR_API_KEY` tanımlıysa tüm uçlar `x-collector-key`
  ister (sabit-zamanlı karşılaştırma). Anahtar yoksa yalnız `127.0.0.1`
  istekleri kabul edilir (yerel geliştirme kolaylığı — üretimde anahtar şart).

## API sözleşmesi (özet)

| Uç | Gövde/Dönüş |
|---|---|
| `GET /health` | `{ok, version, adapters[], scraperEnabled}` — yetkilendirmesiz |
| `POST /jobs` | `{il, ilce, kategori, limit(1-20), source, sourceConfig?}` → `201 {jobId,state}`; `409 {jobId,message}`; `400 {detail.message}` |
| `GET /jobs/{id}` | `{jobId, state(queued\|running\|done\|failed\|cancelled), source, progress{done,total}, error?}` |
| `GET /jobs/{id}/candidates` | `{jobId, state, candidates[{name, source, phone?, address?, website?, latitude?, longitude?, placeId?, warnings[]}]}` |
| `POST /jobs/{id}/cancel` | `{ok: true}` |

Aday `warnings` alanı: servisin iş-içi mükerrer telefonu ve eksik bilgiyi
etiketlemesi (kaynağa dokunmaz); istemci ayrıca mevcut DB'ye karşı kesin/şüpheli
benzerlik denetimi yapar (importLib `findDuplicates`).

## Yerel çalıştırma

```bash
pip3 install -r services/collector/requirements.txt
python3 services/collector/main.py        # http://127.0.0.1:8787
# .env benzeri ortam:
#   COLLECTOR_API_KEY=gizli      (üretilirken şart)
#   GOOGLE_PLACES_API_KEY=...    (google-places kaynağı için)
#
# CANLI maps-scraper (yerel deney modu — üretimde kullanılmaz):
#   APP_ENV=development \
#   COLLECTOR_ENABLE_SCRAPER=1 \
#   COLLECTOR_SCRAPER_PYTHON=<repo>/.gms-venv/bin/python \
#   COLLECTOR_SCRAPER_REPO=<google-maps-scraper repo kökü> \
#   python3 services/collector/main.py
# Kapılar eksikse kaynak kapıya kapanır; panel 400 + eksiklerin listesini gösterir.
```

Frontend yerelde zaten `/api/collector`'ü `127.0.0.1:8787`'e yollar
(vite.config.ts → server.proxy). `npm run dev` + servis ayakta → panel
çalışır.

## Test

```bash
cd services/collector && python3 -m pytest -q
```

Testler **ağ erişimi yapmaz** — sahte adaptör (`fake`) ve TestClient ile iş
yaşam döngüsü, yetkilendirme, tekrar-iş, iptal, CSV dönüşümü ve mükerrer
etiketleme doğrulanır. `google-places` adaptöründe yalnız istek gövdesi
oluşturan saf fonksiyon test edilir; gerçek çağrı başlatılmaz.

## Üretime dağıtım seçenekleri

1. **Ayrı sunucu (önerilen)**: servisi VPS'te systemd/konteyner ile çalıştır;
   Netlify'da `COLLECTOR_BASE_URL=https://servis.ornek.com`,
   `COLLECTOR_API_KEY=<gizli>`, servisin kendisinde aynı anahtar.
2. **Şimdilik yalnız yerel**: panel "yapılandırılmamış" uyarısı gösterir,
   davranış bozulmaz (503 → açık Türkçe mesaj).

## Kaynak adaptörleri — durum

| Kaynak | Durum | Not |
|---|---|---|
| `google-places` | Hazır (anahtar gerektirir) | Resmî Places API (New); ToS-uyumlu; ücretli — anahtar yoksa hiç çağrı açılmaz |
| `csv` | Hazır | Kullanıcı-provided içerik; `sourceConfig.content` |
| `fake` | Hazır (test/demo) | Ağ yok, deterministik |
| `maps-scraper` | **Kapalı (yerel deney modu, O-6)** | Canlı; ÜRETİMDE ASLA — açmak için 4 kapı: `APP_ENV != production` + `COLLECTOR_ENABLE_SCRAPER=1` + `COLLECTOR_SCRAPER_PYTHON` + `COLLECTOR_SCRAPER_REPO`. Alt süreç oydu: TLS doğrulaması zorunlu açık, consent-bypass çerezi gönderilmez, `--direct` (proxy yok), tek işçi/tek sayfa/tek sorgu. Eksik kapı → 400 + eksiklerin Türkçe listesi. bkz. `docs/SCRAPER-DEGERLENDIRMESI.md` |
| (gelecek) OSM / açık veri | Tasarlandı, yok | Aynı `BaseSourceAdapter` sözleşmesi |

## Veri saklama sınırı

İşler ve adaylar **yalnız bu servisin belleğinde** yaşar (v1); Firma Rehberi
veritabanına yalnız kullanıcı onaylı içe aktarma yazar (React → repo →
Supabase, mevcut kategori-lock ile). Kalıcı iş denetim kaydı gerekirse
`collector_jobs` tablosu önerisi ayrıca onaya sunulur — şu an YOK.
