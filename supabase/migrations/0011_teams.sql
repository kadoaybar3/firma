-- =========================================================
-- FİRMA REHBERİ — 0011 ekip altyapısı
-- Kapsam: BAĞIMSIZ ekipler (hiyerarşi YOK), ekip kapasitesi (varsayılan 15,
--   lider dahil), ekip görünürlüğü RLS, personelin kendi ekibini kurması.
--
-- İŞ KURALLARI (bu migration'ın aynadığı):
--   * Her ekip ana sisteme doğrudan bağlıdır; üst/alt ekip kolonu YOKTUR →
--     iç içe hiyerarşi imkânsızdır (teams tablosunda parent referansı yok).
--   * Her ekibin tek bir lideri vardır (leader_rep_id UNIQUE → bir personel
--     aynı anda yalnız bir ekibin lideri olabilir).
--   * Bir personel aynı anda yalnız bir ekipte üyedir (sales_reps.team_id
--     tek kolon; yeni ekibe katılınca eski üyelik otomatik düşer).
--   * Kapasite varsayılan 15 KİŞİ: lider de üyedir ve sayılır →
--     1 lider + en fazla 14 üye. Kapasite `app_settings.team_capacity`.
--   * Kapasite yalnız arayüzde değil TABLO SEVİYESİNDE de zorlanır
--     (trg_sales_reps_team_capacity BEFORE trigger).
--   * Son onay ve referans başvuruları BU AŞAMADA YOKTUR (sonraki aşamalar).
--
-- GERİYE DÖNÜKLÜK: Mevcut veriye dokunmaz. Kolonlar nullable/default'ludur;
--   mevcut tüm satırlar (ekipsiz) aynen kalır. Mevcut satış, komisyon,
--   personel ve referans tabloları DEĞİŞMEZ.
--
-- UYGULAMA (bilinçli elle — kod deploy'undan ÖNCE):
--   Supabase Dashboard → SQL Editor → tüm dosyayı tek seferde koş.
--   VEYA CLI: supabase db push (migrations sırasıyla koşar).
--   SIRA ÖNEMLİ: 0011 uygulanmadan yeni kod deploy edilirse
--   `sales_reps.team_id`/`app_settings.team_capacity` kolonları olmadığından
--   snapshot upsert'leri hata verir (kolonlar nullable olduğundan OKUMA
--   sorunsuzdur; yalnız yeni yazımlar etkilenir).
--
-- NOT — leader_rep_id FK BİLGİNÇLİ YOK:
--   `teams.leader_rep_id` → `sales_reps` FK'sı OLSAYDI, senkron sırası
--   döngüye girerdi (teams satırı rep'i, rep satırı team'i gerektirir;
--   PostgREST upsert'leri ayrı transaction'dır, deferrable yardım etmez).
--   Bunun yerine NOT NULL + UNIQUE korunur (birebir liderlik garantisi);
--   temsilci silinmez (yalnız pasife çekilir), ekip silme özelliği yoktur.
--
-- DOĞRULAMA (uygulama sonrası):
--   psql> select policyname, cmd from pg_policies where tablename = 'teams';
--   -- beklenen: "admin full teams" (ALL), "rep read own team" (SELECT)
--   psql> select tgname from pg_trigger where tgname = 'trg_sales_reps_team_capacity';
--   psql> select team_capacity from app_settings;   -- beklenen: 15
--   psql> select has_function_privilege('anon', 'create_team(text)', 'EXECUTE'); -- false
--
-- ROLLBACK (kaldırma sırası):
--   drop trigger if exists trg_teams_leader_member on public.teams;
--   drop trigger if exists trg_sales_reps_team_capacity on public.sales_reps;
--   drop function if exists enforce_team_capacity();
--   drop function if exists team_leader_membership();
--   drop function if exists create_team(text);
--   drop function if exists current_team_id();
--   drop policy if exists "rep read own team" on public.teams;
--   drop policy if exists "admin full teams" on public.teams;
--   drop policy if exists "rep self and admin read" on public.sales_reps;
--   -- orijinal politika: 0001'deki haliyle yeniden oluşturulur:
--   -- create policy "rep self and admin read" on public.sales_reps for select
--   --   using (id = current_sales_rep_id() or current_app_role() = 'admin');
--   alter table public.app_settings drop constraint if exists app_settings_team_capacity_min;
--   alter table public.app_settings drop column if exists team_capacity;
--   alter table public.sales_reps drop column if exists team_id;
--   drop table if exists public.teams;
-- =========================================================

begin;

-- ---------- 1) Ekipler ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  leader_rep_id uuid not null unique references public.sales_reps(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Üyelik: bir personel tek kolonla tek ekipte (eski üyelik UPDATE ile düşer).
alter table public.sales_reps
  add column if not exists team_id uuid references public.teams(id) on delete set null;

create index if not exists sales_reps_team_idx on public.sales_reps (team_id);

-- ---------- 2) Genel ekip kapasitesi (yönetim panelinden değiştirilebilir) ----------
alter table public.app_settings
  add column if not exists team_capacity int not null default 15;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_team_capacity_min'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_team_capacity_min check (team_capacity >= 2);
  end if;
end $$;

