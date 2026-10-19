-- =========================================================
-- FİRMA REHBERİ — 0006 web başvuru RPC (form canlıda çalışsın)
-- Kapsam: Tur 6 "Firmanızı ekletin" formunun canlıda 403 almaması.
--
-- ÖNKOŞUL: 0001 (leads/audit_log/log_audit) ve 0004 (leads.source) uygulanmış
--   olmalı. 0002/0003/0005 sırayla koşulmuş olmalı (sıra: 0001→0002→0003→
--   0004→0005→0006).
--
-- UYGULAMA (bilinçli elle): Supabase Dashboard → SQL Editor → tüm dosyayı
--   tek seferde koş. VEYA CLI: supabase db push.
--
-- TASARIM İLKELERİ (kalıcı güvenlik kararlarıyla hizalı):
--   * ANONİM KULLANICIYA leads tablosunda DOĞRUDAN INSERT policy YE DEİL.
--     Yazma yalnız ek(tabanlı) SECURITY DEFINER RPC üzerinden yapılır →
--     şema aşını gerekli olduğundan pratikte yüzeyi bu tek RPC'ye daraltır.
--   * Sunucu tarafı doğrulama: zorunlu alanlar, uzunluk sınırları,
--     kategori/şehir varlık kontrolü.
--   * Honeypot client'ın gönderdiği p_honeypot alanı: doluysa HİÇBİR
--     şey yazılmaz ve başarı gibi cevap (null) döner — botu bilgilendirmedik.
--   * Rate limit: istemci IP'sinin TÜZ (MD5) hash'i üzerinden, 10 dakikada
--     en fazla 5 başvuru. Ham IP saklanmaz; yalnız hash (reversible değil).
--   * Anonim başvuru sahibi leads satırlarını OKUYAMAZ: leads için anon
--     SELECT politikası 0001'de zaten yok; RPC yalnız id HAZIR döner.
--   * audit_log yazımı tanımsal (SECURITY DEFINER owner) bağlamda; RLS'e
--     takılmaz; istemciye audit yazı izni verilmez.
--   * Komisyon tavanı kasıtlı olarak EKLENMEDİ (kullanıcı kararı: ertelendi).
--
-- UYGULAMA SONRASI DOĞRULAMA:
--   psql> select proname, prosecdef from pg_proc where proname='submit_web_lead';
--   -- beklenen: true (security definer)
--   REST ile anon test (bağlantı bilgisiyle):
--     curl -X POST "<URL>/rest/v1/rpc/submit_web_lead" \
--       -H "apikey: <ANON_KEY>" -H "Content-Type: application/json" \
--       -d '{"p_company_name":"Test Firması","p_phone":"0272 999 00 00"}'
--     -- beklenen: uuid değeri
--   6. denemede: '{"message":"Çok fazla deneme..."}' benzeri hata
--
-- ROLLBACK:
--   begin;
--   drop function if exists submit_web_lead(text, text, uuid, uuid, text, text, text);
--   drop table if exists web_lead_rate;
--   commit;
-- =========================================================

begin;

-- ---------- Rate-limit tablosu ----------
-- Kimse dışarıdan okumaz/yazamaz (RLS politikası yok, yalnız RPC içinde).
create table if not exists web_lead_rate (
  ip_hash text primary key,
  window_start timestamptz not null default now(),
  attempts int not null default 0
);
alter table web_lead_rate enable row level security;

create or replace function submit_web_lead(
  p_company_name text,
  p_phone text,
  p_category_id uuid default null,
  p_city_id uuid default null,
  p_district text default null,
  p_note text default null,
  p_honeypot text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_phone text;
  v_district text;
  v_note text;
  v_honeypot text;
  v_ip text;
  v_ip_hash text;
  v_attempt_count int;
  v_lead_id uuid;
begin
  -- ---- Honeypot: doluysa bot → sessizce yut, "başarı" gibi döner ----
  v_honeypot := coalesce(p_honeypot, '');
  if v_honeypot <> '' then
    return null;
  end if;

  -- ---- Sunucu tarafı doğrulama ----
  v_name := coalesce(p_company_name, '');
  v_phone := coalesce(p_phone, '');
  v_district := coalesce(nullif(p_district, ''), null);
  v_note := coalesce(p_note, '');

  if trim(v_name) is null or length(btrim(v_name)) < 2 then
    raise exception 'Firma adı zorunludur.';
  end if;
  if length(btrim(v_name)) > 120 then
    raise exception 'Firma adı çok uzun.';
  end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 7 then
    raise exception 'Telefon numarası zorunludur.';
  end if;
  if length(v_note) > 2000 then
    raise exception 'Not bölümü çok uzun.';
  end if;

  if p_category_id is not null and not exists (select 1 from categories c where c.id = p_category_id) then
    raise exception 'Kategori bulunamadı.';
  end if;
  if p_city_id is not null and not exists (select 1 from cities ct where ct.id = p_city_id) then
    raise exception 'Şehir bulunamadı.';
  end if;

  -- ---- Rate limit: 10 dakika / 5 başvuru / IP hash ----
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
  returning attempts into v_attempt_count;

  if v_attempt_count > 5 then
    raise exception 'Çok fazla deneme yaptınız; lütfen bir süre bekleyin.';
  end if;

  -- ---- Kayıt: temsilcisiz 'web' kaynağı adayı (0004 source kolonu) ----
  insert into leads (company_name, phone, category_id, city_id, district, note, source, sales_rep_id, status)
  values (
    btrim(v_name),
    btrim(v_phone),
    p_category_id,
    p_city_id,
    v_district,
    v_note,
    'web',
    null,
    'yeni'
  )
  returning id into v_lead_id;

  -- ---- Denetim kaydı: tanımsal (owner) bağlamda; istemciden yazılamaz ----
  insert into audit_log (actor_id, actor_role, action, summary, detail)
  values (
    null,
    'sistem',
    'web_basvuru',
    'Web başvurusu: ' || btrim(v_name),
    jsonb_build_object('lead_id', v_lead_id)
  );

  return v_lead_id;
end $$;

-- EXECUTE yüzeyi: anon + authenticated (form halka açıktır; rol guard'ı
-- gerekmez çünkü fonksiyon zaten mutasyonun kendi doğrulaması ve rate
-- limitiyle korunur; diğer tablolara doğrudan dokunma yetkisi RLS'ten geçemez).
revoke execute on function submit_web_lead(text, text, uuid, uuid, text, text, text) from public;
grant execute on function submit_web_lead(text, text, uuid, uuid, text, text, text) to anon, authenticated;

commit;
