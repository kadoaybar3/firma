# Geliştirme Günlüğü — Firma Rehberi

> TEAM-LEAD'in sürekli geliştirme döngüsü kaydı. Her tur bu dosya **önce okunur**;
> tamamlanan işler tekrarlanmaz, reddedilen fikirler yeniden üretilmez.

---

## Mevcut durum özeti (2026-10-20 itibarıyla)

- **Canlı bağlantı kurulumu tamamlandı (tur P-1):** `.env` dolu (değerler commit edilmez), `isSupabaseConfigured=true`; uygulama açılışta Supabase'den anlık görüntü yükler (BootGate: "Veri bağlantısı kuruluyor…" → hata/ready). Migration'lar canlıda **henüz uygulanmadı** (PGRST205; tablolar yok) → uygulama dürüst hata kartı gösterir, sessiz demo'da kalma YOK. Migration'lar uygulanınca kapı kendiliğinden açılır.
- `.env` değerleri tarayıcıya dev'de inlinelenir; vitest'te istemci **oluşturulmaz** (`MODE === "test"` guard) → birim testleri canlıya asla dokunamaz
- Temel mü: ana chunk 269,25 kB / 85,48 gzip (supabase-js dahil); 12 test dosyası / **75 test**; `tsc + build` temiz
- Dev server: `nohup npm run dev > …/devserver.log 2>&1 &` (5173)
- HEAD: `9eaa018…` sonrası; son 6 commit: tur 1–6 (tel linki, convertLead, companyIndex, soft-404, mikro bakım, web formu)

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
| Tur 5: mikro bakım | `6e60d27` | ?ilçe çift-decode URIError crash kapatıldı; ölü kod; admin aday tablosunda temsilci ad sütunu | URLSearchParams.get zaten decode'lu — çift decode yasağı ilke olarak loglandı |
| Tur 6: web başvuru formu | `9eaa018` | ContactPage çalışan form (+honeypot) → createPublicLead (rep'siz 'web' lead) → admin panosu; 0004 source kolonu; 0001 leads.sales_rep_id NOT NULL kaldırıldı (E1) | Anonim INSERT RLS politikası bilinçli koymadı: canlıya geçişte + rate limit ayrı güvenlik kararı; listLeads repId'siz-temsilci açığı erken kapandı |
| Tur P-1: canlı bağlantı katmanı | `—`(bu commit) | dataSource.ts: 13 tablo okuma (loadSnapshot) + camel/snake mappers + fark-tabanlı `syncSnapshot` (FK sıralı upsert/delete; audit_log bilinçli dışarıda — 0002 execute yalnız service_role); repo mod-çatallı (Supabase modda localStorage/seed yok); auth gerçek `signInWithPassword` + profiles haritası (yoksa self-insert temsilci) + giriş/çıkışta rehydrate; App BootGate fazları; LoginPage async+pending; supabase.ts vitest guard; 0005 öneri (app_settings admin yazma politikası eksikti — 0001'de drop edilip yeniden yaratılmamış bulgu) | vitest `.env`'i yükler → testler canlı modda koşturabilecekti; `MODE="test"` guard'ı ile istemci testte hiç yaratılmaz (75 test demo ciğeriyle geçer). HMR değil taze sunucu: doğrulama "eski modül" çeldiricisi yaratabiliyor — sunucuyu yeniden başlat |

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

1. **[KULLANICI AKSİYONU] Migration'ları canlıya uygula (SIRAYLA):** 0001 → 0002 → 0003 → 0004, akabinde **0005 (öneri; app_settings yazma politikası)**. Yol A: Supabase Dashboard → SQL Editor → dosyaları tek tek, TÜM dosyayı tek seferde koş. Yol B: `supabase db push` (CLI ile bağlantı gerekir). **Bu adım bize değil kullanıcıya ait — uygulama kodudur, otomatik koşulmaz.**
2. **[KULLANICI AKSİYONU] İlk kullanıcı + admin yükseltme:** Authentication → Users → Add user (e-posta + şifre). Sonra SQL: `update public.profiles set role='admin' where id='<user-uuid>';` (profiles satırı ilk girişte kendiliğinden 'temsilci' olarak doğar). Temsilci profilini bir sales_reps kaydına bağlama: `update public.profiles set sales_rep_id='<rep-uuid>' where id='<user-uuid>';` — rep kaydı panelden oluşturulabilir.
3. **[DOĞRULAMA] Canlı dolu akış smoke testi:** migration uygulanınca (a) anonim ana sayfa canlı boş veriye hazır olmalı (Boş durum görünümü), (b) admin girişinde tam panel görüntüsü, (c) Ayarlar kaydetme 0005'siz 42501/RLS hatası verir — 0005 uygulanınca geçer.
4. **[ORTAM ENGELİ] Supabase yerel doğrulaması:** Docker kapalı (2026-10-20 itibarıyla 3 kez kontrol edildi). Migration'lar canlıya elle uygulanacak; yerel ön-doğrulama (0002/0003 header'daki has_function_privilege sorguları) Docker açılınca yapılabilir.
5. **[KULLANICI GİRDİSİ] Üretim domaini:** sitemap için `SITE_URL` gerekli; robots.txt'e `Sitemap:` satırı domain bilinene kadar eklenmedi.
6. **[KÜÇÜK TUR] FirmsPage ?ilçe çift-decode:** `searchParams.get("ilce")` zaten decode'lu; üstüne `decodeURIComponent` uygulandığından `?ilce=100%` gibi değerlerin içinde bare `%` URIError ile sayfayı düşürür (code-reviewer Tur 4 bulgusu; tek satır).
7. **[KÜÇÜK TUR] SEO noindex-canonical kural kilidi:** SEO.tsx'te noindex→canonical baskısı kuralı DOM-testi jsdom gerektiriyor; yeni devDep (jsdom) veya vitest environmentMatchGlobs değerlendirmesi gerekiyor.
8. **[TEMİZLİK] Ölü kod:** Leads.tsx `listCitiesInventory` + `void categories`; temsilci kolonu admin görünümünde hep "—" (rep adı basılmıyor).
9. **[TASARIM TURU] Faz A/B devamı:** index.css v2 token uygulaması kısmi; Faz B TSX düzeltmeleri (Settings table-wrap, company-card--featured, Admin/RepLayout display:block) planlanmış, başlanmadı.

## Reddedilen/ertelenen fikirler (tekrar üretme!)

- **School/Farm/Restaurant gibi doğrudan schema.org eşleyicileri** — yanlış tip; kategori→tip haritası `src/lib/seo.ts` BUSINESS_TYPES'ta korundu, yeni kategori eklenirse sadece oraya ekle
- **JSON-LD'ye geo/aggregateRating/logo/og:image** — veri yok; uydurma veri yasak (kalıcı ilke)
- **FirmsPage'de listCategories/listCities memo'su** — O(1) cache referans döndürüyor, ölçülebilir fayda yok
- **ogType "article"** — firma profili için semantik olarak "website" doğru
- **robots.txt'e Sitemap satırı** — domain bilinene kadar gecikmeli (H2 değil, kullanıcı girdisi bağımlı)
- **Service worker / PWA** — değerlendirilmedi; tek bir çalışma oturumunda yüksek risk, ileri tura aday ama TEKRAR önerilmeden önce mevcut environment'la uyumu kanıtlanmalı

## Sonraki turda olası adaylar (değerlendirmeye açık — bu liste reçete değil)

- **[TAKİP] Web form dönüşüm turu kapandı ama SendMessage:** ConvertLeadPanel'de lead.source 'web' rozet işaretleme + admin adayları 'kaynak' sütunu (görselleştirme yok — creates tracks but no visible source column)
- **[KÜÇÜK] SEO noindex-canonical kural kilidi:** jsdom/lighter DOM env gerektiriyor — devDep değerlendirmesi
- **[KÜÇÜK] LeadBoard rep Map memo:** rep sayısı büyüyünce (getRepById O(n) × aday) — şimdilik önemsiz, 100+ adayda yeniden bak
- **[SECURITE turu] Yazımdaki open questions:** anonime INSERT policy (0004 notunda), RLS rate limit RPC tasarımı — canlıya taşınmadan önce ayrı inceleme paketi
- [SITE CTA] HomePage'e 'Firmanızı ekletin' bağlantısı (/iletisim #form) — Tur 6 form artık var

## Ortam notları

- `supabase start` için Docker zorunlu; CLI v2.116.0 yüklü. `supabase/.temp/` .gitignore'da
- Test/ön kontrol komutları: `npm test`, `npx tsc --noEmit`, `npm run build`
- Öğrencesiz ölçüm yöntemi: vite-node geçici script + gerçek repo fonksiyonları (performance turu örnekleri kaynak kod geçmişinde)

---

_En son güncellenme: 2026-10-20 — Turlar 1–6 + P-1 canlı bağlantı katmanı (migration uygulaması kullanıcı aksiyonu bekliyor) — TEAM-LEAD sürekli döngü_
