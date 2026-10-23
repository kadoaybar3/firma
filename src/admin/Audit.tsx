import { ShieldCheck } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, auditActionLabels } from "../components/ui";
import { listAudit } from "../lib/repo";
import { formatDateTime } from "../lib/format";

export default function AdminAudit() {
  const audit = listAudit(200);
  return (
    <div className="panel-content">
      <PanelHead
        title="İşlem geçmişi (denetim kaydı)"
        desc="Kritik ynetim işlemleri burada kalıcı olarak toplanır. Supabase aktifken kayıtlar veritabanında tutulur."
      />
      {audit.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={30} strokeWidth={1.5} aria-hidden="true" />}
          title="Denetim kaydı yok"
          description="İşlemler yapıldıkça burada listelenecek."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Eylem</th>
                <th>Özet</th>
                <th>Aktör</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((entry) => (
                <tr key={entry.id}>
                  <td className="small text-muted" style={{ whiteSpace: "nowrap" }}>
                    {formatDateTime(entry.at)}
                  </td>
                  <td>
                    <Badge tone="blue">{auditActionLabels[entry.action] ?? entry.action}</Badge>
                  </td>
                  <td>
                    {entry.summary}
                    <div className="text-muted small" style={{ maxWidth: 480, wordBreak: "break-all" }}>
                      {entry.detail}
                    </div>
                  </td>
                  <td className="small">{entry.actorRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
