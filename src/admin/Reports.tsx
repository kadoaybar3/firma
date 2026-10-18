import { PanelHead } from "./AdminLayout";
import { Badge, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY } from "../lib/format";
import {
  categoryCompanyCount,
  getSettings,
  listCategories,
  listCompanies,
  listCommissions,
  listSales,
  monthlyReport,
} from "../lib/repo";

export default function AdminReports() {
  const actor = useActor();
  const months = monthlyReport(6);
  const sales = listSales(actor);
  const commissions = listCommissions(actor);
  const settings = getSettings();

  const confirmedSales = sales.filter((s) => s.status === "odendi");
  const totalRevenue = confirmedSales.reduce((sum, s) => sum + s.amount, 0);
  const totalCommission = commissions.reduce((sum, c) => sum + c.com.amount, 0);
  const netRevenue = totalRevenue - totalCommission;

  const categories = listCategories()
    .map((c) => ({ cat: c, count: categoryCompanyCount(c.id) }))
    .sort((a, b) => b.count - a.count);
  const maxCat = Math.max(1, ...categories.map((c) => c.count));

  return (
    <div className="panel-content">
      <PanelHead
        title="Raporlar"
        desc="Gelir, komisyon ve kategori dağılımı raporları (kesinleşen satışlar baz alınır)."
      />

      <div className="card card__pad mb-14">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Gelir özeti</h3>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 480 }}>
            <tbody>
              <tr>
                <td>Toplam kesinleşen satış tutarı</td>
                <td style={{ fontWeight: 800, textAlign: "right" }}>{formatTRY(totalRevenue)}</td>
              </tr>
              <tr>
                <td>Komisyon ve ödül toplamı</td>
                <td style={{ fontWeight: 800, textAlign: "right", color: "var(--danger)" }}>
                  −{formatTRY(totalCommission)}
                </td>
              </tr>
              <tr>
                <td>Diğer giderlerden önce platform payı</td>
                <td style={{ fontWeight: 800, textAlign: "right", color: "var(--success)" }}>
                  {formatTRY(netRevenue)}
                </td>
              </tr>
              <tr>
                <td>Ayarlanan örnek dağılım</td>
                <td style={{ textAlign: "right" }} className="small text-muted">
                  Üyelik {formatTRY(settings.membershipPrice)} = Komisyon {formatTRY(settings.repCommission)} + Referans{" "}
                  {formatTRY(settings.referralReward)} + Platform {formatTRY(settings.membershipPrice - settings.repCommission - settings.referralReward)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card__pad mb-14">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Son 6 ay satış grafiği</h3>
        {months.map((m) => {
          const max = Math.max(1, ...months.map((x) => x.totalAmount));
          return (
            <div className="bar-row" key={m.month}>
              <span className="text-muted small">{m.month}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(m.totalAmount / max) * 100}%` }} />
              </span>
              <span className="small">
                {formatTRY(m.totalAmount)} <Badge tone="blue">{m.saleCount} satış</Badge>
              </span>
            </div>
          );
        })}
      </div>

      <div className="card card__pad">
        <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Kategori dağılımı</h3>
        <InfoBanner>Yalnızca yayındaki firmalar sayılır.</InfoBanner>
        {categories.map(({ cat, count }) => (
          <div className="bar-row" key={cat.id}>
            <span className="small">
              {cat.icon} {cat.name}
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(count / maxCat) * 100}%` }} />
            </span>
            <span className="small text-muted">{count} firma</span>
          </div>
        ))}
        <p className="text-muted small mt-14">
          Toplam yayında firma: {listCompanies().filter((c) => c.published).length}
        </p>
      </div>
    </div>
  );
}
