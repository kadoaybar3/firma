import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  ChartNoAxesColumnIncreasing,
  CircleAlert,
  CreditCard,
  Download,
  Store,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { StatCard, auditActionLabels, Badge, EmptyState, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  listAudit,
  listCompanies,
  listLeads,
  listMemberships,
  listPayments,
  listReps,
  listSales,
  monthlyReport,
} from "../lib/repo";

const QUICK_ACTIONS = [
  { to: "/yonetim/firmalar", label: "Firma kayıtları", desc: "Yayın durumu ve düzenleme", icon: Store },
  { to: "/yonetim/adaylar", label: "Firma adayları", desc: "Sahadan gelen adaylar", icon: Target },
  { to: "/yonetim/odemeler", label: "Ödeme kayıtları", desc: "Doğrulama bekleyenler", icon: CreditCard },
  { to: "/yonetim/satislar", label: "Satış kayıtları", desc: "Satış ve komisyon", icon: Wallet },
  { to: "/yonetim/temsilciler", label: "Satış temsilcileri", desc: "Ekip ve performans", icon: Users },
  { to: "/yonetim/ice-aktar", label: "İçe aktarma", desc: "Toplu firma ekleme", icon: Download },
];

export default function AdminDashboard() {
  const actor = useActor();
  const companies = listCompanies({ includeUnpublished: true });
  const memberships = listMemberships(actor);
  const payments = listPayments(actor);
  const sales = listSales(actor);
  const leads = listLeads(actor);
  const reps = listReps(actor);
  const audit = listAudit(8);
  const months = monthlyReport(6);

  const published = companies.filter((c) => c.published).length;
  const unpublished = companies.length - published;
  const activeReps = reps.filter((r) => r.status === "aktif").length;
  const confirmedSales = sales.filter((s) => s.status === "odendi");
  const activeMemberships = memberships.filter((m) => m.status === "aktif").length;
  const pendingPayments = payments.filter((p) => p.status !== "onaylandi");
  const openLeads = leads.filter((l) => l.status !== "anlaşma" && l.status !== "iptal");
  const maxAmount = Math.max(0, ...months.map((m) => m.totalAmount));

  return (
    <div className="panel-content">
      <PanelHead
        title="Genel durum"
        desc="Firma, üyelik, satış ve tahsilat hareketlerinin güncel özeti."
      />

      {!isSupabaseConfigured && (
        <InfoBanner>
          <strong>Demo mod aktif:</strong> Veriler bu tarayıcıda tutuluyor.
        </InfoBanner>
      )}

      <div
        className="stats-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,215px),1fr))", gap: 14 }}
      >
        <StatCard
          icon={<Store size={20} />}
          label="Yayındaki firma"
          value={published}
          hint={`${companies.length} toplam · ${unpublished} yayın dışı`}
        />
        <StatCard
          icon={<Users size={20} />}
          label="Aktif satış temsilcisi"
          value={activeReps}
          tone="primary"
          hint={`${reps.length} kayıtlı temsilci`}
        />
        <StatCard
          icon={<BadgeCheck size={20} />}
          label="Satış ve üyelik"
          value={sales.length}
          tone="success"
          hint={`${confirmedSales.length} kesinleşti · ${activeMemberships} aktif üyelik`}
        />
        <StatCard
          icon={<CreditCard size={20} />}
          label="Onay bekleyen ödeme"
          value={pendingPayments.length}
          tone="warning"
          hint={pendingPayments.length ? "Doğrulama gerekiyor" : "Bekleyen yok"}
        />
        <StatCard
          icon={<CircleAlert size={20} />}
          label="Bekleyen firma adayı"
          value={openLeads.length}
          tone={openLeads.length ? "warning" : "default"}
          hint={`${leads.length} toplam aday`}
        />
      </div>

      <div
        className="grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 16, marginTop: 18 }}
      >
        <section className="card card__pad">
          <div className="flex-between">
            <div>
              <h3 style={{ fontWeight: 800 }}>Son 6 ay satış</h3>
              <p className="text-muted small">Yalnızca ödemesi doğrulanmış satışlar.</p>
            </div>
            <ChartNoAxesColumnIncreasing size={19} aria-hidden="true" />
          </div>
          {maxAmount === 0 ? (
            <EmptyState
              title="Henüz kesinleşmiş satış yok"
              description="Satışlar ödeme doğrulandıktan sonra bu grafikte görünür."
            />
          ) : (
            <div className="mt-14" style={{ display: "grid", gap: 12 }}>
              {months.map((m) => (
                <div
                  key={m.month}
                  title={`${formatTRY(m.totalAmount)} · ${m.saleCount} satış`}
                  style={{ display: "grid", gridTemplateColumns: "58px 1fr auto", gap: 10, alignItems: "center" }}
                >
                  <span className="small text-muted">
                    {new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit" }).format(
                      new Date(`${m.month}-01T12:00:00`),
                    )}
                  </span>
                  <span
                    className="bar-track"
                    role="img"
                    aria-label={`${m.saleCount} satış, ${formatTRY(m.totalAmount)}`}
                  >
                    <span
                      className="bar-fill"
                      style={{ width: `${maxAmount ? (m.totalAmount / maxAmount) * 100 : 0}%` }}
                    />
                  </span>
                  <strong className="small" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatTRY(m.totalAmount)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card card__pad">
          <div className="flex-between">
            <h3 style={{ fontWeight: 800 }}>Dikkat gerektirenler</h3>
            <Badge tone={pendingPayments.length + openLeads.length + unpublished ? "orange" : "green"}>
              {pendingPayments.length + openLeads.length + unpublished}
            </Badge>
          </div>

          <div className="attention-list">
            <Link className="attention-row" to="/yonetim/odemeler">
              <span className="attention-row__icon" aria-hidden="true">
                <CreditCard size={16} strokeWidth={1.9} />
              </span>
              <span className="attention-row__text">
                <strong>{pendingPayments.length} ödeme doğrulama bekliyor</strong>
                <span className="text-muted small">Ödeme onaylanınca üyelik ve komisyon oluşur</span>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link className="attention-row" to="/yonetim/adaylar">
              <span className="attention-row__icon" aria-hidden="true">
                <Target size={16} strokeWidth={1.9} />
              </span>
              <span className="attention-row__text">
                <strong>{openLeads.length} firma adayı takip bekliyor</strong>
                <span className="text-muted small">Anlaşma aşamasındakiler firmaya dönüştürülebilir</span>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Link className="attention-row" to="/yonetim/firmalar">
              <span className="attention-row__icon" aria-hidden="true">
                <Store size={16} strokeWidth={1.9} />
              </span>
              <span className="attention-row__text">
                <strong>{unpublished} firma yayın dışı</strong>
                <span className="text-muted small">Yayına alınmayı bekliyor olabilir</span>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <h4 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>Hızlı işlemler</h4>
          <div className="quick-grid">
            {QUICK_ACTIONS.map(({ to, label, desc, icon: Icon }) => (
              <Link key={to} className="quick-tile" to={to}>
                <span className="quick-tile__icon" aria-hidden="true">
                  <Icon size={16} strokeWidth={1.9} />
                </span>
                <span>
                  <strong>{label}</strong>
                  <span className="text-muted small">{desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="flex-between" style={{ marginTop: 22 }}>
        <h3 style={{ fontWeight: 800 }}>Son işlemler</h3>
        <Link to="/yonetim/denetim" className="small">
          Tüm işlem geçmişi
        </Link>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
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
            {audit.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-muted">
                  Henüz işlem kaydı yok.
                </td>
              </tr>
            ) : (
              audit.map((entry) => (
                <tr key={entry.id}>
                  <td className="text-muted small">{formatDateTime(entry.at)}</td>
                  <td>
                    <Badge tone="blue">{auditActionLabels[entry.action] ?? entry.action}</Badge>
                  </td>
                  <td>{entry.summary}</td>
                  <td className="text-muted small">{entry.actorRole}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
