-- =========================================================
-- FİRMA REHBERİ — 0019 etkileşim sayaçları: okuma yetkisinin dar kapsamlı
-- onarımı (GRANT + RLS)
--
-- KÖK NEDEN (canlı Supabase):
--   `0018_company_engagement.sql` iki tabloyu oluşturur ve BİLİNÇLİ olarak
--   yalnız `authenticated` rolüne SELECT verir:
--       revoke all on public.company_engagement_counters from anon, public;
--       grant select on public.company_engagement_counters to authenticated;
--   İstemci ise `loadSnapshot()` ile TÜM tabloları TEK `Promise.all` içinde
--   okur ve ilk hatada görüntünün tamamını düşürür. Anon oturumda (kamu
--   sitesi, giriş ekranı, çıkış sonrası) bu iki tablo da sorgulandığı için
--   PostgREST GRANT aşamasında
--      42501 permission denied for table company_engagement_counters
--   döner — RLS'e hiç gelinmez (RLS "0 satır" verirdi, GRANT hatası verir).
--   Yani hata RLS politikasının değil, ANON için hiç yetki olmamasının ve
--   istemcinin bu tabloları anon görüntüsünde de okumasının sonucudur.
--   İstemci tarafı düzeltmesi: `loadSnapshot({ includeEngagement })` — sayaç
--   tabloları yalnız yönetici görüntüsünde okunur (`src/lib/auth.tsx`).
--
-- BU DOSYA NE YAPAR:
--   * Tabloların RLS'i AÇIK kalır (kapatılmaz).
--   * Yönetici okuması 0018 ile AYNI politikayla korunur:
--       authenticated + current_app_role() = 'admin' → SELECT.
--   * anon/public için hiçbir yetki ve hiçbir politika bırakılmaz.
--   * authenticated rolünün INSERT/UPDATE/DELETE yetkisi YOKTUR: yazma
--     yalnız `track_company_engagement` RPC'sinde (security definer) kalır.
--   * 0018'i yeniden koşmaz, tablo/kolon oluşturmaz, RPC'yi DEĞİŞTİRMEZ.
--   Neden gerekli: canlı projede tablo 0018'den farklı bir sırada/elle
--   oluşturulduysa veya GRANT'lar hiç uygulanmadıysa yönetici okuması da
--   eksik kalır; bu dosya yetki durumunu deterministik ve idempotent hale
--   getirir.
--
-- ÖNKOŞUL: 0018 uygulanmış olmalı (tablolar mevcut).
--
-- UYGULAMA: Supabase Dashboard → SQL Editor → dosyanın tamamını tek seferde
--   koşun. CLI: `supabase db push`.
--
-- DOĞRULAMA (salt okunur):
--   select has_table_privilege('anon',
--     'public.company_engagement_counters', 'SELECT');        -- false
--   select has_table_privilege('authenticated',
--     'public.company_engagement_counters', 'SELECT');        -- true
--   select has_table_privilege('authenticated',
--     'public.company_engagement_counters', 'INSERT');        -- false
--   select polname, polroles::regrole[], pg_get_expr(polqual, polrelid)
--     from pg_policy where polrelid =
--       'public.company_engagement_counters'::regclass;       -- admin policy
--   -- Yönetici oturumuyla:
--   select count(*) from public.company_engagement_counters;  -- hata DEĞİL
--   -- Anon REST (curl, apikey=anon):
--   --   /rest/v1/company_engagement_counters → 401/403, veri dönmez
--
-- GERİ ALMA: 0018 ile aynı yetkiler zaten hedeflenir; geri alma gerekmez.
--   (Acil geri dönüş gerekirse: revoke select on ... from authenticated;
--    ancak bu, yönetici okumasını da kapatır.)
-- =========================================================

begin;

-- ---------- 0) Önkoşul denetimi (0018 uygulanmamışsa anlaşılır hata) ----------
do $$
begin
  if to_regclass('public.company_engagement_counters') is null
     or to_regclass('public.company_engagement_notifications') is null then
    raise exception '0018 uygulanmamış: company_engagement_* tabloları yok. Önce 0018_company_engagement.sql koşun.';
  end if;
end $$;

-- ---------- 1) RLS AÇIK kalır (kapatılmaz) ----------
alter table public.company_engagement_counters enable row level security;
alter table public.company_engagement_notifications enable row level security;

-- ---------- 2) Okuma politikası: yalnız yönetici (0018 ile aynı kural) ----------
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

-- ---------- 3) Yetkiler: anon/public hiçbir şey; authenticated yalnız SELECT ----------
revoke all on public.company_engagement_counters from anon, public;
revoke all on public.company_engagement_notifications from anon, public;

revoke insert, update, delete on public.company_engagement_counters from authenticated;
revoke insert, update, delete on public.company_engagement_notifications from authenticated;

grant select on public.company_engagement_counters to authenticated;
grant select on public.company_engagement_notifications to authenticated;

-- ---------- 4) Kendi kendini doğrulama: yanlış durumda transaction geri alınır ----------
do $$
declare
  v_has_anon boolean;
  v_auth_select boolean;
  v_auth_write boolean;
begin
  -- anon rolü Supabase'de vardır; yoksa (self-hosted) bu kontrol atlanır.
  v_has_anon := to_regrole('anon') is not null;

  if v_has_anon then
    if has_table_privilege('anon', 'public.company_engagement_counters', 'SELECT')
       or has_table_privilege('anon', 'public.company_engagement_notifications', 'SELECT') then
      raise exception 'anon için SELECT yetkisi hâlâ açık — revoke uygulanmadı.';
    end if;
  end if;

  select has_table_privilege('authenticated', 'public.company_engagement_counters', 'SELECT')
     and has_table_privilege('authenticated', 'public.company_engagement_notifications', 'SELECT')
    into v_auth_select;

  select has_table_privilege('authenticated', 'public.company_engagement_counters', 'INSERT')
      or has_table_privilege('authenticated', 'public.company_engagement_counters', 'UPDATE')
      or has_table_privilege('authenticated', 'public.company_engagement_counters', 'DELETE')
    into v_auth_write;

  if not v_auth_select then
    raise exception 'authenticated SELECT verilemedi — yönetici sayaçları okuyamaz.';
  end if;

  if v_auth_write then
    raise exception 'authenticated için yazma yetkisi açık kaldı — sayaçlar yalnız RPC ile artmalı.';
  end if;
end $$;

commit;
