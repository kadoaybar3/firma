-- Temsilci aday formlarında girilen iletişim ve sosyal hesap bilgileri.
-- Mevcut aday kayıtlarının değerleri boş kalır; veri kaybı veya backfill yoktur.
alter table public.leads
  add column if not exists email text,
  add column if not exists socials jsonb not null default '{}'::jsonb;

comment on column public.leads.email is 'Aday firmanın e-posta adresi';
comment on column public.leads.socials is 'Aday firmanın WhatsApp, Instagram ve Facebook bilgileri';
