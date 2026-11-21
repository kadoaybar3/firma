-- FİRMA REHBERİ — Firma yayınlama güvenliği (A-3)
--
-- AMAÇ: Firma yayınlama/geri alma kararını veritabanı seviyesinde TEK bir
-- kural ve TEK bir denetim kaynağına bağlamak. `published` alanı RLS admin'e
-- tam yetki verdiği için doğrudan PostgREST UPDATE'i ile yazılabiliyordu;
-- "satış ödendi + ödeme onaylı" kontrolü yalnız tarayıcıda uygulanıyordu.
--
-- TASARIM (onaylanan güvenlik düzeltmesi):
--   1) `guard_company_publish()` BEFORE UPDATE trigger — yayın geçişi
--      kurallarının ve UPDATE audit'inin TEK sahibi. Admin kontrolü, normal
--      firmada `odendi` satış + ona bağlı `onaylandi` ödeme şartı, scraper
--      istisnası ve `socials.source` değişmezliği burada uygulanır.
--   2) `guard_company_publish_insert()` AFTER INSERT trigger — yalnız
--      GERÇEKTEN eklenen satırı denetler ve scraper audit'ini yazar. AFTER
--      INSERT, `ON CONFLICT DO UPDATE` çakışmasında hiç çalışmadığı için
--      sahte INSERT audit'i oluşmaz; satır gerçekten eklendiği için audit
--      `new.id` ile eklenen satıra bağlanır. INSERT anındaki
--      `not exists (...)` tahmini kullanılmaz (eşzamanlı UPSERT'te yanıltıcı).
--   3) `set_company_published(uuid, boolean)` — ince sarmalayıcı: yalnız admin
--      kapısı, satır kilidi, idempotency ve UPDATE. İş kuralı/audit yazmaz;
--      böylece RPC ile trigger arasında çift denetim veya çift audit oluşmaz.
--   4) GUC YOK: `app.company_publish_rpc` mekanizması tamamen kaldırıldı.
--      Kuralları geçen her yol (RPC ya da doğrudan UPDATE) aynı doğrulamadan
--      geçer ve aynı tek audit kaydını üretir; kuralları geçmeyen hiçbir yol
--      yayınlayamaz.
--   5) Audit: mevcut `log_audit` kullanılır; ikinci bir denetim sistemi YOK.
--      Audit yalnız trigger'larda yazılır; admin kapısı sayesinde `actor_role`
--      her zaman 'admin' olur (NULL aktör yolu kalmaz).
--
-- DEĞİŞMEYENLER: mevcut RLS politikaları, tablo/kolon şeması, ödeme/satış
--   RPC'leri (confirm_sale / verify_payment_manual / confirm_renewal) ve
--   `log_audit`. Yeni tablo/kolon eklenmez.
--
-- ÖNKOŞUL: 0001 (companies/audit_log/log_audit/current_app_role), 0002
--   (log_audit EXECUTE kısıtı), 0007 (companies koordinatları), 0014
--   (confirm_sale güncel gövde).
--
-- UYGULAMA SONRASI DOĞRULAMA (salt okunur):
--   psql> select proname, prosecdef, proconfig from pg_proc where proname in
--          ('set_company_published','guard_company_publish','guard_company_publish_insert');
--   psql> select count(*) from pg_proc where prosrc like '%company_publish_rpc%'; -- 0
--   psql> select tgname from pg_trigger where tgrelid = 'public.companies'::regclass;
--   psql> select has_function_privilege('anon',
--          'public.set_company_published(uuid, boolean)', 'EXECUTE'); -- false
--   psql> select has_function_privilege('service_role',
--          'public.set_company_published(uuid, boolean)', 'EXECUTE'); -- false
--   psql> select has_function_privilege('authenticated',
--          'public.set_company_published(uuid, boolean)', 'EXECUTE'); -- true
--   psql> select has_function_privilege('authenticated',
--          'public.guard_company_publish()', 'EXECUTE'); -- false
--   psql> select has_function_privilege('authenticated',
--          'public.guard_company_publish_insert()', 'EXECUTE'); -- false
--
-- GERİ ALMA (rollback):
--   drop trigger if exists companies_guard_publish on public.companies;
--   drop trigger if exists companies_scraper_insert_audit on public.companies;
--   drop function if exists public.guard_company_publish();
--   drop function if exists public.guard_company_publish_insert();
--   drop function if exists public.set_company_published(uuid, boolean);
--   drop function if exists public.set_company_published(uuid, boolean, text); -- eski imza
--
-- NOT: Bu dosya canlıya UYGULANMADI; yalnız hazırlandı.

