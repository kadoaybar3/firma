# Firma Rehberi

Afyonkarahisar'da faaliyete başlayıp Türkiye geneline yayılacak, profesyonel bir yerel **firma rehberi** platformu. React + TypeScript + Vite ile yazılmıştır.

> 📡 **Çalışma modu:** `.env` doluysa uygulama canlı Supabase veritabanına bağlanır (RLS arkası;
> ayrıntılı kurulum: [`docs/SUPABASE-KURULUM.md`](docs/SUPABASE-KURULUM.md)). `.env` boşsa DEMO MOD:
> tüm veriler yalnızca tarayıcının `localStorage`'ında tutulur. Uygulama hiçbir yerde "veritabanına
> bağlandı" gibi davranmaz; gerçek veritabanına geçiş için aşağıdaki adımlar hazırdır.

---

## 🚀 Çalıştırma

```bash
npm install        # bağımlılıklar
npm run dev        # http://localhost:5173
npm test           # birim testleri (komisyon motoru, slug, arama)
npm run build      # üretim derlemesi (dist/)
npm run preview    # dist'i lokal sunar
```

## 👤 Demo hesapları (yalnızca demo mod)

| Rol                | E-posta         | Şifre  |
|--------------------|-----------------|--------|
| Platform Yöneticisi| admin@demo.com  | `demo` |
| Satış Temsilcisi 1 | ayse@demo.com   | `demo` |
| Satış Temsilcisi 2 | mehmet@demo.com | `demo` |

- Halka açık site: `/`
- Yönetim paneli: `/yonetim` (ayrı arayüz, yalnız admin)
- Temsilci paneli: `/temsilci` (ayrı arayüz, yalnız temsilci)

## 🧭 Halke açık site

- Ana sayfa: büyük arama alanı, kategori grid'i, öne çıkan firmalar, popüler kategoriler, ilçe keşif alanı, "nasıl çalışır" bölümü, yasal/iletişim bağlantıları
- Arama: `/firmalar?q=&kategori=&sehir=&ilce=` — firma adı/kategori/şehir/ilçe filtreleri, boş sonuç ve hata ekranları
- SEO dostu yollar: `/kategori/:slug`, `/sehir/:slug`, `/sehir/:slug/:ilce`
- Firma detay: `/firma/:slug` — telefon, açık adres, **harita bağlantısı**, çalışma saatleri, galeri, web/sosyal bağlantılar, paylaşım (her firma paylaşımlı kendi sayfasına sahiptir)
- Sayfa başlığı/meta per-route güncellenir (`<title>` + description)

## 🧱 Klasör yapısı

```
src/
  components/   paylaşılan UI (SiteLayout, FirmCard, ui.tsx, SEO)
  pages/        halka açık sayfalar + giriş
  admin/        yönetim paneli (ayrı sidebar düzeni)
  rep/          satış temsilcisi paneli
  lib/          types, engine (iş kuralları), repo (veri katmanı), fmt/slug/hours, payments, auth
  data/         örnek veri tohumu (Afyonkarahisar)
supabase/
  migrations/0001_init.sql   tam şema + RLS + SECURITY DEFINER fonksiyonlar
```

## 🔌 Supabase'e geçiş (backend hazır; erişim bilgisi bekleniyor)

1. Supabase projesi açın (ücretsiz katman yeterli).
2. `supabase/migrations/0001_init.sql` dosyasını uygulayın (`supabase db push` veya SQL editörü).
3. `.env.example` → `.env` kopyalayın; `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` girin.
4. Yöneticiyi oluşturun: auth.users'a kullanıcı ekleyin, `profiles` tablosuna `role='admin'` satırı.

Şema; **Row Level Security**, **komisyon mükerrerlik engeli** (`UNIQUE(sale_id)`), **odeme idempotency** (`provider_ref UNIQUE`) ve **SECURITY DEFINER** onay fonksiyonlarıyla gelir. Demo depo (`src/lib/repo.ts`) aynı iş kurallarını tarayıcıda uygular; canlıya geçişte tek değişiklik Supabase deposunun devreye alınmasıdır.

## 💳 Ödeme altyapısı

