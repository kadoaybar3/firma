-- =========================================================
-- FİRMA REHBERİ — 0014 ekip liderliği komisyonu
-- Kapsam: YALNIZ ekip liderliği komisyonu (yeni tablolar + confirm_sale
--   ekip bloğu + ödeme RPC'si). Mevcut `commissions` tablosuna, temsilci
--   komisyon formülüne, `confirm_renewal`'e ve `commission_payouts`
--   yapısına DOKUNULMAZ.
--
-- İŞ MODELİ:
--   * Ekip lideri, doğrudan kendi ekibindeki personelin yaptığı her YENİ
--     firma satışında kazanır. Yenileme satışı hariç (yenileme sistemi
--     yoktur; yenileme komisyonu da üretilmez).
--   * Matrah = satış tutarı − bu satış için oluşan tüm paylar (temsilci
--     komisyonu + varsa referans ödülü). Brüt tutar üzerinden HESAP YOK.
--   * Komisyon = matrahın %20'si; her yeni satışta yeniden hesaplanır.
--   * Liderin kendi satışı, ekipte olmayan personelin satışı, doğrudan
--     (dogrudan kanal) satış ve yenileme satışı bu komisyonu üretmez.
--   * Üst/alt ekip YOKTUR (0011): yalnız doğrudan ekip üyesi sayılır.
--
-- ÖRNEK: 1.000 TL satış, %50 temsilci komisyonu 500 TL → kalan 500 TL
--   → ekip liderliği komisyonu 100 TL → Firma Rehberi'nde kalan 400 TL.
--
-- VERİ MODELİ:
--   * `team_commissions`: satış (BU SATIR İÇİN TEK) + satışı yapan +
--     SATIŞ ANINDAKİ ekip lideri (anlık görüntü) + matrah + oran + tutar.
--     Personel sonra ekip değiştirince geçmiş satırlar DEĞİŞMEZ.
--     Aynı satış için ikinci satır `unique (sale_id)` ile SQL seviyesinde
--     engellenir. `commissions` tablosuna ikinci satır EKLENMEZ.
--   * `team_commission_payouts`: yönetici ödeme defteri (0008 deseni).
--     Temsilci komisyon/ödeme defteriyle KARIŞTIRILMAZ; mevcut bakiyeler
--     ve ödeme kayıtları değişmez.
--
-- GÜVENLİK:
--   * Hesaplama istemciye bırakılmaz: tutar/orma confirm_sale içinde
--     (SECURITY DEFINER, aynı transaction) veritabanında hesaplanır.
--   * RLS: yalnız SELECT — admin tümü, ekip lideri yalnız kendi satırı;
--     anon/authenticated YAZMA hakkı YOK (revoke). service_role istemciye
--     AÇILMAZ (VITE_ ile ön yüze çıkmaz).
--   * record_team_commission_payout: admin guard + bakiye sınırı + payout
--     UUID idempotentliği (0008 record_commission_payout aynası).
--
-- ÖNKOŞUL: 0001 (sales/commissions/audit), 0002, 0010 (confirm_sale
--   yüzde formülü), 0011 (teams) uygulanmış olmalı.
--   Sıra: 0001→…→0010→0011→0012→0013→0014.
--
-- UYGULAMA (bilinçli elle — 0011/0012/0013 ile birlikte, kod deploy'undan ÖNCE):
--   Supabase Dashboard → SQL Editor → bu dosyayı tek seferde çalıştır.
--
-- UYGULAMA SONRASI DOĞRULAMA:
--   psql> select count(*) from pg_indexes where indexname = 'team_commissions_sale_unique';  -- 1
--   psql> select proname, prosecdef from pg_proc where proname = 'confirm_sale';             -- true, true
--   psql> select prosrc from pg_proc where proname = 'confirm_sale'
--         and prosrc like '%team_commissions%';                                              -- 1 satır
--   psql> select has_function_privilege('anon',
--         'record_team_commission_payout(uuid,uuid,numeric,text)', 'EXECUTE');               -- false
--   psql> select policyname, cmd from pg_policies where tablename = 'team_commissions';       -- yalnız select ×2
--   -- Eski satışlara geriye dönük yazılmaz:
--   psql> select count(*) from team_commissions;                                             -- 0 (yalnız yeni onaylarla artar)
--
-- ROLLBACK (veri kaybı olmaz; mevcut satış/komisyon/ödeme satırları
-- bu rollback'e dahil değildir):
--   begin;
--   drop function if exists record_team_commission_payout(uuid, uuid, numeric, text);
--   -- confirm_sale: 0010 dosyasındaki tanımı yeniden çalıştırın (create or replace geri alır).
--   drop policy if exists "team commissions admin read" on public.team_commissions;
--   drop policy if exists "team commissions leader read" on public.team_commissions;
--   drop table if exists public.team_commission_payouts;
--   drop table if exists public.team_commissions;
--   commit;
-- =========================================================

begin;

-- ---------- 1) Ekip liderliği komisyon satırları ----------
create table if not exists public.team_commissions (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  -- Satışı yapan doğrudan ekip üyesi
  sales_rep_id uuid not null references public.sales_reps(id),
  -- SATIŞ ANINDAKİ ekip lideri (anlık görüntü — sonradan değişmez)
  team_leader_rep_id uuid not null references public.sales_reps(id),
  -- Firma Rehberi'ne satıştan gerçekten kalan tutar (paylar sonrası)
  base_amount numeric(12, 2) not null check (base_amount > 0),
  -- Ekip liderliği komisyon oranı (%) — kesin iş modeli: 20
  rate numeric(6, 2) not null check (rate >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

-- Her satış için EN FAZLA bir ekip liderliği komisyonu (SQL seviyesi garanti)
create unique index if not exists team_commissions_sale_unique
  on public.team_commissions (sale_id);

create index if not exists team_commissions_leader_idx
  on public.team_commissions (team_leader_rep_id, created_at desc);

alter table public.team_commissions enable row level security;

create policy "team commissions admin read"
  on public.team_commissions for select to authenticated
  using (current_app_role() = 'admin');

create policy "team commissions leader read"
  on public.team_commissions for select to authenticated
  using (current_app_role() = 'temsilci' and team_leader_rep_id = current_sales_rep_id());

-- Yalnız SELECT: satırlar yalnız confirm_sale (SECURITY DEFINER) içinde doğar.
revoke insert, update, delete on public.team_commissions from anon, authenticated;

-- ---------- 2) Ekip liderliği komisyonu ödemeleri ----------
-- Temsilci komisyon defterinden AYRIDIR (0008 commission_payouts'a
-- dokunulmaz; mevcut bakiyeler değişmez).
create table if not exists public.team_commission_payouts (
  id uuid primary key,
  team_leader_rep_id uuid not null references public.sales_reps(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  reference_no text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists team_commission_payouts_leader_paid_idx
  on public.team_commission_payouts (team_leader_rep_id, paid_at desc);

alter table public.team_commission_payouts enable row level security;

create policy "team payouts admin read"
  on public.team_commission_payouts for select to authenticated
  using (current_app_role() = 'admin');

create policy "team payouts leader read"
  on public.team_commission_payouts for select to authenticated
  using (current_app_role() = 'temsilci' and team_leader_rep_id = current_sales_rep_id());

revoke insert, update, delete on public.team_commission_payouts from anon, authenticated;

-- ---------- 3) confirm_sale: ekip liderliği bloğu ----------
-- GÖVDE: 0010 dosyasındaki confirm_sale ile BİREBİR aynıdır (temsilci
-- komisyon formülü, referans dalı, kilitler ve kontroller değişmez);
-- yalnız `log_audit` öncesine ekip liderliği komisyon bloğu EKLENMİŞTİR.
create or replace function confirm_sale(p_sale_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s sales;
  m memberships;
  st app_settings;
  rep sales_reps;
  ref referrals;
  new_commission_id uuid;
  v_team_id uuid;
  v_leader_id uuid;
  v_remaining numeric;
begin
  if current_app_role() <> 'admin' then
    raise exception 'yetkisiz';
  end if;

  select * into s from sales where id = p_sale_id for update;
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
        end,
        -- Genel oran da yüzde olarak uygulanır (JS engine ile aynı sonuç).
        -- > 100 = eski TL değeri; JS settingsFromRow ile aynı %50 yedeği.
        round(s.amount * (case when st.rep_commission > 100 then 50 else st.rep_commission end) / 100)
      ),
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

  -- ---- Ekip Liderliği Komisyonu (0014) ----
  -- Matrah: satış tutarından bu satış için oluşan TÜM payların (temsilci
  -- komisyonu + varsa referans ödülü) düşülmesiyle kalan tutar.
  -- Brüt tutar üzerinden hesap YOK. Yenileme satışı ve liderin kendi
  -- satışı bu komisyonu üretmez; yalnız doğrudan ekip üyesi sayılır.
  if s.channel = 'temsilci' and s.sales_rep_id is not null
     and s.renewal_for_membership_id is null then
    select sr.team_id into v_team_id
    from sales_reps sr where sr.id = s.sales_rep_id;
    if v_team_id is not null then
      select t.leader_rep_id into v_leader_id
      from teams t where t.id = v_team_id;
      if found and v_leader_id is distinct from s.sales_rep_id then
        v_remaining := s.amount - coalesce(
          (select sum(c.amount) from commissions c where c.sale_id = s.id), 0);
        if v_remaining > 0 then
          insert into team_commissions
            (sale_id, sales_rep_id, team_leader_rep_id, base_amount, rate, amount)
          values
            (s.id, s.sales_rep_id, v_leader_id, v_remaining, 20, round(v_remaining * 20 / 100));
        end if;
      end if;
    end if;
  end if;

  perform log_audit('satis_kesinlesti', 'Satış kesinleşti', jsonb_build_object('sale_id', s.id));
  return new_commission_id;
end $$;

-- ---------- 4) Ekip liderliği komisyonu ödeme kaydı (yalnız yönetici) ----------
-- 0008 record_commission_payout deseni: idempotent payout UUID, satır
-- kilidi, bakiye sınırı (hakediş − ödenen). Temsilci defteriyle karışmaz.
create or replace function public.record_team_commission_payout(
  p_payout_id uuid,
  p_team_leader_rep_id uuid,
  p_amount numeric,
  p_reference_no text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing team_commission_payouts;
  v_earned numeric(12, 2);
  v_paid numeric(12, 2);
  v_leader_name text;
begin
  -- service_role (auth.uid() null → current_app_role() null) sunucudan
  -- geçer; temsilci/anon bu fonksiyonu çağıramaz (EXECUTE revoke'lu).
  if current_app_role() <> 'admin' then
    raise exception 'Yalnızca yönetici ödeme kaydedebilir.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Ödeme tutarı sıfırdan büyük ve en fazla iki ondalık basamaklı olmalıdır.';
  end if;
  if length(trim(coalesce(p_reference_no, ''))) > 120 then
    raise exception 'Banka referans numarası 120 karakteri aşamaz.';
  end if;

  -- Eşzamanlı ödeme girişlerini sırala: toplam ödeme kalan alacağı aşamaz.
  select name into v_leader_name
  from sales_reps
  where id = p_team_leader_rep_id
  for update;
  if not found then raise exception 'Ekip lideri bulunamadı.'; end if;

  -- Ağ tekrarında aynı payout UUID'si ikinci kez yazılmaz.
  select * into v_existing from team_commission_payouts where id = p_payout_id;
  if found then
    if v_existing.team_leader_rep_id = p_team_leader_rep_id
       and v_existing.amount = p_amount
       and coalesce(v_existing.reference_no, '') = coalesce(nullif(trim(p_reference_no), ''), '') then
      return v_existing.id;
    end if;
    raise exception 'Ödeme isteği kimliği daha önce farklı bilgilerle kullanılmış.';
  end if;

  select coalesce(sum(amount), 0) into v_earned
  from team_commissions where team_leader_rep_id = p_team_leader_rep_id;
  select coalesce(sum(amount), 0) into v_paid
  from team_commission_payouts where team_leader_rep_id = p_team_leader_rep_id;

  if p_amount > v_earned - v_paid then
    raise exception 'Ödeme tutarı ekip liderinin kalan alacağından fazla olamaz.';
  end if;

  insert into team_commission_payouts (
    id, team_leader_rep_id, amount, reference_no, created_by
  ) values (
    p_payout_id, p_team_leader_rep_id, p_amount, nullif(trim(p_reference_no), ''), auth.uid()
  );

  perform log_audit(
    'ekip_liderligi_odeme_kaydedildi',
    format('%s adına ekip liderliği komisyonu ödemesi kaydedildi (%s)', v_leader_name, p_amount),
    jsonb_build_object(
      'payout_id', p_payout_id,
      'team_leader_rep_id', p_team_leader_rep_id,
      'amount', p_amount,
      'reference_no', nullif(trim(p_reference_no), '')
    )
  );

  return p_payout_id;
end;
$$;

revoke execute on function public.record_team_commission_payout(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.record_team_commission_payout(uuid, uuid, numeric, text) to authenticated, service_role;

commit;
