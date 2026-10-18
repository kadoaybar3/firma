# Geliştirme Günlüğü — Firma Rehberi

> TEAM-LEAD'in sürekli geliştirme döngüsü kaydı. Her tur bu dosya **önce okunur**;
> tamamlanan işler tekrarlanmaz, reddedilen fikirler yeniden üretilmez.

---

## Sokt durum özeti (2026-10-20 itibarıyla)

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

## Bekleyen/bloklu işler

1. **[ORTAM ENGELİ] Supabase yerel doğrulaması:** Docker kapalı (2026-10-20 itibarıyla 2 kez kontrol edildi). Gerekli adım: Docker'ı aç → `supabase start` → `supabase db reset` → 0002 header'ındaki doğrulama sorguları (has_function_privilege vs.). Migration dosyaları push edilmemiş durumda — DNS'siz de çalışır yeniden üretilmeli. Kullanıcı Docker'ı açtığında derhal doğrula.
2. **[KULLANICI GİRDİSİ] Üretim domaini:** sitemap için `SITE_URL` gerekli; robots.txt'e `Sitemap:` satırı domain bilinene kadar eklenmedi.
3. **[İLERİ TUR] FirmCard ölçek riski:** `getCompanyById` id-bazlı O(n) arama → 1000 firmanın grid'inde O(n²). Firma düzeyinde kalıcı çözüm: FirmCard'a id yerine önceden çözülmüş veri aktarmak (FirmGrid API değişikliği — çok sayfalı etki, dikkatli tasarım gerekli).

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

_En son güncellenme: 2026-10-20 — TEAM-LEAD tur sıfır (günlük oluşturma + durum incelemesi)_
