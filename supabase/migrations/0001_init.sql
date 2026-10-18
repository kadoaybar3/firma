-- =========================================================
-- FİRMA REHBERİ — Supabase şema + güvenlik politikaları
-- Sürüm: 0001 (başlangıç)
--
-- UYGULAMA:
--   supabase db push   ya da   SQL editöründe bu dosyayı çalıştırın.
--
-- TASARIM İLKELERİ:
--   * Halka açık site: sadece "yayında" firmaları anonim okur.
--   * Yönetim (role=admin): tüm tabloları yönetir; kritik yazma işlemleri
--     SECURITY DEFINER fonksiyonlarla tetiklenir, RLS yazma yetkisi kısıtlıdır.
--   * Temsilci (role=temsilci): yalnız kendi aday/ziyaret/satış/komisyon kayıtları.
--   * Komisyon üretimi mükerrere kapalı (UNIQUE endeks + fonksiyon).
--   * Kart verisi hiçbir tabloda TUTULMAZ; ödemelerde yalnız sağlayıcı referansı.
--   * Komisyon oranları/tutarlar `app_settings` tablosunda; source koda sabit değildir.
-- =========================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- ROLLER ----------
do $$ begin
  create type app_role as enum ('admin', 'temsilci');
exception when duplicate_object then null; end $$;

-- NOT (2026-10 güvenlik incelemesi): fonksiyon adı "current_role" yerine
-- "current_app_role" kullanılır. PostgreSQL'de CURRENT_ROLE katı RESERVED
-- keyword'dür; o adla fonksiyon tanımlanamaz ve policy'lerde builtin
-- keyword'e çözülme riski vardır. Ayrıntı: 0002 notları.

-- Kullanıcı profilleri: auth.users'a 1-1; rol buradan okunur
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role app_role not null default 'temsilci',
  sales_rep_id uuid,
  created_at timestamptz not null default now()
);

create or replace function current_app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select p.role from profiles p where p.id = auth.uid()
$$;

create or replace function current_sales_rep_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.sales_rep_id from profiles p where p.id = auth.uid()
$$;

-- ---------- YÖNETİLMESİNE AYAR OLACAK DEĞERLER ----------
create table if not exists app_settings (
  id int primary key default 1 check (id = 1),
  membership_price numeric not null default 1000,
  rep_commission numeric not null default 600,
  referral_reward numeric not null default 100,
  renewal_commission numeric not null default 600,
  updated_at timestamptz not null default now()
);
insert into app_settings (id) values (1) on conflict do nothing;

-- ---------- TEMEL VARLIKLAR ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text not null default '🏢'
);

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique
);

create table if not exists city_districts (
  city_id uuid not null references cities(id) on delete cascade,
  district text not null,
  primary key (city_id, district)
);

create table if not exists sales_reps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  code text not null unique,
  status text not null default 'aktif' check (status in ('aktif','pasif')),
  custom_commission_rate numeric, -- yüzde; null ise genel tutar uygulanır
  created_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category_id uuid references categories(id),
  city_id uuid references cities(id),
  district text not null default '',
  address text not null default '',
  phone text not null,
  email text,
  website text,
  socials jsonb not null default '{}'::jsonb,
  description text not null default '',
  images jsonb not null default '[]'::jsonb,
  hours jsonb not null default '{}'::jsonb,
  featured boolean not null default false,
  published boolean not null default false,
  sales_rep_id uuid references sales_reps(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adaylar ve ziyaret günlükleri (satış kuyruğu)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  sales_rep_id uuid not null references sales_reps(id),
  company_name text not null,
  category_id uuid references categories(id),
  city_id uuid references cities(id),
  district text,
  phone text,
  note text not null default '',
  status text not null default 'yeni' check (status in ('yeni','irtibat','görüşme','anlaşma','iptal')),
  visit_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_visits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  sales_rep_id uuid not null references sales_reps(id),
  visit_date timestamptz not null default now(),
  note text not null default '',
  outcome text not null default ''
);

-- Satış
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  sales_rep_id uuid references sales_reps(id),
  company_id uuid not null references companies(id),
  channel text not null check (channel in ('temsilci','dogrudan')),
  referral_code text,
  amount numeric not null,
  status text not null default 'potansiyel' check (status in ('potansiyel','odendi','iptal')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  renewal_for_membership_id uuid
);

-- Ödemeler — KART VERİSİ YOKtur
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  amount numeric not null,
  provider text not null default 'hicbiri',
  provider_ref text not null unique,        -- webhook idempotency anahtarı
  status text not null default 'beklemede' check (status in ('beklemede','onaylandi','hata','iade')),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Üyelikler
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  sale_id uuid not null references sales(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'aktif' check (status in ('aktif','suresi_bitti','iptal')),
  unique (sale_id)
);

