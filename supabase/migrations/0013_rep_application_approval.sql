-- =========================================================
-- FİRMA REHBERİ — 0013 yönetici başvuru onayı / reddi
-- Kapsam: Yalnız yöneticinin başvuru inceleme-onaylama-red işlemi.
--   * Onay: referans personeli + ekip SUNUCUDA yeniden doğrulanır, ekip
--     kapasitesi yeniden kontrol edilir, yeni personel kaydı (Auth uid ile
--     profiles + sales_reps) TEK transaction'da oluşur, başvuru
--     'onaylandi' olur. Hata → tam rollback (yarım hesap / onaylı ama
--     hesabı olmayan başvuru KALMAZ; Auth kullanıcısını Netlify Function
--     geri siler — bkz. approve-rep-application.mts).
--   * Red: yalnız yönetici; kayıt silinmez ('reddedildi' olarak kalır,
--     denetim geçmişi korunur). Sonuçlanmış başvuruya tekrar onay/red
--     verilemez (FOR UPDATE + status kilidi — yarış kapalı).
--   * RLS daraltılır: admin artık doğrudan UPDATE/DELETE YAPAMAZ;
--     tüm geçişler yalnız bu RPC'lerden olur (arayüz değil DB katmanı).
--
-- ÖNKOŞUL: 0001 (sales_reps/profiles/audit_log), 0002, 0011 (teams +
--   kapasite trigger'ı), 0012 (rep_applications) uygulanmış olmalı.
--   Sıra: 0001→…→0011→0012→0013.
--
-- UYGULAMA (bilinçli elle — 0011/0012 ile birlikte, kod deploy'undan ÖNCE):
--   Supabase Dashboard → SQL Editor → tüm dosyayı tek seferde koş.
--   VEYA CLI: supabase db push.
--
-- YETKİ ZİNCİRİ (üç katman):
--   1. İstemci: yalnız admin rolü onay/red düğmelerini görür.
--   2. Netlify Function (onay): Bearer token → auth.getUser + profiles
--      role='admin' doğrulaması (admin-create-user.mts deseni); Auth
--      kullanıcısı service_role ile açılır; service_role anahtarı istemciye
--      AÇILMAZ (VITE_ yok).
--   3. DB: RPC'ler SECURITY DEFINER + guard
--      `current_app_role() <> 'admin' → raise`. service_role çağrısında
--      auth.uid() null → current_app_role() null → guard PASS (yalnızca
--      Netlify Function yolu); authenticated temsilci → raise; anon'un
--      EXECUTE hakkı YOKTUR.
--
-- UYGULAMA SONRASI DOĞRULAMA:
--   psql> select policyname, cmd from pg_policies where tablename='rep_applications';
--   -- beklenen: yalnız "admin read rep applications" (SELECT) — full policy yok
--   psql> select proname, prosecdef from pg_proc
--         where proname in ('approve_rep_application','reject_rep_application');
--   -- beklenen: true, true
--   psql> select has_function_privilege('anon',
--         'approve_rep_application(uuid,uuid)', 'EXECUTE');  -- false
--   psql> select has_function_privilege('authenticated',
--         'approve_rep_application(uuid,uuid)', 'EXECUTE');  -- true
--
-- ROLLBACK (kaldırma sırası):
--   begin;
--   drop function if exists approve_rep_application(uuid, uuid);
--   drop function if exists reject_rep_application(uuid);
--   drop policy if exists "admin read rep applications" on public.rep_applications;
--   -- 0012'deki orijinal politika yeniden oluşturulur:
--   -- create policy "admin full rep applications" on public.rep_applications for all
--   --   using (current_app_role() = 'admin') with check (current_app_role() = 'admin');
--   commit;
--   (Başvuru satırları, sales_reps, profiles bu rollback'e dahil DEĞİLDİR
--    — veri kaybı olmaz; onaylanmış kayıtlar aynen kalır.)
-- =========================================================

begin;

-- ---------- 1) RLS daraltma: admin yalnız OKUR, geçişler yalnız RPC ----------
-- Onay/red işlemi kapasite + hesap oluşturmayı içerdiğinden doğrudan
-- UPDATE yolu kapatılır; 0012'deki "for all" politikası düşürülür.
drop policy if exists "admin full rep applications" on public.rep_applications;

create policy "admin read rep applications" on public.rep_applications for select
  using (current_app_role() = 'admin');
-- anon/authenticated-temsilci için SELECT policy'si YOK → başvuru
-- listesi yalnız yöneticiye görünür (0012 kuralı korunur).

-- ---------- 2) ONAY: tek güvenli sunucu tarafı işlem ----------
-- p_auth_user_id: Netlify Function'ın az önce açtığı Auth kullanıcısı.
-- profiles.id → auth.users(id) FK olduğundan ONAY ÖNCE Auth kullanıcısı
-- açılır; bu fonksiyon HATA VERİRSE Function kullanıcısını siler
-- (yarım hesap kalmaz). Fonksiyonun kendi yazımı tek transaction'dır:
-- sales_reps + profiles + durum değişikliği birlikte geri alınabilir.
create or replace function approve_rep_application(
  p_application_id uuid,
  p_auth_user_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_app record;
  v_ref_rep uuid;
  v_ref_team uuid;
  v_cap int;
  v_count int;
  v_max int;
  v_code text;
  v_name text;
  v_new_rep uuid;
begin
  -- ---- Yetki: yalnız yönetici (service_role → null → geçer; bkz. başlık) ----
  if current_app_role() <> 'admin' then
    raise exception 'yetkisiz';
  end if;
  if p_auth_user_id is null then
    raise exception 'auth_user_id eksik.';
  end if;

  -- ---- Başvuruyu kilitle + beklemede olduğunu doğrula ----
  -- FOR UPDATE: eşzamanlı iki onay/red aynı satırda sıraya girer;
  -- ikincisi "zaten sonuçlandırılmış" hatası alır.
  select * into v_app from rep_applications where id = p_application_id for update;
  if not found then
    raise exception 'Başvuru bulunamadı.';
  end if;
  if v_app.status <> 'beklemede' then
    raise exception 'Bu başvuru zaten sonuçlandırılmış (durum: %).', v_app.status;
  end if;

  -- ---- Referans personeli yeniden doğrula (başvuru sonucunda değişmiş olabilir) ----
  select sr.id, sr.team_id into v_ref_rep, v_ref_team
  from sales_reps sr
  where sr.id = v_app.referral_rep_id and sr.status = 'aktif';
  if v_ref_rep is null then
    raise exception 'Referans personeli doğrulanamadı (kayıt yok veya pasif).';
  end if;

  -- ---- Ekip bilgisini yeniden doğrula + kapasiteyi yeniden kontrol et ----
  if v_app.team_id is not null then
    if not exists (select 1 from teams t where t.id = v_app.team_id) then
      raise exception 'Başvurunun bağlı olduğu ekip artık yok.';
    end if;
    -- Başvuru anındaki ekip, referans personelin ŞİMDİ ekibiyle aynı mı?
    -- (Personel ekibini değiştirdiyse/onaylanan başvuru yeniden değerlendirilir.)
    if v_ref_team is distinct from v_app.team_id then
      raise exception 'Referans personelin ekibi değişmiş; başvuru yeniden değerlendirilmelidir.';
    end if;
    -- Kapasite yeniden kontrol (lider dahil kişi sayısı). 0011 trigger'ı
    -- sales_reps INSERT'inde yine koşar — çift katman.
    select coalesce((select team_capacity from app_settings where id = 1), 15) into v_cap;
    select count(*) into v_count from sales_reps where team_id = v_app.team_id;
    if v_count + 1 > v_cap then
      raise exception 'Ekip kapasitesi dolu: kapasite % kişi (lider dahil). Onay yapılamaz.', v_cap;
    end if;
  end if;

  -- ---- Yeni personel kaydı: mevcut kod üretim mantığıyla uyumlu (AF-xxx) ----
  -- unique(code) yarışta exception fırlatır → tam rollback (Function
  -- Auth kullanıcısını siler, tekrar denenebilir).
  select coalesce(max((regexp_replace(code, '^AF-', ''))::int), 0) into v_max
  from sales_reps where code ~ '^AF-[0-9]+$';
  v_code := 'AF-' || lpad((v_max + 1)::text, 3, '0');
  v_name := btrim(v_app.first_name || ' ' || v_app.last_name);

  insert into sales_reps (name, phone, code, status, team_id)
  values (v_name, v_app.phone, v_code, 'aktif', v_app.team_id)
  returning id into v_new_rep;

  -- ---- profiles bağlantısı: admin-create-user.mts ile aynı alanlar ----
  -- Yeni Auth kullanıcısında profil normalde yoktur; upsert mevcut
  -- mekanizmayla aynı biçimde yarışa da kapalıdır.
  insert into profiles (id, full_name, role, sales_rep_id)
  values (p_auth_user_id, v_name, 'temsilci', v_new_rep)
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        sales_rep_id = excluded.sales_rep_id;

  -- ---- Başvuru sonucu (yukarıdaki tüm adımlarla birlikte atomik) ----
  update rep_applications set status = 'onaylandi' where id = p_application_id;

  -- ---- Denetim: tanımsal bağlam; auth.uid() service_role'de null ----
  insert into audit_log (actor_id, actor_role, action, summary, detail)
  values (
    auth.uid(),
    coalesce(current_app_role()::text, 'sistem'),
    'personel_basvurusu_onaylandi',
    'Personel başvurusu onaylandı: ' || v_name,
    jsonb_build_object(
      'application_id', p_application_id,
      'rep_id', v_new_rep,
      'code', v_code,
      'referral_rep_id', v_app.referral_rep_id,
      'team_id', v_app.team_id
    )
  );

  return v_new_rep;
end $$;

revoke execute on function approve_rep_application(uuid, uuid) from public;
grant execute on function approve_rep_application(uuid, uuid) to authenticated, service_role;

-- ---------- 3) RED: yalnız yönetici; kayıt silinmez ----------
create or replace function reject_rep_application(p_application_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_app record;
begin
  if current_app_role() <> 'admin' then
    raise exception 'yetkisiz';
  end if;

  select * into v_app from rep_applications where id = p_application_id for update;
  if not found then
    raise exception 'Başvuru bulunamadı.';
  end if;
  if v_app.status <> 'beklemede' then
    raise exception 'Bu başvuru zaten sonuçlandırılmış (durum: %).', v_app.status;
  end if;

  -- Kayıt silinmez: denetim geçmişi korunur.
  update rep_applications set status = 'reddedildi' where id = p_application_id;

  insert into audit_log (actor_id, actor_role, action, summary, detail)
  values (
    auth.uid(),
    coalesce(current_app_role()::text, 'sistem'),
    'personel_basvurusu_reddedildi',
    'Personel başvurusu reddedildi: ' || btrim(v_app.first_name || ' ' || v_app.last_name),
    jsonb_build_object(
      'application_id', p_application_id,
      'referral_rep_id', v_app.referral_rep_id
    )
  );
end $$;

revoke execute on function reject_rep_application(uuid) from public;
grant execute on function reject_rep_application(uuid) to authenticated, service_role;

commit;
