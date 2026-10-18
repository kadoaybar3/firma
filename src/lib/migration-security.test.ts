import { describe, expect, it } from "vitest";
import initSql from "../../supabase/migrations/0001_init.sql?raw";
import hardeningSql from "../../supabase/migrations/0002_security_hardening.sql?raw";

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