-- ---------- 3) Yardımcı: oturumun ekibi (RLS policy'leri için) ----------
-- 0002/B1 gerekçesi: RLS policy'leri HER rol için değerlendirildiğinden bu
-- fonksiyonun anon execute hakkı da vardır; anon için auth.uid() null → null.
create or replace function current_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select sr.team_id
  from profiles p
  join sales_reps sr on sr.id = p.sales_rep_id
  where p.id = auth.uid()
$$;

revoke execute on function current_team_id() from public;
grant execute on function current_team_id() to anon, authenticated, service_role;

-- ---------- 4) Kapasite trigger'ı (DB seviyesi zorlama) ----------
-- Yalnız team_id INSERT/UPDATE'inde çalışır (ilişkisiz satır düzenlemelerini
-- engellemez). Lider de team_id taşıdığından kapasiteye DAHİLDİR.
-- SECURITY DEFINER: sayaç RLS'e takılmaz; eşzamanlı eklemeler teams satırı
-- kilitlenerek sıraya girer (kapasite yarışı kapanır).
create or replace function enforce_team_capacity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cap int;
  v_count int;
begin
  -- Lider her zaman kendi ekibinin üyesidir: liderlik devredilmeden
  -- ekibinden ayrılamaz (team_id null/transfer) — DB seviyesi kural.
  if exists (select 1 from teams where leader_rep_id = new.id)
     and not exists (select 1 from teams where leader_rep_id = new.id and id = new.team_id) then
    raise exception 'ekip lideri kendi ekibinden ayrılamaz; önce ekip liderliğini değiştirin';
  end if;

  if new.team_id is null then
    return new;
  end if;
  -- Eşzamanlı üye eklemeleri bu kilitle sıraya girer: son kapasite slotu
  -- için yarışan iki transaction aynı anda sayım yapamaz.
  perform 1 from teams where id = new.team_id for update;
  select coalesce(
    (select team_capacity from app_settings where id = 1),
    15
  ) into v_cap;
  select count(*) into v_count
  from sales_reps
  where team_id = new.team_id and id <> new.id;
  if v_count + 1 > v_cap then
    raise exception 'ekip kapasitesi doldu: kapasite % kişi (lider dahil)', v_cap;
  end if;
  return new;
end $$;

drop trigger if exists trg_sales_reps_team_capacity on public.sales_reps;
create trigger trg_sales_reps_team_capacity
  before insert or update of team_id on public.sales_reps
  for each row execute function enforce_team_capacity();

-- ---------- 5) Lider her zaman kendi ekibinin üyesidir ----------
-- teams INSERT/leader değişikliğinde liderin team_id'si ekibe bağlanır;
-- kapasite aşılırsa bu UPDATE trigger'ı raise eder → teams işlemi geri alınır
-- (ekip liderliği kapasite dışı kurulamaz). Lider başka ekipteyse o ekipten
-- ayrılır (tek üyelik kuralı). Yeni lider başka ekibin lideri ise UNIQUE
-- (leader_rep_id) zaten engeller.
create or replace function team_leader_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update sales_reps
  set team_id = new.id
  where id = new.leader_rep_id and team_id is distinct from new.id;
  return new;
end $$;

drop trigger if exists trg_teams_leader_member on public.teams;
create trigger trg_teams_leader_member
  after insert or update of leader_rep_id on public.teams
  for each row execute function team_leader_membership();

-- ---------- 6) RLS: ekip görünürlüğü ----------
alter table public.teams enable row level security;

drop policy if exists "admin full teams" on public.teams;
create policy "admin full teams" on public.teams for all
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

-- Temsilci: yalnız KENDİ ekibini okur (diğer ekipler görünmez).
drop policy if exists "rep read own team" on public.teams;
create policy "rep read own team" on public.teams for select
  using (current_app_role() = 'temsilci' and id = current_team_id());

-- sales_reps okuma: mevcut "yalnız kendim + admin" kuralına, ekip arkadaşlarını
-- görme yetkisi eklenir (iş kuralı: personel yalnız kendi ekibini ve doğrudan
-- üyelerini görebilir). YAZMA yetkisi DEĞİŞMEZ: personel team_id/update
-- politikası YOKTUR → ekipler arası transfer yalnız yöneticidedir.
drop policy if exists "rep self and admin read" on public.sales_reps;
create policy "rep self and admin read" on public.sales_reps for select
  using (
    id = current_sales_rep_id()
    or current_app_role() = 'admin'
    or (current_app_role() = 'temsilci' and team_id is not null and team_id = current_team_id())
  );

-- ---------- 7) create_team: personelin kendi ekibini kurması ----------
-- SECURITY DEFINER: çağırıcı Reps üzerinde UPDATE yetkisine sahip değildir;
-- üyelik ataması tetikleyiciyle yapılır. Yalnız authenticated (anon değil).
create or replace function create_team(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid;
  v_name text;
  v_id uuid;
begin
  if current_app_role() <> 'temsilci' then
    raise exception 'yetkisiz';
  end if;
  v_rep := current_sales_rep_id();
  if v_rep is null then
    raise exception 'ekip kurulamadı: temsilci kaydı bulunamadı';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'ekip adı 2-60 karakter olmalıdır';
  end if;

  -- Bir personel aynı anda yalnız bir ekibin lideri olabilir (UNIQUE yedeği
  -- + anlaşılır mesaj). Mevcut üyelikten ayrılma tetikleyiciyle otomatiktir.
  if exists (select 1 from teams where leader_rep_id = v_rep) then
    raise exception 'zaten bir ekibin liderisiniz';
  end if;

  insert into teams (name, leader_rep_id, created_by)
  values (v_name, v_rep, auth.uid())
  returning id into v_id;

  perform log_audit(
    'ekip_kuruldu',
    'Ekip kuruldu: ' || v_name,
    jsonb_build_object('team_id', v_id, 'leader_rep_id', v_rep)
  );

  return v_id;
end $$;

revoke execute on function create_team(text) from public, anon;
grant execute on function create_team(text) to authenticated, service_role;

commit;
