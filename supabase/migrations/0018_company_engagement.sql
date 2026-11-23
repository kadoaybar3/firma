-- =========================================================
-- FİRMA REHBERİ — 0018 firma etkileşim sayaçları + iki kademeli bildirim
--
-- AMAÇ: Her firma için profil görüntülenmesi, telefon / WhatsApp / yol tarifi
--   / Instagram / web sitesi tıklamaları ayrı ayrı sayılır. Panelden yönetilen
--   iki KADEMELİ eşik bildirimi bu sayımlardan üretilir:
--     1. kademe — sabit aralık (her N etkileşimde bir: 100, 200, 300…)
--     2. kademe — katlanan eşik (500 → 1.000 → 2.000 → 4.000…)
--   İki kademe aynı sayımda tetiklenirse TEK bildirim yazılır (tier = 2).
--
-- TASARIM KARARLARI
--   * Sayaç tek satırdır: (company_id, kind) PK. Artış `insert … on conflict
--     do update set count = count + 1` ile ATOMİKTİR; eşzamanlı iki ziyaret
--     birbirinin sayımını ezemez (satır kilidi sunucuda).
--   * Bildirim mükerrerliği şema ile engellenir: (company_id, kind, count)
--     UNIQUE — aynı sayaç değeri için ikinci satır yazılamaz.
--   * YAZMA YALNIZ RPC'DE: istemcinin tablolara INSERT/UPDATE/DELETE yetkisi
--     YOKTUR; yönetici yalnız SELECT eder. Sahte sayaç üretilemez.
--   * `published = false` firmalarda sayım yapılmaz (RPC erken döner).
--   * Eşikler `app_settings` kolonlarındadır; kod değişikliği gerekmez.
--     `engagement_kind_overrides` (jsonb) ileride TÜR BAZLI ayar için hazırdır:
--     {"telefon": {"tier1Interval": 50}, "web": {"enabled": false}}.
--
-- ÖNKOŞUL: 0001 (companies/app_settings/current_app_role), 0005
--   (app_settings admin update politikası), 0002 (log_audit kısıtı).
--
-- UYGULAMA: Supabase Dashboard → SQL Editor → dosyanın tamamını tek seferde
--   koşun (begin/commit). CLI kullanılıyorsa `supabase db push`.
--
-- DOĞRULAMA (salt okunur):
--   select column_name from information_schema.columns
--     where table_name = 'app_settings' and column_name like 'engagement%';
--   select has_function_privilege('anon',
--     'public.track_company_engagement(uuid, text)', 'EXECUTE');         -- true
--   select has_table_privilege('anon',
--     'public.company_engagement_counters', 'INSERT');                  -- false
--   select tgname from pg_trigger where tgrelid = 'public.companies'::regclass; -- değişmez
--
-- GERİ ALMA:
--   drop function if exists public.track_company_engagement(uuid, text);
--   drop table if exists public.company_engagement_notifications;
--   drop table if exists public.company_engagement_counters;
--   alter table public.app_settings
--     drop column if exists engagement_enabled,
--     drop column if exists engagement_tier1_enabled,
--     drop column if exists engagement_tier1_interval,
--     drop column if exists engagement_tier2_enabled,
--     drop column if exists engagement_tier2_start,
--     drop column if exists engagement_kind_overrides;
-- =========================================================

begin;

-- ---------- AYARLAR (tek satır; varsayılanlar panelden değiştirilebilir) ----------
alter table public.app_settings
  add column if not exists engagement_enabled boolean not null default true,
  add column if not exists engagement_tier1_enabled boolean not null default true,
  add column if not exists engagement_tier1_interval integer not null default 100
    check (engagement_tier1_interval >= 1),
  add column if not exists engagement_tier2_enabled boolean not null default true,
  add column if not exists engagement_tier2_start integer not null default 500
    check (engagement_tier2_start >= 1),
  add column if not exists engagement_kind_overrides jsonb not null default '{}'::jsonb;

-- ---------- SAYAÇLAR ----------
create table if not exists public.company_engagement_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('profil', 'telefon', 'whatsapp', 'yol', 'instagram', 'web')),
  count bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (company_id, kind)
);

-- ---------- BİLDİRİMLER ----------
create table if not exists public.company_engagement_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('profil', 'telefon', 'whatsapp', 'yol', 'instagram', 'web')),
  -- Bildirimin bağlı olduğu eşik = tetiklendiği andaki sayaç değeri
  count bigint not null check (count >= 1),
  threshold bigint not null check (threshold >= 1),
  tier smallint not null check (tier in (1, 2)),
  -- 2. kademe bildirimi aynı sayımda 1. kademeyi de karşıladıysa true
  tier1_also boolean not null default false,
  created_at timestamptz not null default now(),
  -- MÜKERRER BİLDİRİM YOK: aynı firma + tür + sayaç değeri tek satırdır.
  unique (company_id, kind, count)
);

create index if not exists company_engagement_notifications_recent_idx
  on public.company_engagement_notifications (created_at desc);

