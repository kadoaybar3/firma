import { describe, expect, it } from "vitest";
import initSql from "../../supabase/migrations/0001_init.sql?raw";
import hardeningSql from "../../supabase/migrations/0002_security_hardening.sql?raw";
import teamsSql from "../../supabase/migrations/0011_teams.sql?raw";
import repAppsSql from "../../supabase/migrations/0012_rep_applications.sql?raw";
import approveSql from "../../supabase/migrations/0013_rep_application_approval.sql?raw";
import confirmSaleSql from "../../supabase/migrations/0010_confirm_sale_rep_commission_percent.sql?raw";
import teamComSql from "../../supabase/migrations/0014_team_commissions.sql?raw";
import joinSql from "../../supabase/migrations/0015_team_join_applications.sql?raw";
import teamsScopeSql from "../../supabase/migrations/0017_teams_read_scope.sql?raw";

/**
 * Migration güvenlik regresyon testleri (statik).
 * Bu repo'da canlı bir Supabase projesi yok; bu testler, migration
 * dosyalarında daha önce onaylanan güvenlik invariant'larının yanlışlıkla
 * geri alınmasını engeller:
 *  - K1: PostgreSQL RESERVED keyword'ü (current_role) ile fonksiyon/policy
 *    tanımlanamaz; custom rol fonksiyonu current_app_role olmalı.
 *  - K2: profiles RLS'siz bırakılamaz (self-escalation boşluğu).
 *  - H1: log_audit EXECUTE yüzeyi kapalı, service_role açık.
 *  - H2: yenileme mükerrerlik endeksi yalnız AÇIK (potansiyel) yenilemelere bakar.
 *  - H3: verify_payment_manual tutar çapraz doğrulaması içerir.
 */

