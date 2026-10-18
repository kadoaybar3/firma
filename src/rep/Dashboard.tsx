import { StatCard, Badge } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY, formatDateTime } from "../lib/format";
import { listLeads, listSales, listCommissions } from "../lib/repo";

export default function RepDashboard() {
  const actor = useActor();
  const leads = listLeads(actor);
  const sales = listSales(actor);
  const commissions = listCommissions(actor);

  const confirmed = sales.filter((s) => s.status === "odendi");
  const pendingCommission = commissions
    .filter((c) => c.com.status !== "odendi")
    .reduce((sum, c) => sum + c.com.amount, 0);
  const paidCommission = commissions
    .filter((c) => c.com.status === "odendi")
    .reduce((sum, c) => sum + c.com.amount, 0);

  return (
    <div>
      <div className="page-head">
        <h2>Özetim</h2>
        <p>Sahadaki aday, satış ve kazanç durumunuz.</p>
      </div>

      <div className="stats-grid">
        <StatCard icon="🎯" label="Aday sayısı" value={leads.length} hint="Topladığınız firma adayları" />
        <StatCard icon="💰" label="Kesinleşen satış" value={confirmed.length} tone="success" />
        <StatCard icon="🧾" label="Bekleyen komisyon" value={formatTRY(pendingCommission)} tone="warning" hint="Onay bekliyor" />
        <StatCard icon="🏦" label="Ödenmiş kazanç" value={formatTRY(paidCommission)} hint="Hesaba geçmiş" />
      </div>

      <h3 style={{ fontWeight: 800, marginTop: 22, marginBottom: 10 }}>Son adaylarım</h3>
      <div className="table-wrap">
        <table className="table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Aday</th>
              <th>Durum</th>
              <th>Ziyaret</th>
              <th>Son güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {leads.slice(0, 6).map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.companyName}</strong>
                  <div className="text-muted small">{l.district ?? "—"}</div>
                </td>
                <td>
                  <Badge
                    tone={
                      l.status === "anlaşma"
                        ? "green"
                        : l.status === "görüşme"
                          ? "orange"
                          : l.status === "iptal"
                            ? "red"
                            : "gray"
                    }
                  >
                    {l.status}
                  </Badge>
                </td>
                <td>{l.visitCount}</td>
                <td className="small text-muted">{formatDateTime(l.updatedAt)}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">
                  Henüz aday kaydı yok. "Firma adayları" sayfasından ekleyin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
