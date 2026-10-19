# Supabase Kurulum & Yayına Alma Rehberi

> Firma Rehberi — canlı veritabanı kurulumu, ilk admin hesabı, GitHub/Netlify dağıtımı.
> Bu doküman uygulama kodundaki `src/lib/` katmanıyla (`dataSource.ts`, `auth.tsx`, `repo.ts`) ve
> `supabase/migrations/` klasöründeki migration'larla eşleşir.

---

## 1. Migration sırası (bağımlılıklar)

| # | Dosya | Amaç | Önkoşul |
|---|---|---|---|
| 1 | `0001_init.sql` | 14 tablo + FK'ler + RLS politikaları + RPC'ler (confirm_sale, confirm_renewal, log_audit) + tohum `app_settings id=1` | boş proje |
| 2 | `0002_security_hardening.sql` | EXECUTE izinleri daraltma (log_audit→service_role), H2 open-renewal unique endeks, H3 tutar çapraz doğrulama | 0001 |
| 3 | `0003_lead_conversion.sql` | `leads.converted_to_company_id` FK (aday→firma köprüsü) | 0001 |
| 4 | `0004_lead_source.sql` | `leads.source` ('sahada'/'web') | 0001 |
| 5 | `0005_settings_admin_write.sql` | Ayarlar sayfası için admin UPDATE politikası (0001'de eksikti) | 0001 |
| 6 | `0006_web_lead_rpc.sql` | `submit_web_lead` RPC (web formu) + IP-hash rate limit (10 dk/5) | 0001, 0004 |

**Nasıl uygulanır:** Supabase Dashboard → SQL Editor → her dosyanın İÇERİĞİNİN TAMAMINI tek seferde
yapıştır/kopyala → Run. Sırayla: 0001 sonra 0002 … (Hepsi `begin/commit` sarmalıdır; arada hata olursa
o dosya etkisiyle tamamen geri alınır ve yeniden koşturulabilir.)
Alternatif: CLI `supabase db push` (proje linkliyse).

**Uygulama sonrası doğrulama sorguları:**

```sql
-- tablolar ve tohum ayar
select count(*) from public.categories;                    -- 0 (boş, normal)
select id, membership_price from public.app_settings;      -- 1 | 1000

-- RLS ve politika sayısı
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r';  -- hepsi true

select tablename, policyname, cmd from pg_policies
where schemaname='public' order by tablename;              -- beklenen envanter (aşağıda §5)

-- 0002 sıkılaştırma
select has_function_privilege('anon','log_audit(text,text,jsonb)','EXECUTE');            -- false
select has_function_privilege('anon','current_app_role()','EXECUTE');                    -- true
select has_function_privilege('anonymous','confirm_sale(uuid)','EXECUTE');               -- false
      -- (has_function_privilege('anon',...) yazınca rol adı 'anon' kabul edilir)

-- 0006 web formu
select proname, prosecdef from pg_proc where proname = 'submit_web_lead';  -- true (definer)
```

---

## 2. İlk admin hesabı

1. **Authentication → Users → Add user → Create new user** — gerçek e-posta ve şifre girin
   (e-posta doğrulama kapalıysa otomatik aktif olur).
2. Profil satırı **ilk girişte kendiliğinden** `role='temsilci'` olarak doğar (RLS self-insert).
   Yönetici yükseltme — SQL Editor'de:

```sql
-- kullanıcı UUID'sini Authentication → Users listesinden alın
update public.profiles set role = 'admin' where id = '<KULLANICI-UUID>';
```

3. **Temsilci hesapları:** Admin panelindeki "Satış temsilcileri" ekranından rep kaydı ekleyin
   (kod AF-001, AF-002 … otomatik) → sonra kullanıcının profilini rep'e bağlayın:

```sql
update public.profiles set sales_rep_id = '<sales_reps-tablosundaki-uuid-veya-kodun-satiri>'
where id = '<KULLANICI-UUID>';
```

Rep UUID'sini görmek için: `select id, code, name from public.sales_reps order by created_at;`

> Kullanıcı, rep bağlanana kadar temsilci panelinde yalnızca boş listeler görür (bilinçli davranış:
> `repId'siz temsilci hiçbir adayı göremez`).

---

## 3. Ortam değişkenleri

 Lokal `.env` (değerler Git'e girmez) ve Netlify **aynı isimlerle**:

| Değişken | Açıklama |
|---|---|
| `VITE_SUPABASE_URL` | Supabase proje URL'si (Settings → API → Project URL) |
| `VITE_SUPABASE_ANON_KEY` | **publishable (anon/public)** key — Settings → API → anon/public |
| `SITE_URL` | Üretim adresi (ör. `https://firma-rehberi.netlify.app`) — sitemap + canonical |
| `VITE_PAYMENT_PROVIDER` *(opsiyonel)* | Ödeme sağlayıcı adı; ileri entegrasyon için |
| `VITE_PAYMENT_CHECKOUT_URL` *(opsiyonel)* | Checkout URL |

**ASLA ekleme/istemez: `service_role` key, DB şifresi.** İstemci kodu yalnız anon key + RLS kullanır;
sunucu tarafı güvenlik SECURITY DEFINER RPC'lerle sağlanır.

Lokal çalıştırma: `.env` doluyken uygulama canlı modda açılır. `.env` silinen ();

`cp .env.example .env` deyip değer girin.

---

## 4. GitHub & Netlify

1. **Remote hazır:** `origin → https://github.com/kadoaybar3/firma.git` (config'de bağlandı).
2. **Gizli dosya kontrolü:** `.gitignore` `.env` ve `.env.*` kapsar (`supabase/.temp/` de). Push
   öncesi kontrol: `git status` — `.env` listelerde/KÇSNA OLMAMALI.
3. **Netlify:**
   - Yeni site → "Import from existing project" → GitHub deposu seç.
   - `netlify.toml` hazır: build komutu `npm run build`, publish klasörü `dist`, SPA redirect `/* → /index.html 200`.
   - **Environment variables:** yukarıdaki tablodaki değerleri gir (Site settings → Environment variables).
   - `SITE_URL` girilene kadar sitemap üretilmez (uygulama çalışır; SEO sitemap ertelenir).
4. **Deploy edilirken migration'lar OTOMATİK GİTMEZ** — §1'deki SQL adımlarını Dashboard'da elle koş.

---

## 5. RLS politika envanteri (özet)

- **Anon (herkes):** yayınlanmış firmaları, kategorileri, şehirleri/ilçeleri OKUR. `sales_reps`
  okuyamaz (2026-10 daraltması: temsilci telefonu/oranı dışa sızmasın). Başka her şey kapalı.
- **Temsilci:** kendi profilini; reps arasından sadece KENDİ satırını; kendi aday/ziyaret/satış/
  ödeme/üyelik/komisyon/referans kayıtlarını OKUR; **yalnız kendi** aday/ziyaret/satış ekler.
  Satış DURUMUNU güncelleyemez (ödeme/komisyon doğrulaması admin akışına ait).
- **Admin:** tüm tabloları okur/yazar; kritik akışlar SECURITY DEFINER RPC'lerle:
  - `confirm_sale(uuid)` → satış kesinleşir + üyelik + tek seferlik komisyon (audit)
  - `confirm_renewal(uuid)` → üyelik yenileme + yenileme komisyonu (audit)
  - `verify_payment_manual(uuid)` → manuel ödeme onayı (tutar çapraz kontrolü, audit)
- **Anonim yazım:** YOK — tek istisna RPC `submit_web_lead(...)` (0006): doğrulama + honeypot +
  IP hash rate limit (10 dk / 5 istek) ile leads'e temsilcisiz 'web' adayı ekler; yalnız yeni id döner.
- **audit_log:** istemci hiçbir biçimde yazamaz (RPC zinciri dışında); okuma yalnız admin.

---

## 6. Sorun giderme

| Belirti | Neden | Çözüm |
|---|---|---|
| Açılışta "Veri bağlantısı kurulamadı" | migration'lar uygulanmamış (PGRST205 … table not found) | §1 adımlarını sırayla uygula |
| "Simülasyon hata kartı: Could not find table" | SQL Editor'de dosyanın yalnız bir bölümü koştu | dosyayı BAŞTAN tam koş (transaction rollback sayesinde güvenli) |
| Web formu "Çok fazla deneme yaptınız" | 0006 rate limit (10 dk / 5 istek, IP hash başına) | bekleyin; tabloda tek satır temizliği: `delete from web_lead_rate where ip_hash = md5('<ip>');` |
| Ayarlar kaydet "…permission denied" | 0005 uygulanmamış | 0005'i koş |
| Admin girişte boş panel | profiles.sales_rep_id bağlı değil / SQL yükseltme yapılmadı | §2 SQL'leri koş |
| sitemap üretilmiyor | `SITE_URL` tanımsız | Netlify env'e ekle; rebuild |
