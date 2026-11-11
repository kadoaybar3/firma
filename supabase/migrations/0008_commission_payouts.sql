-- FİRMA REHBERİ — Temsilciye kısmi komisyon ödemeleri
-- Her transfer ayrı defter kaydıdır; komisyon satırlarının tutarı/durumu
-- değiştirilmez. Eski tam ödenmiş komisyonlar başlangıç bakiyesi olarak taşınır.

begin;

create table if not exists public.commission_payouts (
  id uuid primary key,
  sales_rep_id uuid not null references public.sales_reps(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  reference_no text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  source_commission_id uuid references public.commissions(id) on delete restrict
);

create unique index if not exists commission_payouts_source_commission_unique
  on public.commission_payouts (source_commission_id)
  where source_commission_id is not null;

create index if not exists commission_payouts_rep_paid_idx
  on public.commission_payouts (sales_rep_id, paid_at desc);

-- Eski sürümde komisyon tamamen ödendi olarak işaretleniyordu. Bu kayıtları
-- ödeme geçmişine taşıyarak mevcut temsilci bakiyelerini koru.
insert into public.commission_payouts (
  id, sales_rep_id, amount, paid_at, created_at, source_commission_id
)
select
  gen_random_uuid(), sales_rep_id, amount,
  coalesce(paid_at, created_at), created_at, id
from public.commissions
where status = 'odendi'
on conflict (source_commission_id) where source_commission_id is not null do nothing;

alter table public.commission_payouts enable row level security;

create policy "commission payouts admin read"
  on public.commission_payouts for select to authenticated
  using (current_app_role() = 'admin');

create policy "commission payouts rep own read"
  on public.commission_payouts for select to authenticated
  using (current_app_role() = 'temsilci' and sales_rep_id = current_sales_rep_id());

revoke all on public.commission_payouts from anon;
revoke insert, update, delete on public.commission_payouts from authenticated;
grant select on public.commission_payouts to anon, authenticated;

create or replace function public.record_commission_payout(
  p_payout_id uuid,
  p_sales_rep_id uuid,
  p_amount numeric,
  p_reference_no text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing commission_payouts;
  v_earned numeric(12, 2);
  v_paid numeric(12, 2);
  v_rep_name text;
begin
  if current_app_role() is distinct from 'admin'::app_role then
    raise exception 'Yalnızca yönetici ödeme kaydedebilir.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Ödeme tutarı sıfırdan büyük ve en fazla iki ondalık basamaklı olmalıdır.';
  end if;
  if length(trim(coalesce(p_reference_no, ''))) > 120 then
    raise exception 'Banka referans numarası 120 karakteri aşamaz.';
  end if;

  -- Aynı temsilci için eşzamanlı ödeme girişlerini sırala; böylece toplam
  -- ödeme, kalan alacağı aşamaz.
  select name into v_rep_name
  from sales_reps
  where id = p_sales_rep_id
  for update;
  if not found then raise exception 'Temsilci bulunamadı.'; end if;

  -- Ağ tekrarında aynı payout UUID'siyle gelen istek ikinci kez yazılmaz.
  select * into v_existing from commission_payouts where id = p_payout_id;
  if found then
    if v_existing.sales_rep_id = p_sales_rep_id
       and v_existing.amount = p_amount
       and coalesce(v_existing.reference_no, '') = coalesce(nullif(trim(p_reference_no), ''), '') then
      return v_existing.id;
    end if;
    raise exception 'Ödeme isteği kimliği daha önce farklı bilgilerle kullanılmış.';
  end if;

  select coalesce(sum(amount), 0) into v_earned
  from commissions where sales_rep_id = p_sales_rep_id;
  select coalesce(sum(amount), 0) into v_paid
  from commission_payouts where sales_rep_id = p_sales_rep_id;

  if p_amount > v_earned - v_paid then
    raise exception 'Ödeme tutarı temsilcinin kalan alacağından fazla olamaz.';
  end if;

  insert into commission_payouts (
    id, sales_rep_id, amount, reference_no, created_by
  ) values (
    p_payout_id, p_sales_rep_id, p_amount, nullif(trim(p_reference_no), ''), auth.uid()
  );

  perform log_audit(
    'komisyon_odeme_kaydedildi',
    format('%s temsilcisine %s tutarında ödeme kaydedildi', v_rep_name, p_amount),
    jsonb_build_object(
      'payout_id', p_payout_id,
      'sales_rep_id', p_sales_rep_id,
      'amount', p_amount,
      'reference_no', nullif(trim(p_reference_no), '')
    )
  );

  return p_payout_id;
end;
$$;

revoke execute on function public.record_commission_payout(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.record_commission_payout(uuid, uuid, numeric, text) to authenticated, service_role;

commit;
