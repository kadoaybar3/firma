# Scraper Değerlendirmesi — `sonagara-vashram/google-maps-scraper`

**Karar: ÜRETİMDE KULLANILMAZ.** Kod tabanına bağlanmadı; bu doküman, yalnızca
değerlendirme amacıyla okunan depo README'sine dayanır.

## 1. Deponun kendini tanıttığı hali

Depo README'si (okundu; 2026-10) şu ifadeleri içerir:

- "It talks directly to the same internal endpoint the Google Maps frontend
  uses" — Google'ın **belgelenmemiş `tbm=map` internal ucu**, Chrome TLS
  taklidiyle (`curl_cffi`).
- README'nin FAQ bölümü: "using Google's undocumented endpoints violates Google's
  Terms of Service."
- Proxy döndürme, devre kesici, **~120 sonuç sınırını ızgara moduyla aşma**,
  web sitelerinden **e-posta toplama** ve yorum verisi çekme.
- "Educational purpose only" feragatname — yazarlar üretim/ticari kullanım için
  resmî Places API'yi yönlendirir.

## 2. Firma Rehberi politikası neden YASAK yazıyor?

| Risk | Açıklama |
|---|---|
| **Google ToS ihlali** | İçerik dizini (rehber) verisi için otomatik toplama; ToS açıkça yasaklar ve IP blokları kalıcı risk taşır. |
| **Veri güvenilirliği** | Parse edilen gizli JSON format Google değiştirdiğinde sessizce bozulur; firma verisi eksik/yanlış olabilir — rehberin kamusal güvenilirliği zarar görür. |
| **Hukuki sorumluluk** | Scrape hukuk alanı "bellî muğlak"; üretim veri hattı için risk kabul edilemez. |
| **Yorum/fotoğraf/e-posta çıkarımı** | İçerik verisini (yorum metni, fotoğraf URL'leri) kalıcı saklamak Places API ToS kısıtlarına aykırı; ayrıca web sitelerinden topladığı e-postalar spam/izinsiz iletişim riskine dönüşür. |
| **Proxy döndürme altyapısı** | Bloğu atlatmak için proxy döndürmesi = erişim kurallarının bilinçli ihlali; ek bir yasal/etik risk üretir. |

## 3. Uygulamadaki yalnız izole değerlendirme koltuğu

- `services/collector/adapters.py` içinde `ScraperAdapter` **varsayılan kapalıdır**.
- Etkinleşme koşulu İKİ katman ister: `APP_ENV != "production"` **VE**
  `COLLECTOR_ENABLE_SCRAPER=1`. Üretimde (APP_ENV=production) imkansız.
- Kayıt defterinde var; `search()` çağrılırsa `SourceDisabledError` fırlatıp işi
  failed durumuna taşır — **ağ erişimi hiç yapmaz** ve DB'ye yazmaz.
- Sağlık ucu `/health` `scraperEnabled` alanını dürüstçe bildirir.

## 4. ToS-uyumlu yol (üretim benimsenmiş olan)

- **Yerleşik kaynaklar**: Google Places **API (New)** (Essentials/Pro SKU'ları;
  place_id 12 ay önbelleğe alınabilir; içerik verisi kalıcı saklanmaz),
  kullanıcı-provided CSV/Excel, işletme sahibi iletişim formu.
- **Gelecek adaptörlere açık** (servis kayıt defteri üzerinden): OSM/Nominatim
  tabanlı yerel işletme listeleri, resmî kamusal açık veri, ticari lisanslı
  dizin dataset'leri.

## 5. İleride yasal bir scrape yolu değerlendirilecekse

Yalnızca (a) kaynağın sahibinden yazılı izin, (b) açık ToS/lisans uygunluk
incelemesi ve (c) ayrı bir kod gözden geçirmesinin ardından, kullanıcı onayı ile
**ayrı bir çalışma dalında** değerlendirilir — mevcut çalışma ağacına ve üretim
veritabanına bağlanmaz.
