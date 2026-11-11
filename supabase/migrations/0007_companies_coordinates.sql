-- =========================================================
-- 0007 — FİRMA KONUM KOORDİNATLARI (additive)
--
-- Amaç: Firma adresinin haritada gösterilebilmesi ve ziyaretçi
-- "Yol Tarifi" bağlantısının metin tahmini yerine kayıtlı konuma
-- dayanması için `companies` tablosuna iki nullable kolon ekler.
--
-- KAPSAM (bilinçli olarak dar):
--   * Yalnızca latitude / longitude kolonları.
--   * Yalnızca -90..90 ve -180..180 aralık kısıtları.
--   * RLS, policy, grant ve mevcut veriler DEĞİŞMEZ.
--   * Mevcut satırlarda iki kolon da NULL kalır; toplu doldurma yok.
--
-- UYGULAMA: Supabase Dashboard → SQL Editor → bu dosyanın TAMAMINI
-- tek seferde yapıştırıp Run. Dosya idempotenttir; yeniden koşmak
-- güvenlidir.
-- =========================================================

begin;

alter table public.companies
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Aralık kısıtları: Postgres'te "add constraint if not exists" yok;
-- yeniden koşumda duplicate_object yutulur.
do $$ begin
  alter table public.companies
    add constraint companies_latitude_range
    check (latitude is null or (latitude >= -90 and latitude <= 90));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.companies
    add constraint companies_longitude_range
    check (longitude is null or (longitude >= -180 and longitude <= 180));
exception when duplicate_object then null; end $$;

comment on column public.companies.latitude is
  'Harita konumu enlemi (WGS84); NULL = konum kaydedilmemiş.';
comment on column public.companies.longitude is
  'Harita konumu boylamı (WGS84); NULL = konum kaydedilmemiş.';

commit;

-- Doğrulama (uygulandıktan sonra SQL Editor''de):
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'companies'
--      and column_name in ('latitude', 'longitude');
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.companies'::regclass
--      and conname like 'companies_%_range';