-- Komisyonlar — mükerrere KAPALI
create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id),
  sales_rep_id uuid not null references sales_reps(id),
  type text not null check (type in ('satis','yenileme','referans')),
  amount numeric not null,
  status text not null default 'beklemede' check (status in ('beklemede','onaylandi','odendi')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
-- KURAL: aynı satıştan tek komisyon
create unique index if not exists commissions_sale_unique on commissions (sale_id);

-- Doğrudan referans kodları
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  sales_rep_id uuid not null references sales_reps(id),
  used_at timestamptz,
  sale_id uuid references sales(id),
  created_at timestamptz not null default now()
);

-- Denetim kaydı
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  actor_role text,
  action text not null,
  summary text not null,
  detail jsonb
);

-- ---------- GÜVENLİK: RLS ----------
alter table companies enable row level security;
alter table categories enable row level security;
alter table cities enable row level security;
alter table city_districts enable row level security;
alter table sales_reps enable row level security;
alter table leads enable row level security;
alter table lead_visits enable row level security;
alter table sales enable row level security;
alter table payments enable row level security;
alter table memberships enable row level security;
alter table commissions enable row level security;
alter table referrals enable row level security;
alter table audit_log enable row level security;
alter table app_settings enable row level security;
-- K2 (güvenlik incelemesi 2026-10): profiles RLS'siz bırakılırsa herkes her
-- profili okuyup yazabilir; bir kullanıcı kendi role sütununu 'admin'e
-- çekince definer fonksiyon guard'ları (current_app_role) bypass edilir.
alter table profiles enable row level security;

-- Halka açık okuma
create policy "anon company read (published)" on companies
  for select using (published = true);

create policy "anon category read" on categories for select using (true);
create policy "anon city read" on cities for select using (true);
create policy "anon district read" on city_districts for select using (true);
create policy "rep basic read" on sales_reps for select using (true);

