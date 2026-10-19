-- =========================================================
-- FİRMA REHBERİ — 0005 ayarlar yazma politikası (ÖNERİ — uygulama onaya tabidir)
-- Kapsam: Admin Ayarlar sayfası (üyelik fiyatı / komisyon / referans ödülü
--         / yenileme komisyonu) canlıda güncellenebilir olsun.
--
-- BULGU: 0001 içinde `drop policy if exists "settings admin write"` satırı
--   vardır ama politikayı yeniden OLUŞTURAN satır yoktur. app_settings,
--   0001'deki generik admin politika döngüsünün (do bloğu) kapsamı da
--   dışındadır. Sonuç: RLS açık + yazma politikası YOK → kimse (admin dahil)
--   Ayarlar sayfasından değer güncelleyemez (PostgREST 403/42501).
--
-- ÖNKOŞUL: 0001_init.sql uygulanmış olmalı (current_app_role() tanımlı).
--
-- UYGULAMA (bilinçli elle): Supabase Dashboard → SQL Editor → tüm dosyayı
--   tek seferde koş. VEYA CLI: supabase db push (dosya migrations'a
--   konduğunda otomatik sırada koşar). Bu dosya otomatik uygulanmadı.
--
-- TASARIM KARARI (2026-10 son güvenlik incelemesinden):
--   * Yalnızca FOR UPDATE: satır okuma zaten "settings read" ile herkese açık;
--     yazan yalnız admin.
--   * İstemci kaydetme akışı PostgREST upsert (INSERT ... ON CONFLICT DO
--     UPDATE) kullanır; id=1 tohum satırı 0001'den HER ZAMAN mevcut olduğundan
--     çakışma dalı her zaman UPDATE'e düşer → INSERT politikası gerekmez.
--   * DELETE bilinçli olarak AÇILMADI: istemci yanlışlıkla settings satırını
--     silemez; satır giderse confirm_sale/confirm_renewal RPC'leri null
--     settings ile kırılabilir. Satır kaybolursa (beklenmedik durumlarda)
--     SQL ile elle geri ekleyin: insert into app_settings (id) values (1);
--
-- AMAÇ: Canlı veri SİLMEZ; yalnızca tek politikayı ekler. RLS kapatılmaz,
--   anonime yazma verilmez; rol kontrolü sunucuda (current_app_role) yapılır.
--
-- DOĞRULAMA (uygulama sonrası):
--   psql> select policy_name, cmd from pg_policies where tablename='app_settings';
--   -- beklenen: "settings read" (SELECT), "settings admin update" (UPDATE)
--   Arayüz kontrolü: Ayarlar sayfasından bir değeri değiştir → Kaydet →
--   kaydetme başarılı olmalı ve sync hatası görülmemeli.
--
-- ROLLBACK:
--   drop policy if exists "settings admin update" on public.app_settings;
-- =========================================================

begin;

create policy "settings admin update"
  on public.app_settings
  for update
  to authenticated
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

commit;
