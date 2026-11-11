import type { Lead, LeadStatus } from "../lib/types";

/** Taslak: kendi adayı, firmaya dönüşmemiş ve iptal edilmemiş kayıt. */
export function isDraft(lead: Lead): boolean {
  return !lead.convertedToCompanyId && lead.status !== "iptal";
}

/** Anlaşma bildirilmiş taslak: firma bilgileri kilitli, yönetici incelemesinde. */
export function isLocked(lead: Lead): boolean {
  return isDraft(lead) && lead.status === "anlaşma";
}

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: string }> = {
  yeni: { label: "Yeni", tone: "rep-badge--blue" },
  irtibat: { label: "İletişimde", tone: "rep-badge--blue" },
  "görüşme": { label: "Görüşme", tone: "rep-badge--amber" },
  "anlaşma": { label: "İncelemede", tone: "rep-badge--amber" },
  iptal: { label: "İptal", tone: "rep-badge--red" },
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const s = LEAD_STATUS[status];
  return <span className={`rep-badge ${s.tone}`}>{s.label}</span>;
}
