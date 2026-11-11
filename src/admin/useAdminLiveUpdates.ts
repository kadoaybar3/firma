import { useCallback, useEffect, useRef, useState } from "react";
import { applySnapshot, getDB } from "../lib/repo";
import { emitLiveDataChanged } from "../lib/liveData";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { flushNow, loadSnapshot } from "../lib/dataSource";

export interface LiveCompanyNotice {
  id: string;
  companyName: string;
  kind: "lead" | "company";
}

export function useAdminLiveUpdates() {
  const [notice, setNotice] = useState<LiveCompanyNotice | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => ("Notification" in window ? Notification.permission : "unsupported"),
  );
  const signatures = useRef<{ leads: string; companies: string } | null>(null);
  const checking = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const current = getDB();
    signatures.current = {
      leads: current.leads.map((lead) => `${lead.id}:${lead.updatedAt}`).sort().join("|"),
      companies: current.companies.map((company) => `${company.id}:${company.updatedAt}`).sort().join("|"),
    };

    let active = true;
    const refreshIfChanged = async () => {
      if (checking.current || !active || !supabase) return;
      checking.current = true;
      try {
        const [leadResult, companyResult] = await Promise.all([
          supabase.from("leads").select("id,company_name,updated_at"),
          supabase.from("companies").select("id,name,updated_at"),
        ]);
        if (leadResult.error || companyResult.error || !active) return;

        const leadRows = leadResult.data ?? [];
        const companyRows = companyResult.data ?? [];
        const next = {
          leads: leadRows.map((row) => `${row.id}:${row.updated_at}`).sort().join("|"),
          companies: companyRows.map((row) => `${row.id}:${row.updated_at}`).sort().join("|"),
        };
        const previous = signatures.current;
        if (!previous) {
          signatures.current = next;
          return;
        }
        if (next.leads === previous.leads && next.companies === previous.companies) return;

        const local = getDB();
        const knownLeadIds = new Set(local.leads.map((lead) => lead.id));
        const knownCompanyIds = new Set(local.companies.map((company) => company.id));
        const newLead = leadRows.find((row) => !knownLeadIds.has(row.id));
        const newCompany = companyRows.find((row) => !knownCompanyIds.has(row.id));
        await flushNow();
        const { db } = await loadSnapshot();
        if (!active) return;
        applySnapshot(db);
        signatures.current = next;
        emitLiveDataChanged();

        if (newLead || newCompany) {
          const kind = newLead ? "lead" : "company";
          const id = newLead?.id ?? newCompany!.id;
          const companyName = newLead?.company_name || newCompany?.name || "Yeni firma";
          setNotice({ id, companyName, kind });
          if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
            const notification = new Notification(kind === "lead" ? "Yeni firma başvurusu" : "Yeni firma kaydı", {
              body: kind === "lead" ? `${companyName} yönetici incelemesi bekliyor.` : `${companyName} firma listesine eklendi.`,
              tag: `${kind}-${id}`,
            });
            notification.onclick = () => {
              window.focus();
              window.location.assign(kind === "lead" ? "/yonetim/firma-akisi" : "/yonetim/firmalar");
              notification.close();
            };
          }
        }
      } catch {
        // Bağlantı geçici olarak kesilirse sonraki Realtime olayı veya yoklama tekrar dener.
      } finally {
        checking.current = false;
      }
    };

    const channel = supabase
      .channel("admin-company-intake-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => void refreshIfChanged())
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, () => void refreshIfChanged())
      .subscribe();

    const timer = window.setInterval(() => void refreshIfChanged(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      void supabase?.removeChannel(channel);
    };
  }, []);

  const enableBrowserNotifications = useCallback(async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    const next = await Notification.requestPermission();
    setPermission(next);
  }, []);

  return { notice, dismissNotice: () => setNotice(null), permission, enableBrowserNotifications };
}