describe("migration güvenlik invariantları", () => {
  it("hiçbir migration RESERVED keyword current_role ile fonksiyon/policy tanımlamaz (K1)", () => {
    // söz-sınırlı arama: current_sales_rep_id gibi adlarla karışmasın
    expect(initSql).not.toMatch(/(^|[^\w])current_role\s*\(/);
    expect(hardeningSql).not.toMatch(/(^|[^\w])current_role\s*\(/);
    expect(initSql).toContain("create or replace function current_app_role()");
  });

  it("profiles tablosu RLS altında ve self-escalation kapatılmış (K2)", () => {
    expect(initSql).toMatch(/alter\s+table\s+profiles\s+enable\s+row\s+level\s+security/);
    expect(initSql).toMatch(/policy "profiles self insert"[\s\S]*role = 'temsilci'/);
    expect(initSql).toMatch(/policy "profiles admin write"/);
  });

  it("policy helper'ları anon için AÇIK, log_audit anon için KAPALI (H1+B1)", () => {
    expect(hardeningSql).toMatch(
      /revoke execute on function log_audit\(text, text, jsonb\) from public, anon, authenticated;/,
    );
    expect(hardeningSql).toMatch(/grant execute on function log_audit\(text, text, jsonb\) to service_role;/);
    // B1: RLS policy'leri her rol için değerlendirildiğinden, policy'lerin
    // kullandığı yardımcı fonksiyonlara anon execute hakkı ZORUNLUDUR —
    // yoksa anon-okuma akışı "permission denied" atar.
    expect(hardeningSql).toMatch(/revoke execute on function current_app_role\(\) from public;/);
    expect(hardeningSql).toMatch(/grant execute on function current_app_role\(\) to anon, authenticated, service_role;/);
    expect(hardeningSql).not.toMatch(
      /revoke execute on function current_app_role\(\) from [^\n]*(anon|authenticated)/,
    );
  });

  it("yenileme mükerrerlik endeksi yalnız AÇIK yenilemelere bakar (H2)", () => {
    const [before, after] = hardeningSql.split("create unique index if not exists sales_open_renewal_unique");
    expect(before).toBeTruthy(); // index ifadesi dosyada geçmeli
    expect(after).toContain("status = 'potansiyel'");
    // iptal edilmiş yenileme gelecek yenilemeyi kilitlememeli: predicate
    // yalnız 'potansiyel' durumunu içeriyor
  });

  it("verify_payment_manual tutar çapraz doğrulaması içerir (H3)", () => {
    expect(hardeningSql).toMatch(
      /verify_payment_manual[\s\S]*amount\s*=\s*\(select s\.amount from sales/,
    );
  });

  it("begin/commit bloğu tamamlanmış (tek transaction)", () => {
    expect(hardeningSql).toMatch(/(^|\n)begin;\s*\n/);
    expect(hardeningSql).toMatch(/(^|\n)commit;\s*\n/);
  });
});

describe("0011 ekip altyapısı güvenlik invariantları", () => {
  it("teams RLS altında; rep yalnız kendi ekibini okur, admin tam yetkili", () => {
    expect(teamsSql).toMatch(/alter table public\.teams enable row level security/);
    expect(teamsSql).toMatch(/policy "admin full teams" on public\.teams for all/);
    expect(teamsSql).toMatch(
      /policy "rep read own team" on public\.teams for select\s*\n?\s*using \(current_app_role\(\) = 'temsilci' and id = current_team_id\(\)\)/,
    );
    // sales_reps'e ekip arkadaşı okuması eklenir; YAZMA politikası değişmez
    // (ekipler arası transfer yalnız admin → "admin full sales_reps" durur).
    expect(teamsSql).toMatch(/team_id is not null and team_id = current_team_id\(\)/);
  });

  it("kapasite DB seviyesinde trigger'la zorlanır (yalnız arayüz değil)", () => {
    expect(teamsSql).toMatch(/create trigger trg_sales_reps_team_capacity/);
    expect(teamsSql).toMatch(/v_count \+ 1 > v_cap then/);
    expect(teamsSql).toMatch(/ekip kapasitesi doldu/);
    // lider kuralı: liderliği devredilmeden ekibinden ayrılamaz
    expect(teamsSql).toMatch(/ekip lideri kendi ekibinden ayrılamaz/);
  });

  it("hiyerarşi yok: teams'te üst/alt ekip referansı tanımlanmaz", () => {
    expect(teamsSql).not.toMatch(/parent_team|team_head|leader_team_id|superior_team/);
    expect(teamsSql).toMatch(/leader_rep_id uuid not null unique/);
  });

  it("create_team yalnız authenticated'e açık; anon execute yok", () => {
    expect(teamsSql).toMatch(/revoke execute on function create_team\(text\) from public, anon;/);
    expect(teamsSql).toMatch(/grant execute on function create_team\(text\) to authenticated, service_role;/);
    expect(teamsSql).toMatch(/if current_app_role\(\) <> 'temsilci' then\s*\n\s*raise exception 'yetkisiz';/);
  });

  it("mevcut satış/komisyon altyapısına dokunulmaz", () => {
    expect(teamsSql).not.toMatch(/confirm_sale|confirm_renewal|commissions|referral_reward|payments/);
    expect(teamsSql).toMatch(/(^|\n)begin;\s*\n/);
    expect(teamsSql).toMatch(/(^|\n)commit;\s*\n/);
    expect(teamsSql).not.toMatch(/(^|[^\w])current_role\s*\(/);
  });
});

describe("0012 referans başvurusu güvenlik invariantları", () => {
  it("rep_applications RLS altında; tek policy admin, anon okuma/yazma yok", () => {
    expect(repAppsSql).toMatch(/alter table public\.rep_applications enable row level security/);
    expect(repAppsSql).toMatch(
      /policy "admin full rep applications" on public\.rep_applications for all/,
    );
    // Başka hiçbir create policy yok → anon SELECT/INSERT/UPDATE/DELETE default-deny
    const policies = repAppsSql.match(/create policy [^;]+on public\.rep_applications/g) ?? [];
    expect(policies).toHaveLength(1);
  });

  it("yazma yalnız SECURITY DEFINER RPC; honeypot doluysa hiçbir şey yazılmaz", () => {
    expect(repAppsSql).toMatch(/function submit_rep_application[\s\S]*security definer/);
    expect(repAppsSql).toMatch(/if coalesce\(p_honeypot, ''\) <> '' then\s*\n\s*return null;/);
    expect(repAppsSql).toMatch(
      /revoke execute on function submit_rep_application\(text, text, text, text, text, text\) from public;/,
    );
    expect(repAppsSql).toMatch(
      /grant execute on function submit_rep_application\(text, text, text, text, text, text\) to anon, authenticated;/,
    );
  });

  it("ekip ve referans personeli SUNUCUDA çözülür; istemciden team_id/rep uuid gelmez", () => {
    expect(repAppsSql).not.toMatch(/p_team_id|p_rep_id|p_referral/);
    expect(repAppsSql).toMatch(/where sr\.code = v_ref and sr\.status = 'aktif'/);
    expect(repAppsSql).toMatch(/select sr\.id, sr\.team_id into v_rep, v_team/);
  });

  it("başvuru beklemede kaydedilir; hesap/Auth kullanıcısı OLUŞTURMAZ", () => {
    expect(repAppsSql).toMatch(
      /values \(v_first, v_last, v_phone, v_email, v_rep, v_team, 'beklemede'\)/,
    );
    expect(repAppsSql).toMatch(
      /status in \('beklemede', 'onaylandi', 'reddedildi'\)/,
    );
    expect(repAppsSql).not.toMatch(/auth\.admin|sign_up|auth\.users|insert into profiles/);
  });

  it("tekrar başvuru partial unique ile yarışa kapalı; rate limit 0006 aynası", () => {
    expect(repAppsSql).toMatch(/create unique index if not exists rep_applications_pending_email_uk/);
    expect(repAppsSql).toMatch(/create unique index if not exists rep_applications_pending_phone_uk/);
    expect(repAppsSql).toMatch(/where status = 'beklemede'/);
    expect(repAppsSql).toMatch(/md5\(btrim\(v_ip\)\)/);
    expect(repAppsSql).toMatch(/web_lead_rate/);
  });

  it("mevcut satış/komisyon altyapısına dokunulmaz", () => {
    expect(repAppsSql).not.toMatch(/confirm_sale|confirm_renewal|commissions/);
    expect(repAppsSql).toMatch(/(^|\n)begin;\s*\n/);
    expect(repAppsSql).toMatch(/(^|\n)commit;\s*\n/);
    expect(repAppsSql).not.toMatch(/(^|[^\w])current_role\s*\(/);
  });
});

describe("0013 başvuru onayı/reddi güvenlik invariantları", () => {
  // Yorum satırları (rollback notları dahil) doğrulamadan çıkarılır.
  const code = approveSql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  it("RLS daraltılır: admin yalnız SELECT; doğrudan UPDATE/DELETE policy'si yok", () => {
    expect(code).toMatch(
      /drop policy if exists "admin full rep applications" on public\.rep_applications/,
    );
    expect(code).toMatch(
      /create policy "admin read rep applications" on public\.rep_applications for select/,
    );
    // Yorumlar çıkarıldıktan sonra tek create policy'Sİ kalır: SELECT
    const policies = code.match(/create policy [^;]+/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatch(/for select/);
    expect(code).not.toMatch(/on public\.rep_applications for (all|update|delete)/);
  });

  it("her iki RPC de SECURITY DEFINER + admin guard; anon EXECUTE yok", () => {
    expect(approveSql).toMatch(/function approve_rep_application\([\s\S]*security definer/);
    expect(approveSql).toMatch(/function reject_rep_application\([\s\S]*security definer/);
    // service_role: auth.uid() null → current_app_role() null → guard PASS
    const guards = approveSql.match(/if current_app_role\(\) <> 'admin' then/g) ?? [];
    expect(guards).toHaveLength(2);
    expect(approveSql).toMatch(
      /revoke execute on function approve_rep_application\(uuid, uuid\) from public;/,
    );
    expect(approveSql).toMatch(
      /revoke execute on function reject_rep_application\(uuid\) from public;/,
    );
    expect(approveSql).toMatch(
      /grant execute on function approve_rep_application\(uuid, uuid\) to authenticated, service_role;/,
    );
    expect(approveSql).not.toMatch(/to anon,/);
    expect(approveSql).not.toMatch(/(^|[^\w])current_role\s*\(/);
  });

  it("onay: kilit + beklemede kontrolü; sonuçlanmış başvuruya tekrar geçiş yok", () => {
    expect(code).toMatch(/where id = p_application_id for update/);
    const statusChecks = code.match(/if v_app\.status <> 'beklemede' then/g) ?? [];
    expect(statusChecks).toHaveLength(2); // onay + red
    const finals = code.match(/zaten sonuçlandırılmış/g) ?? [];
    expect(finals).toHaveLength(2);
  });

  it("onay SUNUCUDA referans + ekip + kapasite yeniden doğrular", () => {
    expect(approveSql).toMatch(/where sr\.id = v_app\.referral_rep_id and sr\.status = 'aktif'/);
    expect(approveSql).toMatch(/if v_ref_team is distinct from v_app\.team_id then/);
    expect(approveSql).toMatch(/select count\(\*\) into v_count from sales_reps where team_id = v_app\.team_id/);
    expect(approveSql).toMatch(/if v_count \+ 1 > v_cap then/);
    expect(approveSql).toMatch(/Ekip kapasitesi dolu/);
  });

  it("tek transaction: sales_reps + profiles + onaylı durum birlikte yazılır", () => {
    expect(approveSql).toMatch(/insert into sales_reps \(name, phone, code, status, team_id\)/);
    expect(approveSql).toMatch(/insert into profiles \(id, full_name, role, sales_rep_id\)/);
    expect(approveSql).toMatch(/update rep_applications set status = 'onaylandi'/);
    expect(approveSql).toMatch(/update rep_applications set status = 'reddedildi'/);
    expect(approveSql).toMatch(/(^|\n)begin;\s*\n/);
    expect(approveSql).toMatch(/(^|\n)commit;\s*\n/);
    // Başvuru satırı asla silinmez (denetim geçmişi)
    expect(approveSql).not.toMatch(/delete from rep_applications/);
    expect(approveSql).not.toMatch(/truncate/);
  });

  it("mevcut satış/komisyon altyapısına dokunulmaz", () => {
    expect(approveSql).not.toMatch(/confirm_sale|confirm_renewal|commissions/);
  });
});

describe("0014 ekip liderliği komisyonu güvenlik invariantları", () => {
  // Yorum satırları (iş modeli/rollback notları dahil) doğrulamadan çıkarılır.
  const code = teamComSql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  /** İki dosyadaki bir SQL bloğunu (boşluklar normalize) karşılaştırmak için. */
  const block = (sql: string, pattern: RegExp): string =>
    (sql.match(pattern) ?? [""])[0].replace(/\s+/g, " ").trim();

  it("mevcut temsilci komisyonu DEĞİŞMEZ: insert bloğu 0010 ile birebir aynı", () => {
    const repInsert =
      /insert into commissions \(sale_id[\s\S]*?returning id into new_commission_id;/;
    expect(block(teamComSql, repInsert)).toBe(block(confirmSaleSql, repInsert));
    // referans ödülü dalı da aynen korunur
    const referralBranch = /elsif s\.channel = 'dogrudan'[\s\S]*?end if;/;
    expect(block(teamComSql, referralBranch)).toBe(block(confirmSaleSql, referralBranch));
    // orijinal 0010 formülleri 0014 gövdesinde aynen vardır
    expect(teamComSql).toMatch(/then round\(s\.amount \* rep\.custom_commission_rate \/ 100\)/);
    expect(teamComSql).toMatch(
      /round\(s\.amount \* \(case when st\.rep_commission > 100 then 50 else st\.rep_commission end\) \/ 100\)/,
    );
    // kilitler ve mükerrer komisyon kontrolü değişmez
    expect(code).toMatch(/select \* into s from sales where id = p_sale_id for update/);
    expect(code).toMatch(/raise exception 'komisyon zaten var'/);
    expect(code).toMatch(/raise exception 'ödeme doğrulanmadı'/);
  });

  it("confirm_renewal'e ve mevcut tablolara dokunulmaz", () => {
    expect(code).not.toMatch(/confirm_renewal/);
    expect(code).not.toMatch(/renewal_commission/);
    expect(code).not.toMatch(/alter table public\.(commissions|commission_payouts|sales)/);
    expect(code).not.toMatch(/delete from|truncate/i);
    expect(code).toMatch(/(^|\n)begin;\s*\n/);
    expect(code).toMatch(/(^|\n)commit;\s*\n/);
  });

  it("aynı satış için tek satır: unique (sale_id) SQL seviyesinde", () => {
    expect(code).toMatch(
      /create unique index if not exists team_commissions_sale_unique\s+on public\.team_commissions \(sale_id\)/,
    );
    // tek insert (confirm_sale bloğu) — geriye dönük toplu yazım YOK
    const inserts = code.match(/insert into team_commissions/g) ?? [];
    expect(inserts).toHaveLength(1);
  });

  it("hesaplama sunucuda: matrah paylar sonrası, %20, yenileme ve liderin satışı hariç", () => {
    expect(code).toMatch(
      /if s\.channel = 'temsilci' and s\.sales_rep_id is not null\s+and s\.renewal_for_membership_id is null then/,
    );
    expect(code).toMatch(/v_leader_id is distinct from s\.sales_rep_id/);
    // brüt tutar değil: satış − bu satış için oluşan tüm paylar
    expect(code).toMatch(
      /v_remaining := s\.amount - coalesce\(\s+\(select sum\(c\.amount\) from commissions c where c\.sale_id = s\.id\), 0\)/,
    );
    expect(code).toMatch(/values\s+\(s\.id, s\.sales_rep_id, v_leader_id, v_remaining, 20, round\(v_remaining \* 20 \/ 100\)\)/);
    // liderin KENDİ satırı, ekip üyesi olmayan, dogrudan kanal satırı üretmez
    expect(code).not.toMatch(/insert into team_commissions[\s\S]{0,120}channel = 'dogrudan'/);
  });

  it("satır RLS ile korunur: yalnız SELECT — admin tümü, lider yalnız kendi satırı", () => {
    expect(code).toMatch(/alter table public\.team_commissions enable row level security/);
    expect(code).toMatch(/alter table public\.team_commission_payouts enable row level security/);
    const policies = code.match(/create policy [^;]+;/g) ?? [];
    expect(policies).toHaveLength(4); // 2 komisyon + 2 ödeme; hepsi SELECT
    for (const policy of policies) {
      expect(policy).toMatch(/for select to authenticated/);
      expect(policy).not.toMatch(/for (all|update|delete)/);
      expect(policy).not.toMatch(/to anon/);
    }
    // yazım anon/authenticated'ten tamamen kaldırılır (yalnız RPC yazar)
    const revokes = code.match(
      /revoke insert, update, delete on public\.team_commission(s|_payouts) from anon, authenticated;/g,
    ) ?? [];
    expect(revokes).toHaveLength(2);
    // lider policy'si oturumdaki satış temsilcisine bağlanır
    expect(code).toMatch(/team_leader_rep_id = current_sales_rep_id\(\)/);
  });

  it("ödeme RPC'si: SECURITY DEFINER + admin guard + bakiye sınırı; anon EXECUTE yok", () => {
    expect(code).toMatch(
      /create or replace function public\.record_team_commission_payout\(\s+p_payout_id uuid,/,
    );
    expect(code).toMatch(
      /function public\.record_team_commission_payout\([\s\S]*?security definer/,
    );
    // confirm_sale + ödeme RPC'si: iki admin guard
    const guards = code.match(/if current_app_role\(\) <> 'admin' then/g) ?? [];
    expect(guards).toHaveLength(2);
    expect(code).toMatch(/p_amount > v_earned - v_paid/);
    expect(code).toMatch(/Ödeme isteği kimliği daha önce farklı bilgilerle kullanılmış/);
    expect(code).toMatch(
      /revoke execute on function public\.record_team_commission_payout\(uuid, uuid, numeric, text\) from public, anon;/,
    );
    expect(code).toMatch(
      /grant execute on function public\.record_team_commission_payout\(uuid, uuid, numeric, text\) to authenticated, service_role;/,
    );
    expect(code).not.toMatch(/record_team_commission_payout\(uuid, uuid, numeric, text\) to anon/);
    // service_role yalnız sunucuda; istemciye açılan anahtar/metin yok
    expect(code).not.toMatch(/service_role_key|VITE_.*SERVICE/);
  });
});

describe("0015 ekip katılım başvurusu güvenlik invariantları", () => {
  // Yorum satırları (iş modeli/rollback notları dahil) doğrulamadan çıkarılır.
  const code = joinSql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

  it("başvuru tablosu: durumlar sabit + kişi başına tek beklemede satır (partial unique)", () => {
    expect(code).toMatch(/create table if not exists public\.team_join_applications/);
    expect(code).toMatch(/check \(status in \('beklemede', 'onaylandi', 'reddedildi'\)\)/);
    expect(code).toMatch(
      /create unique index if not exists team_join_applications_pending_rep_uk\s+on public\.team_join_applications \(rep_id\)\s+where status = 'beklemede'/,
    );
    // başvuru satırı asla silinmez (denetim geçmişi); karar alanları RPC yazar
    expect(code).toMatch(/decided_at timestamptz/);
    expect(code).toMatch(/decided_by uuid references auth\.users\(id\)/);
    expect(code).not.toMatch(/delete from team_join_applications|truncate/i);
  });

  it("RLS: yalnız SELECT — admin tümünü, personel yalnız kendi başvurusu; yazım yok", () => {
    expect(code).toMatch(/alter table public\.team_join_applications enable row level security/);
    const policies =
      code.match(/create policy [^;]+on public\.team_join_applications[^;]+;/g) ?? [];
    expect(policies).toHaveLength(2);
    for (const policy of policies) {
      expect(policy).toMatch(/for select to authenticated/);
      expect(policy).not.toMatch(/for (all|insert|update|delete)/);
    }
    expect(code).toMatch(/using \(current_app_role\(\) = 'admin'\)/);
    expect(code).toMatch(/rep_id = current_sales_rep_id\(\)/);
    expect(code).toMatch(
      /revoke insert, update, delete on public\.team_join_applications from anon, authenticated;/,
    );
  });

  it("üç RPC: SECURITY DEFINER + rol guard; anon EXECUTE yok", () => {
    for (const fn of [
      "submit_team_join_application",
      "approve_team_join_application",
      "reject_team_join_application",
    ]) {
      expect(code).toMatch(new RegExp(`create or replace function ${fn}\\(`));
    }
    const definers = code.match(/language plpgsql security definer/g) ?? [];
    expect(definers).toHaveLength(3);
    // submit yalnız temsilci; onay/red yalnız admin (service_role → null → PASS)
    expect(code.match(/if current_app_role\(\) <> 'temsilci' then/g) ?? []).toHaveLength(1);
    expect(code.match(/if current_app_role\(\) <> 'admin' then/g) ?? []).toHaveLength(2);
    const revokes =
      code.match(
        /revoke execute on function (submit|approve|reject)_team_join_application\(uuid\) from public, anon;/g,
      ) ?? [];
    expect(revokes).toHaveLength(3);
    const grants =
      code.match(
        /grant execute on function (submit|approve|reject)_team_join_application\(uuid\) to authenticated, service_role;/g,
      ) ?? [];
    expect(grants).toHaveLength(3);
    expect(code).not.toMatch(/_team_join_application\(uuid\) to anon/);
  });

  it("onay: beklemede kilidi + başka ekip + kapasite yeniden kontrol + tek transaction üyelik", () => {
    const approve =
      (code.match(/create or replace function approve_team_join_application[\s\S]*?\$\$;/) ?? [
        "",
      ])[0];
    expect(approve).toMatch(/for update/);
    expect(approve).toMatch(/status <> 'beklemede'/);
    // başka ekip bağlılık kontrolü
    expect(approve).toMatch(/team_id is not null/);
    // kapasite yeniden kontrol (0011 trigger'ı UPDATE'te çift katman)
    expect(approve).toMatch(/v_count \+ 1 > v_cap/);
    expect(approve).toMatch(
      /update sales_reps set team_id = v_app\.team_id where id = v_app\.rep_id/,
    );
    expect(approve).toMatch(
      /status = 'onaylandi', decided_at = now\(\), decided_by = auth\.uid\(\)/,
    );
    // trigger/tablolara bu dosyada dokunulmaz (0011 aynen korunur)
    expect(code).not.toMatch(/create trigger|drop trigger|enforce_team_capacity/);
  });

  it("ekip satır okuması 0017 ile temsilcinin kendi ekibiyle sınırlı; yazma politikaları zayıflamaz", () => {
    // 0011'in "rep read own team" kısıtı 0015'te genişletilmişti (using (true));
    // 0017 aynı politikayı temsilci için yeniden daraltır (bkz. aşağıdaki test).
    expect(code).toMatch(/drop policy if exists "rep read own team" on public\.teams/);
    expect(
      code.match(/create policy [^;]+on public\.teams[^;]+;/g) ?? [],
    ).toHaveLength(1);
    // teams'a yazma yalnız 0011'in admin full policy'si; sales_reps'e YAZMA policy'si eklenmez
    expect(code).not.toMatch(/on public\.teams for (all|insert|update|delete)/);
    expect(code).not.toMatch(/on public\.sales_reps for (all|insert|update|delete)/);
    expect(code).not.toMatch(/grant (insert|update|delete)/);
  });

  it("0017: authenticated read teams temsilciyi kendi ekibiyle sınırlandırır, admin policy'si korunur", () => {
    // Eski geniş politika düşürülür ve aynı adla dar politika kurulur
    expect(teamsScopeSql).toMatch(/drop policy if exists "authenticated read teams" on public\.teams/);
    expect(teamsScopeSql).toMatch(
      /create policy "authenticated read teams" on public\.teams\s+for select to authenticated\s+using \(current_app_role\(\) = 'temsilci'::app_role and id = current_team_id\(\)\)/,
    );
    // 0011 admin full policy'sine dokunulmaz (admin tüm satırları okur/yazar)
    // — yalnızca yürütülen SQL'e bakılır, yorum satırları hariç
    const execSql = teamsScopeSql.replace(/--.*/g, "");
    expect(execSql).not.toMatch(/admin full teams/);
    // Bu dosya başka hiçbir tabloya/fonksiyona/trigger'a/politiğe dokunmaz
    expect(teamsScopeSql).not.toMatch(
      /alter table|create table|create or replace function|create trigger|create index|insert into|update |delete from|truncate|revoke|grant/i,
    );
    expect(teamsScopeSql).toMatch(/(^|\n)begin;\s*\n/);
    expect(teamsScopeSql).toMatch(/(^|\n)commit;\s*\n/);
  });

  it("ekip özeti görünümü: anon'a kapalı, authenticated yalnız okur", () => {
    expect(code).toMatch(/create or replace view public\.teams_overview as/);
    expect(code).toMatch(/revoke all on public\.teams_overview from anon, public;/);
    expect(code).toMatch(/revoke insert, update, delete on public\.teams_overview from authenticated;/);
    expect(code).toMatch(/grant select on public\.teams_overview to authenticated;/);
    expect(code).not.toMatch(/grant[^;]*teams_overview[^;]*(insert|update|delete|all)/);
  });

  it("mevcut sistemlere dokunulmaz: satış/komisyon/ödeme/başvuru altyapısı ve 0011-0014", () => {
    expect(code).not.toMatch(
      /confirm_sale|confirm_renewal|team_commissions|commission_payouts|submit_rep_application|approve_rep_application|reject_rep_application/,
    );
    expect(code).not.toMatch(/alter table public\.(sales_reps|teams|app_settings|commissions)/);
    expect(code).not.toMatch(/create or replace function (create_team|confirm_sale)\(/);
    expect(code).toMatch(/(^|\n)begin;\s*\n/);
    expect(code).toMatch(/(^|\n)commit;\s*\n/);
    expect(code).not.toMatch(/delete from|truncate/i);
  });
});