- Ödemeler **yalnızca kredi/banka kartı** ile, sağlayıcının barındırılmış (3D Secure) sayfası üzerinden alınacaktır.
- `src/lib/payments.ts` sağlayıcı soyutlamasını tanımlar; **sağlayıcı hesabınız yoksa entegrasyon yapılandırılmamıştır** ve arayüz bunu açıkça gösterir.
- Kurallar:
  - Kart bilgisi **hiçbir tabloda tutulmaz** (yalnız `provider_ref` + durum).
  - Durum güncellemesi **yalnız sunucudaki imzalı webhook** ile yapılır; `provider_ref UNIQUE` idempotentliği sağlar.
  - Entegrasyon öncesi yönetici ödemeyi **manuel doğrular** — bu adım denetim kaydına "manuel" notuyla yazılır.

## 💰 Üyelik & komisyon modeli (yönetilebilir değerler)

Değerler `app_settings` (Supabase) veya panel > Ayarlar (demo) ile değiştirilir; **kaynak koda sabitlenmez**:

| Kalem | Örnek başlangıç değeri |
|---|---|
| Yıllık üyelik bedeli | 1.000 TL |
| Satış temsilcisi komisyonu | 600 TL |
| Doğrudan referans ödülü | 100 TL |
| Üyelik yenileme komisyonu | 600 TL (ilk satış temsilcisine otomatik bağlanır) |

İş kuralları (`src/lib/engine.ts` + SQL fonksiyonları):
- Ödemesi doğrulanmamış satış **kesinleşmez**, komisyon üretilmez.
- Aynı satıştan **tek** komisyon üretilir (test ile korumalı).
- Komisyon, satış **kesinleşme** anında oluşur; temsilci durumu/tutarı değiştiremez.

## 🔒 Güvenlik özeti

- Roller arayüz dışında **veritabanı seviyesinde** (RLS) korunur; temsilci yalnız kendi kayıtlarına erişir.
- Kritik yönetim işlemleri `audit_log` tablosuna/panelin işlem geçmişine yazılır.
- Demo veriler gerçekçi ama örnek amaçlıdır; gerçek kişisel veri içermez.
- KVKK ve Kullanım Koşulları sayfası kurulu; kurumsal unvan/iletişim bilgileri eklenebilir.

## 🧪 Testler

```bash
npm test
```
- `engine.test.ts`: ödemesiz satış kesinleşmez, idempotent komisyon, yenileme komisyonu ilk temsilciye bağlanır, webhook mükerrerliği önlenir
- `slug.test.ts`: Türkçe slug + arama normalizasyonu

## ❗ Yapılmadı / yapılandırılmasını bekleyenler

1. **Migration'ların canlıya uygulanması** — supabase/migrations 0001–0006 hazır; SQL Editor sırası: [`docs/SUPABASE-KURULUM.md`](docs/SUPABASE-KURULUM.md).
2. **Gerçek ödeme sağlayıcısı** — iyzico/PayTR hesabı; `VITE_PAYMENT_*` ortam değişkenleri ve sunucu tarafındaki webhook doğrulama servisi (bu depo içinde edge function şablonu eklenmelidir).
3. **SSR/prerender** — halka açık sayfaların arama motoru tarafından tam taranabilirliği için opsiyonel prerender önerilir (ör. `vite-ssg` veya host tarafında statik snapshot); bu sürümde başlık/meta per-route yönetiliyor.
4. **İletişim formu e-posta servisi** — web başvuruları yalnızca panolle tutulur; e-posta bildirim entegrasyonu ileri adımdır.

---

## 🚀 Yayına alma (GitHub + Netlify + Supabase) — kısa talimat

Ayrıntılı adım adım rehber: [`docs/SUPABASE-KURULUM.md`](docs/SUPABASE-KURULUM.md)

1. Migration'ları Supabase Dashboard'da sırayla uygula: **0001 → 0002 → 0003 → 0004 → 0005 → 0006** (her dosyanın tamamı tek seferde).
2. Authentication'da ilk kullanıcıyı yarat; SQL ile `profiles.role = 'admin'` yap.
3. Netlify'a GitHub deposunu bağla: build `npm run build`, publish `dist` (`netlify.toml` hazır), env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SITE_URL`.
4. Girilen üretim adresini `SITE_URL` olarak kullan; sitemap otomatik üretilir.

> **Supabase notu:** hiçbir yerde `service_role` anahtarı gerekmez; istemci yalnız publishable (anon) key + RLS kullanır.
