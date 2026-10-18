-- =========================================================
-- FİRMA REHBERİ — 0003 aday→firma dönüşüm işaretçisi
-- Kapsam: Tur 2 köprüsü — admin, anlaşılan adayı elle yeniden yazmadan
--   firmaya dönüştürür; lead → company bağı kalıcı işaretlenir.
--
-- ÖNKOŞUL: 0001_init.sql uygulanmış olmalı (leads ve companies tabloları).
--
-- UYGULAMA:
--   supabase db push          CLI ile (önerilen — migration history tutulur)
--   veya Supabase Dashboard SQL Editor'de TÜM dosyayı tek seferde koş.
--
-- AMAÇ: Veri ekleme (additive) migration'ıdır; canlı veri SİLMEZ,
--   mevcut kolonları değiştirmez, LeadStatus enum değerlerine dokunmaz
--   (0001'deki status check kısıtı aynen korunur).
--   FK "on delete set null": dönüşüm kaynaklı firma silinirse adayın
--   işaretçisi asılmaz; aday temiz liste iyi yeniden dönüştürülebilir.
--
-- DOĞRULAMA (uygulama sonrası):
--   psql> select column_name, data_type from information_schema.columns
--         where table_name = 'leads' and column_name = 'converted_to_company_id';
--   -- beklenen: uuid satırı
--
-- ROLLBACK:
--   begin;
--   alter table leads drop column if exists converted_to_company_id;
--   commit;
-- =========================================================

begin;

alter table leads
  add column if not exists converted_to_company_id uuid references companies(id) on delete set null;

commit;