begin;

-- ---------- 1) Yayınlama / yayından kaldırma RPC'si ----------
-- Eski 3 argümanlı imza (p_note) bilinçli olarak kaldırıldı: audit'i yalnız
-- trigger yazar, not alanı audit detayında null kalır. İstemci aynı sürümde
-- yeni imzayla çıkar.
drop function if exists public.set_company_published(uuid, boolean, text);

create or replace function public.set_company_published(
  p_company_id uuid,
  p_published boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c companies;
begin
  -- Yetki: yalnız admin. (service_role'de auth.uid() null → current_app_role()
  -- null döner; bu yüzden service_role de bu RPC'yi kullanamaz. Bilinçli:
  -- yayın kararı bir kullanıcı kararıdır ve audit'e o kullanıcı yazılır.)
  if current_app_role() is distinct from 'admin'::app_role then
    raise exception 'Yalnızca yönetici firma yayın durumunu değiştirebilir.'
      using errcode = '42501';
  end if;
  if p_published is null then
    raise exception 'Yayın durumu belirtilmedi.';
  end if;

  -- Satır kilidi: eşzamanlı yayın/geri alma çağrıları sıraya girer.
  select * into c from companies where id = p_company_id for update;
  if not found then
    raise exception 'Firma bulunamadı.';
  end if;

  -- Idempotent: durum zaten istenen değerdeyse yazma ve audit üretilmez.
  if c.published = p_published then
    return;
  end if;

  -- İş kuralı (satış/ödeme/scraper) ve audit trigger'dadır; burada TEKRAR
  -- edilmez ki iki yerde kural tutarsızlığı oluşmasın.
  update companies
     set published = p_published,
         updated_at = now()
   where id = c.id;
end;
$$;

revoke execute on function public.set_company_published(uuid, boolean) from public, anon, service_role;
grant execute on function public.set_company_published(uuid, boolean) to authenticated;

-- ---------- 2) BEFORE UPDATE: yayın geçişi kuralı ve audit ----------
-- SECURITY DEFINER: log_audit'i çağırabilmek için (0002 log_audit EXECUTE'unu
-- authenticated'dan aldı). search_path sabit.
--
-- INSERT bu fonksiyonda ELE ALINMAZ: gerçek INSERT'i güvenilir biçimde
-- yalnız AFTER INSERT trigger'ı ayırt edebilir (aşağıdaki 3. bölüm). Böylece
-- `not exists (...)` tahmini ve eşzamanlı UPSERT belirsizliği kalmaz.
create or replace function public.guard_company_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scraper boolean;
  v_sale_id uuid;
  v_payment_id uuid;
begin
  v_scraper := coalesce(new.socials ->> 'source', '') = 'google-maps-scraper';

  -- ============================== UPDATE ==============================
  -- D-1: kaynak değişmezliği. Scraper işareti yalnız INSERT'te yazılabilir;
  -- böylece normal bir firma sonradan scraper işaretlenip ödeme kontrolünü
  -- atlayamaz, mevcut işaret de kazara silinemez.
  if new.socials ->> 'source' is distinct from old.socials ->> 'source' then
    raise exception 'Firma kaynağı (socials.source) değiştirilemez.'
      using errcode = '42501';
  end if;

  -- Yayın durumu değişmiyorsa kural/audit yok (idempotent yazımlar sessiz).
  if new.published is not distinct from old.published then
    return new;
  end if;

  -- Yayın geçişi: yalnız admin. Bu kapı aynı zamanda audit'in actor_role
  -- değerini garanti eder (log_audit current_app_role() yazar → 'admin').
  if current_app_role() is distinct from 'admin'::app_role then
    raise exception 'Firma yayın durumunu yalnızca yönetici değiştirebilir.'
      using errcode = '42501';
  end if;

  v_sale_id := null;
  v_payment_id := null;

  if new.published and not v_scraper then
    -- Normal firma: kesinleşmiş (odendi) satış aranır.
    select s.id into v_sale_id
    from sales s
    where s.company_id = old.id
      and s.status = 'odendi'
    order by s.confirmed_at desc nulls last, s.created_at desc
    limit 1;
    if v_sale_id is null then
      raise exception 'Firma yayına alınamaz: kesinleşmiş (ödendi) satış kaydı bulunmuyor.';
    end if;

    -- O satışa bağlı onaylanmış ödeme aranır (sağlayıcı ya da EFT/manuel).
    select p.id into v_payment_id
    from payments p
    where p.sale_id = v_sale_id
      and p.status = 'onaylandi'
    order by p.updated_at desc
    limit 1;
    if v_payment_id is null then
      raise exception 'Firma yayına alınamaz: satışa bağlı onaylanmış ödeme kaydı bulunmuyor.';
    end if;
  end if;

  -- UPDATE audit'inin TEK yazıcısı burasıdır (RPC yazmaz; INSERT audit'i
  -- AFTER INSERT trigger'ındadır). Geçiş başına tek kayıt.
  perform log_audit(
    case
      when new.published and v_scraper then 'firma_yayinlandi_scraper'
      when new.published then 'firma_yayinlandi'
      else 'firma_yayindan_kaldirildi'
    end,
    case
      when new.published and v_scraper
        then format('%s scraper kaynağından ödemesiz yayına alındı', new.name)
      when new.published then format('%s yayına alındı', new.name)
      else format('%s yayından kaldırıldı', new.name)
    end,
    jsonb_build_object(
      'company_id', old.id,
      'company_name', new.name,
      'action', case when new.published then 'yayinla' else 'yayindan_kaldir' end,
      'previous_published', old.published,
      'published', new.published,
      'source', case when v_scraper then 'google-maps-scraper' else 'normal' end,
      'payment_exempt', (new.published and v_scraper),
      'sale_id', v_sale_id,
      'payment_id', v_payment_id,
      'note', null
    )
  );

  return new;
end;
$$;

-- ---------- 3) AFTER INSERT: scraper doğrulaması ve INSERT audit'i ----------
-- AFTER ROW INSERT yalnız GERÇEKTEN eklenen satırlar için çalışır;
-- `ON CONFLICT DO UPDATE` çakışmasında hiç tetiklenmez. Bu yüzden:
--   * sahte INSERT audit'i imkânsızdır (çakışan satırın audit'i UPDATE
--     trigger'ında, gerçek yayın geçişi varsa üretilir),
--   * audit `new.id` ile eklenen satıra bağlıdır,
--   * eşzamanlı iki INSERT yarışında yalnız başarıyla eklenen satır audit
--     üretir (kaybeden INSERT zaten hata alır ve geri alınır).
-- Doğrulama burada yapılır: normal bir firma yayında doğamaz, ödemesiz
-- yayın yalnız `google-maps-scraper` kaynağıyla eklenen firmaya açıktır ve
-- kararı yalnız admin verebilir. Hata AFTER aşamasında yükseltildiğinde
-- INSERT'in tamamı (ve audit'i) aynı transaction içinde geri alınır.
create or replace function public.guard_company_publish_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Yayında doğmayan satırlar için kural/audit yok (taslak firmalar).
  if not new.published then
    return null;
  end if;

  if current_app_role() is distinct from 'admin'::app_role then
    raise exception 'Yalnızca yönetici yayında firma oluşturabilir.'
      using errcode = '42501';
  end if;

  if coalesce(new.socials ->> 'source', '') <> 'google-maps-scraper' then
    raise exception 'Firma yayında oluşturulamaz: yayın yalnız set_company_published RPC''si veya scraper içe aktarma ile yapılır.'
      using errcode = '42501';
  end if;

  -- Gerçekten eklenen satır (new.id); INSERT ile aynı transaction'da atomik.
  perform log_audit(
    'firma_yayinlandi_scraper',
    format('%s scraper kaynağından ödemesiz yayına alındı', new.name),
    jsonb_build_object(
      'company_id', new.id,
      'company_name', new.name,
      'action', 'yayinla',
      'previous_published', false,
      'published', true,
      'source', 'google-maps-scraper',
      'payment_exempt', true,
      'sale_id', null,
      'payment_id', null,
      'note', null
    )
  );

  return null;
end;
$$;

-- D-3: trigger fonksiyonları doğrudan çağrılamaz; varsayılan PUBLIC EXECUTE
-- yetkisi yine de kapatılır.
revoke execute on function public.guard_company_publish() from public, anon, authenticated;
revoke execute on function public.guard_company_publish_insert() from public, anon, authenticated;

drop trigger if exists companies_guard_publish on public.companies;
drop trigger if exists companies_scraper_insert_audit on public.companies;

-- Yayın geçişi kuralı + UPDATE audit'i (tekil).
create trigger companies_guard_publish
  before update on public.companies
  for each row execute function public.guard_company_publish();

-- Yalnız gerçek INSERT'te scraper doğrulaması + audit.
create trigger companies_scraper_insert_audit
  after insert on public.companies
  for each row execute function public.guard_company_publish_insert();

commit;
