# Geliştirme Günlüğü — Firma Rehberi

> TEAM-LEAD'in sürekli geliştirme döngüsü kaydı. Her tur bu dosya **önce okunur**;
> tamamlanan işler tekrarlanmaz, reddedilen fikirler yeniden üretilmez.

---

## Mevcut durum özeti (2026-10-20 itibarıyla)

- Demo mod aktif: veri localStorage (`firma-rehberi.db.v2`), Supabase `.env` girilmedi
- Temel mü: ana chunk 283,06 kB / 89,05 kB gzip; 6 test dosyası / 36 test; build temiz
- Dev server: `nohup npm run dev > …/devserver.log 2>&1 &` (5173)
- HEAD: `38656eb` (güvenlik paketi). Son 5 commit: güvenlik şema paketi, FirmsPage perf, ErrorBoundary + HomePage perf, SEO paketi, agent kadrosu

## Tamamlanan turlar

| Tur | Commit | Özet | Öğrenilen |
|---|---|---|---|
| Agent kadrosu + lazy refactor | `e28f21f` | 8 uzman ajan tanımı (.opencode/agents), App.tsx route-level code-splitting; ana bundle 386→281 kB | Suspense fallback dev'te HMR artığından takılıyor sanılıyordu — gerçek değil; taze tab ile sorunsuz |
| Firma profili v3 vitrin | `c94b9be`, `abd7b1e` | Nötr mürekkep paleti + tek marka vurgusu, hairline bölümler, yüzen mobil alt çubuk, WCAG AA | hashHue random renk kaldırıldı (tutarlı marka tonu); Lightbox eklendi |
| SEO paketi | `77b63e7` | SEO.tsx idempotent data-seo head yönetimi (canonical/OG/Twitter/JSON-LD/noindex), lib/seo.ts (LocalBusiness eşleme, safeExternalUrl), SITE_URL kapılı sitemap (39 URL), 13 yeni test | code-reviewer **engelleyici** yakaladı: useMemo erken dönüşten sonra → hooks kuralı ihlali. Hooks'un tamamı guard'dan önce olmalı |
| ErrorBoundary + HomePage perf | `7afa56d` | Hata sınırı (chunk/render ayrımı, data-seo benzeri sınıf), HomePage tek-geçişli derive memo. Ölçüm: 1000 firmada tuş vuruşı başına 1,72 ms → ≈0 | React.lazy reddedilen promise'i önbellekler → chunk hatasında tek kurtarma reload; "tekrar dene" remount'u import yenilemez |
| FirmsPage perf | `2ea6c89` | İlçe sayaçları tek geçişli `districtCountsByCity` (sıralama maliyeti yok) → 1000 firmada 0,0332 → 0,0135 ms ilk derive, tuş vuruşu ≈0 | `listCompanies()` sıralama (localeCompare) maliyetlidir — sayaç için kullanma; ölçüm yapmadan memo'ya alma (listCategories/listCities O(1) kaldı — gereksiz memoization istenmedi) |
| Güvenlik şema paketi | `38656eb` | K1: current_role → current_app_role (CURRENT_ROLE RESERVED — dosya sözdizimsel geçersizdi); **K2 (yeni kritik): profiles RLS yoktu→ self-escalation boşluğu**, kapatıldı; H1: log_audit RPC yüzeyi kapalı; H2: sales_open_renewal_unique (potansiyel predikatlı); H3: verify_payment_manual tutar çapraz doğrulama; 6 statik invariant testi | RLS policy'ler her rol için değerlendirilir → policy helper'ları anon'dan çekilemez (B1). 0002 herhangi bir canlı veriye dokunmaz, rollback yönlü |
| Tur 1: kart tel: linki | `9ea242f` | FirmCard telefonu tek dokunuşla aranabilir (telHref yardımcısı + boşnumara fallback + hover stil); 3 kenar durumu testi. Mobil dönüşüm: arama 2 adım → 1 dokunuş | code-reviewer çift-çağrı notunu uyguladı (phoneHref tek hesaplama); aria-label gereksiz (metin numara içeriyor) |
| Tur 2: aday→firma köprüsü | `8cf5d93` | Temsilci 'anlaşma' → admin tek harekette firma: convertLead (admin-only, çift-dönüşüm guard, durum korunur, aday_donusum denetimi), deleteLead/deleteCompany korumaları, UI prefilled CompanyForm, EditCompany boş-form defekt düzeltmesi, 0003 FK migration (additive, set null) | code-reviewer B1 (zombi aday) → deleteCompany işaretçi temizliği + FK on delete set null; repId yönü karar: form kazanır (test kalıcı sabitler) |
| Tur 3: FirmGrid O(1) indeks | `568868a` | companyIndex() (sürüm sayacılı Map, canlı referans) → kart başına 3× O(n) find → O(1); ölçüm: n=1000 grid lookup 3.344→0.089 ms (37.6×); çağrı API değişmedi | code-reviewer testlerde B-1/B-2 (yalancı-geçen iddia) yakaladı → testler vurucu hale getirildi; review salt-okunur olmalı, test iddianın kendisini kanıtlamalı |
| Tur 4: geçersiz slug soft-404 | `a7b5500` | slugProblem() (pure) + FirmsPage erken-dal noindex bulunamadı + SEO kuralı: noindex'te canonical basılmaz; tarayıcıda 3 yol doğrulandı | Shedehirsiz ?ilçe serbest filtre kaldı (regresyona karşı 8 test); SEO noindex-canonical kural kilidi jsdom bağımlığı ister — notlandı |

