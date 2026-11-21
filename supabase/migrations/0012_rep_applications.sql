-- =========================================================
-- FİRMA REHBERİ — 0012 referans başvurusu (personel adayı)
-- Kapsam: /basvuru?ref=AF-001 halka açık form → beklemede başvuru kaydı.
--   * Yalnız GÖNDERME (SECURITY DEFINER RPC); anon'un tabloda doğrudan
--     INSERT/SELECT/UPDATE/DELETE policy'si YOKTUR (default deny).
--     Kayıtlar yalnız yönetici tarafından görüntülenir.
--   * Başvuru otomatik personel HESABI veya Supabase Auth kullanıcısı
--     OLUŞTURMAZ; son onay ve hesap oluşturma yalnız yönetici (sonraki
--     aşama — bu migration'a onay akışı dahil edilmez).
--   * Ekip sunucuda belirlenir: istemciden team_id / rep uuid GELMEZ;
--     yalnız açık referans kodu (AF-001) gönderilir, kod sunucuda
--     sales_reps.code üzerinden personele, personelin team_id'si ekibe
--     çevrilir (körü körüne güven yok).
--   * Kapasite dolu ekibe başvuru ALINIR; kapasite onay aşamasında
--     yeniden kontrol edilir (0011 trigger'ı üyelik yazımında yine koşar).
--
-- ÖNKOŞUL: 0001 (sales_reps/audit_log), 0002 (hardening), 0006
--   (web_lead_rate tablosu — rate-limit aynası), 0011 (teams) uygulanmış
--   olmalı. Sıra: 0001→0002→0003→0004→0005→0006→…→0011→0012.
--
-- UYGULAMA (bilinçli elle — 0011 ile birlikte, kod deploy'undan ÖNCE):
--   Supabase Dashboard → SQL Editor → tüm dosyayı tek seferde koş.
--   VEYA CLI: supabase db push (migrations sırasıyla koşar).
--
-- TASARIM (0006 deseninin aynası):
--   * Anonime tablo üzerinde DOĞRUDAN INSERT policy YOK; yazma yalnız
--     ek(tabanlı) SECURITY DEFINER RPC ile yapılır.
--   * Honeypot doluysa HİÇBİR şey yazılmaz ve null döner (bot bilgilendirilmez).
--   * Rate limit: web_lead_rate (0006 ile ortak) — md5(IP), 10 dk / 5 deneme.
--   * Tekrar başvuru: beklemede aynı e-posta/telefon engeli; partial unique
--     index yarışı kapatır (beklemede kişi başına tek satır).
--   * Denetim: audit_log'a sistem rolüyle doğrudan yazım (0006 gibi;
--     log_audit EXECUTE anon'a kapalı olduğundan RPC içinde çağrılmaz).
--   * Telefon/e-posta ad/soyad uzunlukları RPC'de ve CHECK'te aynı sınır.
--
-- DOĞRULAMA (uygulama sonrası):
--   psql> select proname, prosecdef from pg_proc where proname='submit_rep_application';
--   -- beklenen: true (security definer)
--   psql> select policyname from pg_policies where tablename = 'rep_applications';
--   -- beklenen: yalnız "admin full rep applications" (anon policy YOK)
--   psql> select has_function_privilege('anon',
--         'submit_rep_application(text,text,text,text,text,text)', 'EXECUTE');
--   -- beklenen: true
--   REST anon test (bağlantı bilgisiyle):
--     curl -X POST "<URL>/rest/v1/rpc/submit_rep_application" \
--       -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
--       -d '{"p_first_name":"Ayşe","p_last_name":"Yılmaz",
--            "p_phone":"0555 111 22 33","p_email":"ayse@ornek.com",
--            "p_ref_code":"AF-001"}'
--     -- beklenen: uuid değeri; 6. denemede rate-limit hatası
--   psql> select count(*) from rep_applications; -- anon REST ile403 vermeli
--
-- ROLLBACK (kaldırma sırası):
--   begin;
--   drop function if exists submit_rep_application(text, text, text, text, text, text);
--   drop policy if exists "admin full rep applications" on public.rep_applications;
--   drop table if exists public.rep_applications;
--   commit;
--   (web_lead_rate 0006'ya aittir; kaldırılmaz.)
-- =========================================================

begin;

-- ---------- 1) Başvuru tablosu ----------
create table if not exists public.rep_applications (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(btrim(first_name)) between 2 and 50),
  last_name text not null check (char_length(btrim(last_name)) between 2 and 50),
  phone text not null check (length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15),
  email text not null check (char_length(btrim(email)) between 5 and 120),
  -- Referans veren personel: istemciden UUID DEĞİL açık kod gelir; rep
  -- sunucuda çözülür ve buraya yazılır. Personel silinmez (yalnız pasife
  -- çekilir) → restrict güvenlidir.
  referral_rep_id uuid not null references public.sales_reps(id) on delete restrict,
  -- Ekibin anlık görüntüsü: başvuru anındaki personelin team_id'si (sunucuda
  -- okunur, istemciden gelmez). null = referans personelin ekibi yoktur;
  -- başvuru yine personele bağlıdır.
  team_id uuid references public.teams(id) on delete set null,
  -- Onay akışı sonraki aşamada; şimdilik yalnız beklemede üretilir.
  status text not null default 'beklemede'
    check (status in ('beklemede', 'onaylandi', 'reddedildi')),
  created_at timestamptz not null default now()
);

-- ---------- 2) Tekrar başvuru: beklemede kişi başına tek satır ----------
-- Aynı kişi (e-posta VEYA telefon) beklemede ikinci başvuru açamaz.
-- RPC'deki SELECT kontrolü anlaşılır mesaj verir; partial unique index
-- eşzamanlı (yarış) durumu da kapatır. Reddedilen kişi yeniden
-- başvurabilir; onaylı tekrar kontrolü onay aşamasında yapılır.
create unique index if not exists rep_applications_pending_email_uk
  on public.rep_applications (lower(btrim(email)))
  where status = 'beklemede';