-- ---------- RLS ----------
alter table public.company_engagement_counters enable row level security;
alter table public.company_engagement_notifications enable row level security;

drop policy if exists "admin read engagement counters" on public.company_engagement_counters;
create policy "admin read engagement counters"
  on public.company_engagement_counters
  for select
  to authenticated
  using (current_app_role() = 'admin');

drop policy if exists "admin read engagement notifications" on public.company_engagement_notifications;
create policy "admin read engagement notifications"
  on public.company_engagement_notifications
  for select
  to authenticated
  using (current_app_role() = 'admin');

-- Ziyaretçi/panel yazamaz: sayaç yalnız RPC ile artar.
revoke all on public.company_engagement_counters from anon, public;
revoke all on public.company_engagement_notifications from anon, public;
revoke insert, update, delete on public.company_engagement_counters from authenticated;
revoke insert, update, delete on public.company_engagement_notifications from authenticated;
grant select on public.company_engagement_counters to authenticated;
grant select on public.company_engagement_notifications to authenticated;

-- ---------- SAYIM + EŞİK RPC'si ----------
create or replace function public.track_company_engagement(p_company_id uuid, p_kind text)
returns table (count bigint, tier smallint, threshold bigint, tier1_also boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
  v_enabled boolean;
  v_t1 boolean;
  v_t1_interval integer;
  v_t2 boolean;
  v_t2_start integer;
  v_overrides jsonb;
  v_t1_hit boolean := false;
  v_t2_hit boolean := false;
  v_tier smallint := null;
  v_ratio bigint;
begin
  if p_kind not in ('profil', 'telefon', 'whatsapp', 'yol', 'instagram', 'web') then
    raise exception 'Geçersiz etkileşim türü: %', p_kind;
  end if;

  -- Yalnız yayındaki firmalarda sayım yapılır; taslak/olmayan firma sayılmaz.
  if not exists (
    select 1 from public.companies c where c.id = p_company_id and c.published
  ) then
    return;
  end if;

  insert into public.company_engagement_counters (company_id, kind, count)
  values (p_company_id, p_kind, 1)
  on conflict (company_id, kind) do update
    set count = public.company_engagement_counters.count + 1,
        updated_at = now()
  returning public.company_engagement_counters.count into v_count;

  select
    s.engagement_enabled,
    s.engagement_tier1_enabled,
    s.engagement_tier1_interval,
    s.engagement_tier2_enabled,
    s.engagement_tier2_start,
    s.engagement_kind_overrides
    into v_enabled, v_t1, v_t1_interval, v_t2, v_t2_start, v_overrides
    from public.app_settings s
   where s.id = 1;

  -- Tür bazlı geçersiz kılma (ileriye dönük): yalnız verilen alanlar ezilir.
  if v_overrides is not null and v_overrides ? p_kind then
    v_enabled := coalesce((v_overrides -> p_kind ->> 'enabled')::boolean, v_enabled);
    v_t1 := coalesce((v_overrides -> p_kind ->> 'tier1Enabled')::boolean, v_t1);
    v_t1_interval := coalesce((v_overrides -> p_kind ->> 'tier1Interval')::integer, v_t1_interval);
    v_t2 := coalesce((v_overrides -> p_kind ->> 'tier2Enabled')::boolean, v_t2);
    v_t2_start := coalesce((v_overrides -> p_kind ->> 'tier2Start')::integer, v_t2_start);
  end if;

  if coalesce(v_enabled, true) then
    v_t1_hit := coalesce(v_t1, true)
      and coalesce(v_t1_interval, 0) >= 1
      and v_count % coalesce(v_t1_interval, 1) = 0;

    if coalesce(v_t2, true) and coalesce(v_t2_start, 0) >= 1
       and v_count >= v_t2_start and v_count % v_t2_start = 0 then
      v_ratio := v_count / v_t2_start;
      -- İki katlanma: oran tam olarak 2'nin kuvveti mi? (1, 2, 4, 8…)
      v_t2_hit := v_ratio > 0 and (v_ratio & (v_ratio - 1)) = 0;
    end if;

    if v_t2_hit then
      v_tier := 2;
    elsif v_t1_hit then
      v_tier := 1;
    end if;
  end if;

  -- Aynı sayım için tek bildirim: unique kısıt + do nothing (idempotent).
  if v_tier is not null then
    insert into public.company_engagement_notifications
      (company_id, kind, count, threshold, tier, tier1_also)
    values
      (p_company_id, p_kind, v_count, v_count, v_tier, (v_tier = 2 and v_t1_hit))
    on conflict (company_id, kind, count) do nothing;
  end if;

  return query
    select v_count,
           v_tier,
           case when v_tier is null then null::bigint else v_count end,
           (v_tier = 2 and v_t1_hit);
end $$;

revoke all on function public.track_company_engagement(uuid, text) from public;
grant execute on function public.track_company_engagement(uuid, text)
  to anon, authenticated, service_role;

commit;