### Fikir bankası — değerlendirme matrisi (2026-10-20, 4 ajan paralel üretti)

| Fikir | Fayda | Ticari değer | Maliyet | Risk | Karar |
|---|---|---|---|---|---|
| Kartta tel: linki (UI) | Yüksek | Yüksek | Çok düşük | Yok | ✓ TUR 1 |
| Aday→Firma köprüsü (frontend) | Yüksek | En yüksek (iş modeli) | Orta | Orta | ✓ TUR 2 |
| FirmGrid O(n²) lookup (perf, ölçümlü: n=500→387ms, n=1000→1531ms) | Ölçekte yüksek | Orta | Orta (FirmCard API) | Orta | ✓ TUR 3 |
| Geçersiz slug soft-404/noindex (seo) | Orta | Orta (domain erteli) | Düşük-orta | Düşük | TUR 4 adayı |
| Temsilci kolonu "—" görünür (mevcut) | Düşük | Düşük | Düşük | — | temizlik turu |
| dead code: listCitiesInventory/void categories (mevcut) | — | — | Düşük | — | temizlik turu |

## Bekleyen/bloklu işler

1. **[ORTAM ENGELİ] Supabase yerel doğrulaması:** Docker kapalı (2026-10-20 itibarıyla 3 kez kontrol edildi). Gerekli adım: Docker'ı aç → `supabase start` → `supabase db reset` → 0002/0003 header'ındaki doğrulama sorguları (has_function_privilege vs.). Migration dosyaları (0001-0003) hazır, push edilmemiş; kullanıcı Docker'ı açtığında derhal doğrula.
2. **[KULLANICI GİRDİSİ] Üretim domaini:** sitemap için `SITE_URL` gerekli; robots.txt'e `Sitemap:` satırı domain bilinene kadar eklenmedi.
3. **[KÜÇÜK TUR] FirmsPage ?ilçe çift-decode:** `searchParams.get("ilce")` zaten decode'lu; üstüne `decodeURIComponent` uygulandığından `?ilce=100%` gibi değerlerin içinde bare `%` URIError ile sayfayı düşürür (code-reviewer Tur 4 bulgusu; tek satır).
4. **[KÜÇÜK TUR] SEO noindex-canonical kural kilidi:** SEO.tsx'te noindex→canonical baskısı kuralı DOM-testi jsdom gerektiriyor; yeni devDep (jsdom) veya vitest environmentMatchGlobs değerlendirmesi gerekiyor.
5. **[TEMİZLİK] Ölü kod:** Leads.tsx `listCitiesInventory` + `void categories`; temsilci kolonu admin görünümünde hep "—" (rep adı basılmıyor).
6. **"Firmanızı ekletin" kazanım CTA'sı:** halka açık iletisim sayfasında işletme başvuru formu yok (frontend tur 1 önerisi) — sonraki büyük aday.

## Reddedilen/ertelenen fikirler (tekrar üretme!)

- **School/Farm/Restaurant gibi doğrudan schema.org eşleyicileri** — yanlış tip; kategori→tip haritası `src/lib/seo.ts` BUSINESS_TYPES'ta korundu, yeni kategori eklenirse sadece oraya ekle
- **JSON-LD'ye geo/aggregateRating/logo/og:image** — veri yok; uydurma veri yasak (kalıcı ilke)
- **FirmsPage'de listCategories/listCities memo'su** — O(1) cache referans döndürüyor, ölçülebilir fayda yok
- **ogType "article"** — firma profili için semantik olarak "website" doğru
- **robots.txt'e Sitemap satırı** — domain bilinene kadar gecikmeli (H2 değil, kullanıcı girdisi bağımlı)
- **Service worker / PWA** — değerlendirilmedi; tek bir çalışma oturumunda yüksek risk, ileri tura aday ama TEKRAR önerilmeden önce mevcut environment'la uyumu kanıtlanmalı

## Sonraki turda olası adaylar (değerlendirmeye açık — bu liste reçete değil)

- UI/UX: kategori gezinme akışı, arama sonuç boşluğu metinleri, ilçe keşfinin mobil davranışı
- SEO: sitemap SITE_URL bağlantısı (domain gelince), kingsalar noindex dışı sayfalarda canonical kontrolü
- Perf: FirmCard API dönüşümü (bkz. yukarıda bekleyen işler)
- İş akışı: admin/temsilci panellerinde boş-durum (empty state) işlevselliği, toplu yayın kontrolü hızlandırıcısı
- Erişilebilirlik: odak halkası denetimi, klavye ile mobil alt çubuk erişimi

## Ortam notları

- `supabase start` için Docker zorunlu; CLI v2.116.0 yüklü. `supabase/.temp/` .gitignore'da
- Test/ön kontrol komutları: `npm test`, `npx tsc --noEmit`, `npm run build`
- Öğrencesiz ölçüm yöntemi: vite-node geçici script + gerçek repo fonksiyonları (performance turu örnekleri kaynak kod geçmişinde)

---

_En son güncellenme: 2026-10-20 — Turlar 1 (`9ea242f`), 2 (`8cf5d93`), 3 (`568868a`), 4 (`a7b5500`) tamamlandı — TEAM-LEAD sürekli döngü_
