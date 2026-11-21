-- =========================================================
-- FİRMA REHBERİ — 0015 ekip bulma ve ekibe katılma başvurusu
-- Kapsam: YALNIZ ekip katılım akışı (yeni tablo + görünürlük + 3 RPC +
--   ekip özeti görünümü). Mevcut satış, temsilci komisyonu, ekip liderliği
--   komisyonu (0014), ödeme ve yenileme sistemlerine DOKUNULMAZ.
--   0011–0014 dosyaları DEĞİŞTİRİLMEZ (yalnız 0011'in bir RLS policy'si
--   bu dosyada genişletilir — bkz. bölüm 3).
--
-- İŞ MODELİ:
--   * Her personel kendi ekibini kurabilir (0011 create_team — korunur).
--   * Kapasite lider dahil maksimum `app_settings.team_capacity` (15).
--   * Ekipler tüm oturum sahiplerince görüntülenebilir (bkz. bölüm 3).
--   * Bir personel aynı anda yalnız bir ekibe bağlıdır (sales_reps.team_id
--     tek kolon); ekipteyken başka ekibe başvuru YAPILAMAZ.
--   * Kapasite doluysa başvuru yapılamaz VE onaylanamaz (çift katman:
--     başvuru anında + onay anında yeniden kontrol; ayrıca 0011 kapasite
--     trigger'ı sales_reps.team_id UPDATE'inde tekrar koşar).
--   * Onaysız başvuru üyelik YARATMAZ; yönetici onayı olmadan ekip
--     bağlantısı kurulmaz (yazım yalnız RPC; istemcinin tabloya INSERT /
--     UPDATE yetkisi YOKTUR).
--   * Durumlar: 'beklemede' (arayüzde "Bekliyor"), 'onaylandi',
--     'reddedildi'. Kayıt silinmez (denetim geçmişi).
--
-- GÜVENLİK (üç katman):
--   1. İstemci: başvuru/onay/red düğmeleri rol göre görünür (arayüz only).
--   2. RLS: tabloda yalnız SELECT — admin tümünü, personel yalnız KENDİ
--      başvurusunu okur; anon/authenticated'in INSERT/UPDATE/DELETE hakkı
--      revoke ile sıfırlıdır (yazım tamamen RPC'ye kapalı).
--   3. RPC'ler SECURITY DEFINER + guard: submit → yalnız 'temsilci'
--      (current_sales_rep_id()), approve/reject → yalnız 'admin'
--      (service_role'de auth.uid() null → current_app_role() null →
--      guard PASS deseni 0013 ile aynı; anon EXECUTE revoke'ludur).
--
-- ÖNKOŞUL: 0001 (sales_reps/profiles/audit_log), 0002, 0011 (teams +
--   kapasite trigger'ı) uygulanmış olmalı.
--   Sıra: 0001→…→0011→0012→0013→0014→0015.
--
-- UYGULAMA (bilinçli elle — 0011–0014 ile birlikte, kod deploy'undan ÖNCE):
--   Supabase Dashboard → SQL Editor → bu dosyayı tek seferde çalıştır.
--   VEYA CLI: supabase db push.
--
-- UYGULAMA SONRASI DOĞRULAMA:
--   psql> select policyname, cmd from pg_policies
--         where tablename = 'team_join_applications';
--   -- beklenen: yalnız 2 satır, ikisi de select (admin + kendi başvurusu)
--   psql> select proname, prosecdef from pg_proc
--         where proname in ('submit_team_join_application',
--                           'approve_team_join_application',
--                           'reject_team_join_application');            -- true ×3
--   psql> select has_function_privilege('anon',
--         'submit_team_join_application(uuid)', 'EXECUTE');             -- false
--   psql> select policyname from pg_policies where tablename = 'teams';
--   -- beklenen: "admin full teams" (all) + "authenticated read teams" (select)
--   psql> select has_table_privilege('anon', 'public.teams_overview', 'SELECT'); -- false
--   psql> select count(*) from pg_indexes
--         where indexname = 'team_join_applications_pending_rep_uk';    -- 1
--
-- ROLLBACK (veri kaybı: yalnız başvuru satırları):
--   begin;
--   drop function if exists submit_team_join_application(uuid);
--   drop function if exists approve_team_join_application(uuid);
--   drop function if exists reject_team_join_application(uuid);
--   drop view if exists public.teams_overview;
--   drop policy if exists "authenticated read teams" on public.teams;
--   -- 0011'deki orijinal politika yeniden oluşturulur:
--   -- create policy "rep read own team" on public.teams for select
--   --   using (current_app_role() = 'temsilci' and id = current_team_id());
--   drop policy if exists "rep read own team join applications"
--     on public.team_join_applications;
--   drop policy if exists "admin read team join applications"
--     on public.team_join_applications;
--   drop table if exists public.team_join_applications;
--   commit;
--   (sales_reps.team_id, teams, kapasite trigger'ı bu rollback'e DAHİL
--    DEĞİLDİR — mevcut ekip memberships'ları değişmez.)
-- =========================================================

begin;

-- ---------- 1) Ekip katılım başvurusu ----------
create table if not exists public.team_join_applications (
  id uuid primary key default gen_random_uuid(),
  -- Başvuru sahibi personel (silinmez; yalnız pasife çekilir → restrict).
  rep_id uuid not null references public.sales_reps(id) on delete restrict,
  -- Katılınmak istenen ekip (onay anında varlığı yeniden doğrulanır).
  team_id uuid not null references public.teams(id) on delete restrict,
  status text not null default 'beklemede'
    check (status in ('beklemede', 'onaylandi', 'reddedildi')),
  created_at timestamptz not null default now(),
  -- Onay/red kararı (yalnız RPC yazar): kim, ne zaman.
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);

-- ---------- 2) Tekrar başvuru: kişi başına TEK beklemede satır ----------
-- Reddedilen/onaylanan başvurudan sonra yeniden başvurulabilir; yarış
-- durumunda partial unique index ikinci INSERT'i de kapatır (RPC'deki
-- SELECT kontrolü anlaşılır mesaj verir).
create unique index if not exists team_join_applications_pending_rep_uk
  on public.team_join_applications (rep_id)
  where status = 'beklemede';

-- ---------- 3) RLS: yalnız SELECT; yazım tamamen RPC'ye kapalı ----------
alter table public.team_join_applications enable row level security;

-- Yönetici: tüm başvuruları okur (onay/red yalnız RPC).
drop policy if exists "admin read team join applications" on public.team_join_applications;
create policy "admin read team join applications" on public.team_join_applications
  for select to authenticated
  using (current_app_role() = 'admin');

-- Personel: yalnız KENDİ başvurusunu okur (durum ekranı için).
drop policy if exists "rep read own team join applications" on public.team_join_applications;
create policy "rep read own team join applications" on public.team_join_applications
  for select to authenticated
  using (current_app_role() = 'temsilci' and rep_id = current_sales_rep_id());

-- INSERT/UPDATE/DELETE policy'si YOKTUR + yetkiler revoke edilir:
-- "onaysız başvuru üyelik yaratmaz" ve "yönetici onayı olmadan ekip
-- bağlantısı kurulmaz" burada DB seviyesinde garantilenir.
revoke insert, update, delete on public.team_join_applications from anon, authenticated;

-- ---------- 4) Ekipler herkes tarafından görüntülenebilir ----------
-- 0011'de temsilci yalnız kendi ekibini okuyordu ("rep read own team");
-- bu aşamada iş kuralı "ekipler herkes tarafından görüntülenebilir"
-- olduğundan politika tüm oturum sahiplerine genişletilir. YAZMA
-- politikaları DEĞİŞMEZ: "admin full teams" (ALL) dışında teams'a yazan
-- yok; personelin ekip kurma yetkisi 0011 create_team RPC'sidir.
drop policy if exists "rep read own team" on public.teams;
drop policy if exists "authenticated read teams" on public.teams;
create policy "authenticated read teams" on public.teams for select
  to authenticated using (true);

