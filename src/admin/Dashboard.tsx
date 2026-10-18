import { Link } from "react-router-dom";
import { PanelHead } from "./AdminLayout";
import { StatCard, auditActionLabels, Badge, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import {
  listAudit,
  listCompanies,
  listCommissions,
  listMemberships,
  listReps,
} from "../lib/repo";

export default function AdminDashboard() {
  const actor = useActor();
  const companies = listCompanies();
  const memberships = listMemberships(actor);
  const commissions = listCommissions(actor);
  const reps = listReps(actor);
  const audit = listAudit(8);

  const activeMemberships = memberships.filter((m) => m.status === "aktif").length;
  const pendingCommission = commissions
    .filter((c) => c.com.status !== "odendi")
    .reduce((sum, c) => sum + c.com.amount, 0);

  return (
    <div className="panel-content">
      <PanelHead
        title="Genel durum"
        desc="Platformun özet göstergeleri ve güncel hareketler."
      />

      <InfoBanner>
        <strong>Demo mod aktif:</strong> Supabase veritabanı yapılandırılmadı; veriler yalnızca
        bu tarayıcıda tutulur. Canlıya geçiş için README'de anlatılan kurulum adımlarını uygulayın.
      </InfoBanner>

      <div className="stats-grid">
        <StatCard icon="🏪" label="Yayındaki firma" value={companies.filter(c => c.published).length} hint={`Toplam kayıt: ${companies.length}`} />
        <StatCard icon="🔐" label="Aktif üyelik" value={activeMemberships} tone="success" hint={`Toplam üyelik kaydı: ${memberships.length}`} />
        <StatCard icon="🧾" label="Bekleyen komisyon" value={formatTRY(pendingCommission)} tone="warning" hint="Ödenmemiş komisyon toplamı" />
        <StatCard icon="👥" label="Satış temsilcisi" value={reps.filter(r=>r.status==="aktif").length} hint="Aktif temsilci sayısı" />
      </div>

      <div className="flex-between mt-18">
        <h3 style={{ fontWeight: 800 }}>Son işlemler</h3>
        <Link to="/yonetim/denetim" className="small">Tüm işlem geçmişi →</Link>
      </div>
      <div className="table-wrap mt-14">
        <table className="table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Eylem</th>
              <th>Özet</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">
                  Henüz işlem kaydı yok.
                </td>
              </tr>
            )}
            {audit.map((entry) => (
              <tr key={entry.id}>
                <td className="text-muted small">{formatDateTime(entry.at)}</td>
                <td>
                  <Badge tone="blue">{auditActionLabels[entry.action] ?? entry.action}</Badge>
                </td>
                <td>{entry.summary}</td>
                <td className="text-muted small">{entry.actorRole}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