create unique index if not exists rep_applications_pending_phone_uk
  on public.rep_applications (regexp_replace(phone, '\D', '', 'g'))
  where status = 'beklemede';

-- ---------- 3) RLS: anon yok, yalnız admin ----------
alter table public.rep_applications enable row level security;

-- Anon/authenticated için HİÇ policy yok → okuma/yazma/değiştirme/silme
-- default-deny kapalıdır. Yazma yalnız RPC; okuma yalnız yönetici.
drop policy if exists "admin full rep applications" on public.rep_applications;
create policy "admin full rep applications" on public.rep_applications for all
  using (current_app_role() = 'admin')
  with check (current_app_role() = 'admin');

-- ---------- 4) Gönderme RPC (0006 deseni) ----------
create or replace function submit_rep_application(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_ref_code text,      -- açık referans kodu (AF-001); rep uuid'si istemciden GELMEZ
  p_honeypot text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_first text;
  v_last text;
  v_phone text;
  v_email text;
  v_ref text;
  v_rep uuid;
  v_team uuid;
  v_ip text;
  v_ip_hash text;
  v_attempts int;
  v_dup uuid;
  v_app_id uuid;
begin
  -- ---- Honeypot: doluysa bot → sessizce yut, "başarı" gibi null ----
  if coalesce(p_honeypot, '') <> '' then
    return null;
  end if;

  -- ---- Sunucu tarafı doğrulama (CHECK'lerle aynı sınırlar) ----
  v_first := btrim(coalesce(p_first_name, ''));
  v_last := btrim(coalesce(p_last_name, ''));
  v_phone := btrim(coalesce(p_phone, ''));
  v_email := lower(btrim(coalesce(p_email, '')));
  v_ref := upper(btrim(coalesce(p_ref_code, '')));

  if length(v_first) < 2 or length(v_first) > 50 then
    raise exception 'Ad 2-50 karakter olmalıdır.';
  end if;
  if length(v_last) < 2 or length(v_last) > 50 then
    raise exception 'Soyad 2-50 karakter olmalıdır.';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 7
     or length(regexp_replace(v_phone, '\D', '', 'g')) > 15 then
    raise exception 'Geçerli bir telefon numarası girin.';
  end if;
  if length(v_email) < 5 or length(v_email) > 120
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Geçerli bir e-posta adresi girin.';
  end if;

  -- ---- Referans personeli SUNUCUDA çöz ----
  -- İstemciden yalnız açık kod gelir; ekip rep'in o anki team_id'sidir
  -- (kullanıcının gönderdiği team_id/rep kimliğine körü körüne güvenilmez).
  select sr.id, sr.team_id into v_rep, v_team
  from sales_reps sr
  where sr.code = v_ref and sr.status = 'aktif';
  if v_rep is null then
    raise exception 'Geçersiz referans bağlantısı.';
  end if;

  -- ---- Tekrar başvuru: beklemede aynı e-posta/telefon ----
  select a.id into v_dup
  from rep_applications a
  where a.status = 'beklemede'
    and (
      lower(btrim(a.email)) = v_email
      or regexp_replace(a.phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
    )
  limit 1;
  if v_dup is not null then
    raise exception 'Bu bilgilerle zaten bekleyen bir başvurunuz var.';
  end if;

  -- ---- Rate limit: 10 dakika / 5 deneme / IP hash (0006 ile ortak tablo) ----
  v_ip := coalesce(
    split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1),
    'bilinmeyen'
  );
  v_ip_hash := md5(btrim(v_ip));

  insert into web_lead_rate (ip_hash, window_start, attempts)
  values (v_ip_hash, now(), 1)
  on conflict (ip_hash) do update set
    attempts = case
      when web_lead_rate.window_start < now() - interval '10 minutes' then 1
      else web_lead_rate.attempts + 1
    end,
    window_start = case
      when web_lead_rate.window_start < now() - interval '10 minutes' then now()
      else web_lead_rate.window_start
    end
  returning attempts into v_attempts;

  if v_attempts > 5 then
    raise exception 'Çok fazla deneme yaptınız; lütfen bir süre bekleyin.';
  end if;

  -- ---- Kayıt: BEKLEMEDE personel başvurusu ----
  -- Hesap, profile veya Auth kullanıcısı OLUŞTURULMAZ (onay yalnız yönetici).
  insert into rep_applications (first_name, last_name, phone, email, referral_rep_id, team_id, status)
  values (v_first, v_last, v_phone, v_email, v_rep, v_team, 'beklemede')
  returning id into v_app_id;

  -- ---- Denetim: tanımsal (owner) bağlamda; istemciden yazılamaz ----
  insert into audit_log (actor_id, actor_role, action, summary, detail)
  values (
    null,
    'sistem',
    'personel_basvurusu',
    'Personel başvurusu: ' || v_first || ' ' || v_last,
    jsonb_build_object(
      'application_id', v_app_id,
      'referral_rep_id', v_rep,
      'team_id', v_team
    )
  );

  return v_app_id;
end $$;

-- EXECUTE yüzeyi: anon + authenticated (form halka açıktır; rol guard'ı
-- gerekmez çünkü fonksiyon mutasyonun kendi doğrulaması ve rate limitiyle
-- korunur; tabloya doğrudan erişim RLS default-deny'den geçemez).
revoke execute on function submit_rep_application(text, text, text, text, text, text) from public;
grant execute on function submit_rep_application(text, text, text, text, text, text) to anon, authenticated;

commit;
