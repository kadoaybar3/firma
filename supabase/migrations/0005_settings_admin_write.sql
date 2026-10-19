-- =========================================================
-- FİRMA REHBERİ — 0005 ayarlar yazma politikası (ÖNERİ — uygulama onaya tabidir)
-- Kapsam: Admin Ayarlar sayfası (üyelik fiyatı / komisyon / referans ödülü
--         / yenileme komisyonu) canlıda yazılabilir olsun.
--
-- BULGU: 0001 içinde "drop policy if exists "settings admin write"" satırı
--   vardır ama politikayı yeniden OLUŞTURAN satır yoktur. app_settings,
--   0001'deki generik admin politika döngüsünün (do bloğu) kapsamı da
--   dışındadır.
--   Sonuç: RLS açık + INSERT/UPDATE politikası YOK → kimse (admin dahil)
--   Ayarlar sayfasından değer güncelleyemez (PostgREST 403/42501).
--
-- ÖNKOŞUL: 0001_init.sql uygulanmış olmalı (current_app_role() tanımlı).
--
-- UYGULAMA (bilinçli elle): Supabase Dashboard → SQL Editor → tüm dosyayı
--   tek seferde koş. VEYA CLI: supabase db push (dosya migrations'a
--   konduğunda otomatik sırada koşar). Bu dosya otomatik uygulanmadı.
--
-- AMAÇ: Canlı veri SİLMEZ; yalnızca tek politikayı ekler. RLS kapatılmaz,
--   anonime yazma verilmez; rol kontrolü sunucuda (current_app_role) yapılır.
--
-- DOĞRULAMA (uygulama sonrası):
--   psql> select policy_name from pg_policies where tablename='app_settings';
--   -- beklenen: "settings admin write"
--   Arayüz kontrolü: Ayarlar sayfasından bir değeri değiştir → Kaydet →
--   kaydetme başarılı olmalı ve sync hatası görülmemeli.
--
-- ROLLBACK:
--   drop policy if exists "settings admin write" on public.app_settings;
-- =========================================================

create policy "settings admin write"
  on public.app_settings
  for all
  to authenticated
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');
