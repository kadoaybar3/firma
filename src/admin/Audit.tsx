import { useState } from "react";
import { ClipboardList, FilterX, ShieldCheck } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, auditActionLabels } from "../components/ui";
import { listAudit } from "../lib/repo";
import { formatDateTime } from "../lib/format";

const ROLE_LABEL: Record<string, string> = {
  admin: "Yönetici",
  temsilci: "Personel",
  sistem: "Sistem",
};

function dayOf(value: string): string {
  return value.slice(0, 10);
}

export default function AdminAudit() {
  const audit = listAudit(500);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [role, setRole] = useState("");
  const [action, setAction] = useState("");

  const actions = [...new Set(audit.map((entry) => entry.action))].sort((a, b) =>
    (auditActionLabels[a] ?? a).localeCompare(auditActionLabels[b] ?? b, "tr"),
  );

  const filtered = audit.filter((entry) => {
    const day = dayOf(entry.at);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (role && entry.actorRole !== role) return false;
    if (action && entry.action !== action) return false;
    if (q.trim()) {
      const haystack = `${entry.summary} ${entry.detail} ${entry.actorId ?? ""} ${
        auditActionLabels[entry.action] ?? entry.action
      }`
        .toLocaleLowerCase("tr")
        .replace(/İ/g, "i")
        .replace(/ı/g, "i");
      if (!haystack.includes(q.toLocaleLowerCase("tr").replace(/İ/g, "i").replace(/ı/g, "i")))
        return false;
    }
    return true;
  });

  const hasFilters = Boolean(q.trim() || from || to || role || action);

  function clearFilters() {
    setQ("");
    setFrom("");
    setTo("");
    setRole("");
    setAction("");
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="İşlem Geçmişi"
        desc="Kimin, hangi işlemi, ne zaman yaptığını gösteren kalıcı denetim kaydı. Kayıtlar Supabase aktifken veritabanında tutulur."
      />

      <div className="adm-filterbar">
        <div className="adm-filtergrid">
          <label className="adm-filter" style={{ gridColumn: "span 2" }}>
            <span>Ara</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Özet, ayrıntı veya aktör kimliği…"
            />
          </label>
          <label className="adm-filter">
            <span>Başlangıç tarihi</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="adm-filter">
            <span>Bitiş tarihi</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="adm-filter">
            <span>Aktör</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Tüm aktörler</option>
              <option value="admin">Yönetici</option>
              <option value="temsilci">Personel</option>
              <option value="sistem">Sistem</option>
            </select>
          </label>
          <label className="adm-filter" style={{ gridColumn: "span 2" }}>
            <span>Eylem</span>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">Tüm eylemler</option>
              {actions.map((key) => (
                <option key={key} value={key}>
                  {auditActionLabels[key] ?? key}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="adm-filterbar__foot">
          <span>
            {filtered.length} / {audit.length} kayıt gösteriliyor
          </span>
          {hasFilters && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={clearFilters}>
              <FilterX size={14} strokeWidth={1.9} aria-hidden="true" />
              Filtreleri temizle
            </button>
          )}
        </div>
      </div>

      {audit.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={30} strokeWidth={1.5} aria-hidden="true" />}
          title="Denetim kaydı yok"
          description="İşlemler yapıldıkça burada listelenecek."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={30} strokeWidth={1.5} aria-hidden="true" />}
          title="Kayıt bulunamadı"
          description="Tarih, aktör veya eylem filtresini değiştirin."
        />
      ) : (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Eylem</th>
                <th>Özet</th>
                <th>Aktör</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id}>
                  <td className="small text-muted" style={{ whiteSpace: "nowrap" }}>
                    {formatDateTime(entry.at)}
                  </td>
                  <td>
                    <Badge tone="blue">{auditActionLabels[entry.action] ?? entry.action}</Badge>
                  </td>
                  <td>
                    <span className="adm-list__title">{entry.summary}</span>
                    {entry.detail && entry.detail !== "{}" && (
                      <div className="adm-detail">{entry.detail}</div>
                    )}
                  </td>
                  <td className="small">
                    {ROLE_LABEL[entry.actorRole] ?? entry.actorRole}
                    {entry.actorId && (
                      <div className="text-muted small" style={{ overflowWrap: "anywhere" }}>
                        {entry.actorId}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
