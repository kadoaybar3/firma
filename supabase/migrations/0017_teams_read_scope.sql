-- =========================================================
-- FİRMA REHBERİ — 0017 ekip satır okumasının daraltılması
--
-- AMAÇ: 0015'te `authenticated read teams` politikası `using (true)` ile
--   tüm oturum sahiplerine açılmıştı; uygulama bunu GEREKTİRMİYOR:
--   tüm ekip listesi UI'ı 0015 `teams_overview` görünümünden okunuyor
--   (repo.listTeamsOverview), temsilcinin ham `teams` satırına ihtiyacı
--   yalnız KENDİ ekibindedir (repo.getMyTeam: ad + leader_rep_id).
--   Böylece her temsilcinin diğer ekiplerin `created_by` (auth uid) dahil
--   satırlarını API'den okuması kapanır.
--
-- ETKİ:
--   * admin: `admin full teams` (0011, for all) aynen durur → tüm satırlar.
--   * temsilci: yalnız `id = current_team_id()` (kendi ekibi); ekipte
--     olmayan temsilci teams satırı göremez (browse zaten görünüm üzerinden).
--   * anon: policy yok → okuyamaz (değişen bir şey yok).
--   * YAZMA politikaları değişmez: teams'a yazma yalnız 0011 admin full.
--
-- DEĞİŞMEYENLER: tablo/kolon şeması, fonksiyonlar, trigger'lar,
--   `admin full teams` politikası, `teams_overview` görünümü, diğer
--   tabloların tüm RLS politikaları, veri.
--
-- ÖNKOŞUL: 0011 (current_team_id + admin full teams), 0015 (bu politikanın
--   mevcut hali).
--
-- ROLLBACK:
--   drop policy if exists "authenticated read teams" on public.teams;
--   create policy "authenticated read teams" on public.teams
--     for select to authenticated using (true);
-- =========================================================

begin;

drop policy if exists "authenticated read teams" on public.teams;

create policy "authenticated read teams" on public.teams
  for select to authenticated
  using (current_app_role() = 'temsilci'::app_role and id = current_team_id());

commit;
