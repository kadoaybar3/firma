-- =========================================================
-- FİRMA REHBERİ — 0004 web başvuru kaynağı
-- Kapsam: Tur 6 — halka açık "Firmanızı ekletin" formunun veri izi.
--
-- ÖNKOŞUL: 0001_init.sql uygulanmış olmalı (leads tablosu).
--
-- UYGULAMA:
--   supabase db push   veya   Dashboard SQL Editor'de TÜM dosya tek seferde.
--
-- AMAÇ: lead'lere kaynak işareti ekler ('sahada' | 'web').
--   Additive; mevcut kolonlara dokunmaz, '[sahada]' varsayılanıyla
--   tüm mevcut kayıtlar temsilci kaynaklı kalır.
--
-- NOT — canlıya geçişte ayrı GUVENLIK KARARI (net kapsam):
--   1) Web formunun anonim yazabilmesi için tabloya veya bir doğrulama
--      RPC'ye RLS INSERT politikası GEREKLİDİR (0001 leads policy'leri
--      temsilciye yazar; anonim katilan yok → canlıda form 403 alır).
--   2) Endpoint seviyesinde server-side doğrulama + rate limit + honeypot
--      tasarımı AYNI incelemede karara bağlanmalıdır; şema açmak tek başına
--      yeterli olmadığından bu migration bilinçli olarak anonime yazma
--      izni VERMEZ. Demo modda formlar repo katmanında denetimli çalışır.
--
-- DOĞRULAMA (uygulama sonrası):
--   psql> select column_name, data_type, column_default from information_schema.columns
--         where table_name = 'leads' and column_name = 'source';
--   -- beklenen: text, 'sahada'
--
-- ROLLBACK:
--   begin;
--   alter table leads drop column if exists source;
--   commit;
-- =========================================================

begin;

alter table leads
  add column if not exists source text not null default 'sahada'
  check (source in ('sahada', 'web'));

commit;