-- ---------- 5) Ekip özeti görünümü (lider adı + üye sayısı + kapasite) ----------
-- Temsilci, diğer ekiplerin üyelerinin satırlarını RLS gereği okuyamaz
-- (sales_reps phone taşır → açılmaz); lider adı ve üye SAYISI bu
-- SECURITY DEFINER nitelikli görünümde hesaplanır ve yalnız authenticated
-- okuyabilir. Yalnız 6 kolon görünür; satır düzeyinde yazım yoktur.
create or replace view public.teams_overview as
select
  t.id as team_id,
  t.name as team_name,
  t.leader_rep_id,
  lr.name as leader_name,
  (select count(*) from public.sales_reps m where m.team_id = t.id)::int as member_count,
  coalesce((select team_capacity from public.app_settings where id = 1), 15)::int as capacity
from public.teams t
join public.sales_reps lr on lr.id = t.leader_rep_id;

-- Supabase default privilege'leri yeni view'a da tümünü verir; anon tamamen
-- kapatılır, authenticated yalnız okur (yazım capability'si sıfırlanır).
revoke all on public.teams_overview from anon, public;
revoke insert, update, delete on public.teams_overview from authenticated;
grant select on public.teams_overview to authenticated;

-- ---------- 6) Başvuru gönderme (yalnız personel) ----------
create or replace function submit_team_join_application(p_team_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid;
  v_cap int;
  v_count int;
  v_id uuid;
begin
  if current_app_role() <> 'temsilci' then
    raise exception 'yetkisiz';
  end if;
  v_rep := current_sales_rep_id();
  if v_rep is null then
    raise exception 'ekip başvurusu oluşturulamadı: temsilci kaydı bulunamadı';
  end if;

  -- Tek ekip üyeliği: zaten ekipteyken başka ekibe başvuru yapılamaz.
  if exists (select 1 from sales_reps where id = v_rep and team_id is not null) then
    raise exception 'zaten bir ekipte olduğunuz için başka bir ekibe başvuru yapamazsınız';
  end if;

  if not exists (select 1 from teams where id = p_team_id) then
    raise exception 'Ekip bulunamadı.';
  end if;

  -- Tekrar başvuru: kişi başına tek beklemede satır (partial unique yedeği).
  if exists (
    select 1 from team_join_applications
    where rep_id = v_rep and status = 'beklemede'
  ) then
    raise exception 'Zaten bekleyen bir ekip başvurunuz var.';
  end if;

  -- Kapasite (lider dahil) başvuru anında da kontrol edilir; onayda
  -- yeniden kontrol + 0011 trigger'ı ile üç katman tamamlanır.
  select coalesce((select team_capacity from app_settings where id = 1), 15) into v_cap;
  select count(*) into v_count from sales_reps where team_id = p_team_id;
  if v_count + 1 > v_cap then
    raise exception 'Ekip kapasitesi dolu: kapasite % kişi (lider dahil). Başvuru yapılamaz.', v_cap;
  end if;

  insert into team_join_applications (rep_id, team_id)
  values (v_rep, p_team_id)
  returning id into v_id;

  -- Üyelik YOK: satır yalnız 'beklemede'dir; sales_reps'e dokunulmaz.
  perform log_audit(
    'ekip_katilim_basvurusu',
    'Ekip katılım başvurusu oluşturuldu',
    jsonb_build_object('application_id', v_id, 'rep_id', v_rep, 'team_id', p_team_id)
  );

  return v_id;
end $$;

revoke execute on function submit_team_join_application(uuid) from public, anon;
grant execute on function submit_team_join_application(uuid) to authenticated, service_role;

-- ---------- 7) Onay (yalnız yönetici): güvenli üyelik kurma ----------
create or replace function approve_team_join_application(p_application_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_app record;
  v_name text;
  v_cap int;
  v_count int;
begin
  if current_app_role() <> 'admin' then
    raise exception 'yetkisiz';
  end if;

  -- Başvuruyu kilitle + beklemede olduğunu doğrula (eşzamanlı iki karar
  -- aynı satırda sıraya girer; ikincisi "zaten sonuçlandırılmış" alır).
  select * into v_app from team_join_applications where id = p_application_id for update;
  if not found then
    raise exception 'Başvuru bulunamadı.';
  end if;
  if v_app.status <> 'beklemede' then
    raise exception 'Bu başvuru zaten sonuçlandırılmış (durum: %).', v_app.status;
  end if;

  -- ---- Personel yeniden doğrula + başka ekip bağlılık kontrolü ----
  select name into v_name from sales_reps where id = v_app.rep_id;
  if not found then
    raise exception 'Personel kaydı bulunamadı.';
  end if;
  if exists (select 1 from sales_reps where id = v_app.rep_id and team_id is not null) then
    raise exception 'Personel zaten bir ekibe bağlı; başvuru onaylanamaz.';
  end if;

  -- ---- Ekip + kapasite yeniden kontrol ----
  if not exists (select 1 from teams where id = v_app.team_id) then
    raise exception 'Başvurunun ekibi artık yok.';
  end if;
  select coalesce((select team_capacity from app_settings where id = 1), 15) into v_cap;
  select count(*) into v_count from sales_reps where team_id = v_app.team_id;
  if v_count + 1 > v_cap then
    raise exception 'Ekip kapasitesi dolu: kapasite % kişi (lider dahil). Onay yapılamaz.', v_cap;
  end if;

  -- ---- Üyelik: tek transaction; 0011 kapasite trigger'ı bu UPDATE'te
  -- tekrar koşar (çift katman) ve lider-üyelik kurallarını da korur ----
  update sales_reps set team_id = v_app.team_id where id = v_app.rep_id;

  update team_join_applications
  set status = 'onaylandi', decided_at = now(), decided_by = auth.uid()
  where id = p_application_id;

  perform log_audit(
    'ekip_katilim_onaylandi',
    'Ekip katılım başvurusu onaylandı: ' || v_name,
    jsonb_build_object(
      'application_id', p_application_id,
      'rep_id', v_app.rep_id,
      'team_id', v_app.team_id
    )
  );

  return v_app.rep_id;
end $$;

revoke execute on function approve_team_join_application(uuid) from public, anon;
grant execute on function approve_team_join_application(uuid) to authenticated, service_role;

-- ---------- 8) Red (yalnız yönetici): kayıt silinmez ----------
create or replace function reject_team_join_application(p_application_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_app record;
begin
  if current_app_role() <> 'admin' then
    raise exception 'yetkisiz';
  end if;

  select * into v_app from team_join_applications where id = p_application_id for update;
  if not found then
    raise exception 'Başvuru bulunamadı.';
  end if;
  if v_app.status <> 'beklemede' then
    raise exception 'Bu başvuru zaten sonuçlandırılmış (durum: %).', v_app.status;
  end if;

  -- Üyelik YOK: yalnız durum değişir; reddedilen satır denetim için kalır.
  update team_join_applications
  set status = 'reddedildi', decided_at = now(), decided_by = auth.uid()
  where id = p_application_id;

  perform log_audit(
    'ekip_katilim_reddedildi',
    'Ekip katılım başvurusu reddedildi',
    jsonb_build_object(
      'application_id', p_application_id,
      'rep_id', v_app.rep_id,
      'team_id', v_app.team_id
    )
  );
end $$;

revoke execute on function reject_team_join_application(uuid) from public, anon;
grant execute on function reject_team_join_application(uuid) to authenticated, service_role;

commit;