-- profiles (K2): kullanıcı yalnız kendi profilini okur; admin hepsini okur ve yazar.
-- Yeni kullanıcı kendi profilini yalnız temsilci rolü ve rep eşlemesi olmadan
-- oluşturabilir (self-escalation kapanır). Satırların asıl yazıcıları
-- admin akışlarıdır (service_role RLS'i doğal bypass eder).
create policy "profiles self read" on profiles
  for select using (id = auth.uid() or current_app_role() = 'admin');
create policy "profiles admin write" on profiles
  for update using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');
create policy "profiles self insert" on profiles
  for insert with check (id = auth.uid() and role = 'temsilci' and sales_rep_id is null);

-- Yönetici tam yetki (tablo tablo)
do $$
declare t text;
begin
  foreach t in array array['companies','categories','cities','city_districts','sales_reps','leads','lead_visits','sales','payments','memberships','commissions','referrals'] loop
    execute format('create policy "admin full %1$s" on %1$s for all using (current_app_role() = ''admin'') with check (current_app_role() = ''admin'');', t);
  end loop;
end $$;

-- Temsilci: yalnız KENDİ kayıtları (oku + kendi ekle)
create policy "rep own leads" on leads for select
  using (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());
create policy "rep insert own lead" on leads for insert
  with check (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());
create policy "rep update own lead" on leads for update
  using (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id())
  with check (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());

create policy "rep own visits" on lead_visits for all
  using (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id())
  with check (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());

create policy "rep own sales read" on sales for select
  using (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());
create policy "rep insert own sale" on sales for insert
  with check (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());
-- NOT: temsilci satış DURUMUNU update EDEMEZ (ödeme/komisyon doğrulaması admin'e aittir)

create policy "rep own payments read" on payments for select
  using (current_app_role() = 'temsilci' and exists (
    select 1 from sales s where s.id = payments.sale_id and s.sales_rep_id = current_sales_rep_id()));

create policy "rep own memberships read" on memberships for select
  using (current_app_role() = 'temsilci' and exists (
    select 1 from sales s where s.id = memberships.sale_id and s.sales_rep_id = current_sales_rep_id()));

create policy "rep own commissions read" on commissions for select
  using (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());
-- temsilci komisyon tutarını/durumunu update edemez

create policy "rep own referrals" on referrals for select
  using (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());

-- Ayarlar: herkes okur, sadece admin yazar
create policy "settings read" on app_settings for select using (true);
drop policy if exists "settings admin write" on app_settings;

-- Denetim kaydı: okuma admin; yazma yalnız SECURITY DEFINER fonksiyonlar üzerinden
create policy "audit admin read" on audit_log for select using (current_app_role() = 'admin');

-- ---------- KRİTİK İŞLEMLER (SECURITY DEFINER) ----------

-- Satışı kesinleştir + üyelik + tek seferlik komisyon.
create or replace function confirm_sale(p_sale_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s sales;
  m memberships;
  st app_settings;
  rep sales_reps;
  ref referrals;
  new_commission_id uuid;
begin
  if current_app_role() <> 'admin' then
    raise exception 'yetkisiz';
  end if;

  select * into s from sales where id = p_sale_id;
  if not found then raise exception 'satış yok'; end if;
  if s.status <> 'potansiyel' then raise exception 'satış kesinleşemez/iyilemiş'; end if;
  if not exists (select 1 from payments where sale_id = s.id and status = 'onaylandi') then
    raise exception 'ödeme doğrulanmadı';
  end if;
  if exists (select 1 from commissions where sale_id = s.id) then
    raise exception 'komisyon zaten var';
  end if;

  select * into st from app_settings where id = 1;
  select * into rep from sales_reps where id = s.sales_rep_id;

  insert into memberships (company_id, sale_id, starts_at, ends_at, status)
  values (s.company_id, s.id, now(), now() + interval '1 year', 'aktif')
  returning * into m;

  update sales set status = 'odendi', confirmed_at = now() where id = s.id;

  new_commission_id := null;
  if s.channel = 'temsilci' and s.sales_rep_id is not null then
    insert into commissions (sale_id, sales_rep_id, type, amount, status)
    values (
      s.id, s.sales_rep_id, 'satis',
      coalesce(
        case when rep.custom_commission_rate is not null
          then round(s.amount * rep.custom_commission_rate / 100)
        end, st.rep_commission),
      'beklemede'
    ) returning id into new_commission_id;
  elsif s.channel = 'dogrudan' and s.referral_code is not null then
    select * into ref from referrals where code = s.referral_code and used_at is null for update;
    if found then
      update referrals set used_at = now(), sale_id = s.id where id = ref.id;
      insert into commissions (sale_id, sales_rep_id, type, amount, status)
      values (s.id, ref.sales_rep_id, 'referans', st.referral_reward, 'beklemede')
      returning id into new_commission_id;
    end if;
  end if;

  perform log_audit('satis_kesinlesti', 'Satış kesinleşti', jsonb_build_object('sale_id', s.id));
  return new_commission_id;
end $$;

-- Üyelik yenileme: komisyon ilk satışı kazanan temsilciye bağlanır
create or replace function confirm_renewal(p_sale_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s sales;
  m memberships;
  st app_settings;
  orig_rep uuid;
begin
  if current_app_role() <> 'admin' then raise exception 'yetkisiz'; end if;

  select * into s from sales where id = p_sale_id;
  if not found then raise exception 'satış yok'; end if;
  if s.renewal_for_membership_id is null then raise exception 'yenileme satışı değil'; end if;
  if s.status <> 'potansiyel' then raise exception 'yenileme kesinleşmiş'; end if;
  if not exists (select 1 from payments where sale_id = s.id and status = 'onaylandi') then
    raise exception 'ödeme doğrulanmadı';
  end if;

  select * into m from memberships where id = s.renewal_for_membership_id for update;
  select * into st from app_settings where id = 1;

  -- İlk satışın komisyonundaki temsilci
  select sales_rep_id into orig_rep from commissions
  where sale_id = m.sale_id limit 1;
  if orig_rep is null then
    select sales_rep_id into orig_rep from sales where id = m.sale_id;
  end if;

  update sales set status = 'odendi', confirmed_at = now() where id = s.id;
  update memberships set ends_at = ends_at + interval '1 year', status = 'aktif' where id = m.id;

  if orig_rep is not null and not exists (select 1 from commissions where sale_id = s.id) then
    insert into commissions (sale_id, sales_rep_id, type, amount, status)
    values (s.id, orig_rep, 'yenileme', st.renewal_commission, 'beklemede');
  end if;

  perform log_audit('uyelik_yenilendi', 'Üyelik yenilendi', jsonb_build_object('sale_id', s.id));
end $$;

-- Denetim kaydı yardımcı fonksiyonu
create or replace function log_audit(p_action text, p_summary text, p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, actor_role, action, summary, detail)
  values (auth.uid(), current_app_role()::text, p_action, p_summary, p_detail);
end $$;

-- Manuel ödeme doğrulama (sağlayıcı entegrasyonu yokken). Webhook'a geçişte bu fonksiyon kapanır.
create or replace function verify_payment_manual(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if current_app_role() <> 'admin' then raise exception 'yetkisiz'; end if;
  update payments set status = 'onaylandi', updated_at = now()
  where id = p_payment_id and status = 'beklemede';
  perform log_audit('odeme_dogrulandi', 'Ödeme manuel doğrulandı', jsonb_build_object('payment_id', p_payment_id));
end $$;

-- ---------- İNDEKSLER ----------
create index if not exists companies_published_idx on companies (published);
create index if not exists companies_category_idx on companies (category_id);
create index if not exists leads_rep_idx on leads (sales_rep_id);
create index if not exists sales_rep_idx on sales (sales_rep_id);
create index if not exists commissions_rep_idx on commissions (sales_rep_id);
