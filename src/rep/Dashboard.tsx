import { Link } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  Building2,
  CalendarClock,
  Receipt,
  Target,
  Wallet,
} from "lucide-react";
import { PanelHead } from "../admin/AdminLayout";
import { Badge, EmptyState, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import {
  getCompanyById,
  listCommissions,
  listCompanies,
  listLeads,
  listMemberships,
  listSales,
} from "../lib/repo";

const RENEWAL_WINDOW_DAYS = 60;

/** İki tarih arasındaki gün farkı (yerel gün bazında). */
function daysUntil(iso: string): number {
  const end = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((end - now) / 86_400_000);
}

export default function RepDashboard() {
  const actor = useActor();
  const leads = listLeads(actor);
  const sales = listSales(actor);
  const companies = listCompanies().filter((c) => c.repId === actor.repId);
  const memberships = listMemberships(actor);
  const commissions = listCommissions(actor);

  const confirmed = sales.filter((s) => s.status === "odendi");
  const pendingCommission = commissions
    .filter((c) => c.com.status !== "odendi")
    .reduce((sum, c) => sum + c.com.amount, 0);
  const paidCommission = commissions
    .filter((c) => c.com.status === "odendi")
    .reduce((sum, c) => sum + c.com.amount, 0);

  const renewals = memberships
    .filter((m) => m.status === "aktif")
    .map((m) => ({ membership: m, days: daysUntil(m.endsAt) }))
    .filter((r) => r.days <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);

  const recentSales = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <div className="panel-content">
      <PanelHead
        title="Ana sayfa"
        desc="Kendi firmalarınız, satışlarınız ve kazanç durumunuz. Yalnızca size ait kayıtlar gösterilir."
        action={
          <Link className="btn btn--primary" to="/temsilci/uyelik">
            <Wallet size={16} strokeWidth={2} aria-hidden="true" />
            Üyelik satışı
          </Link>
        }
      />

      <div
        className="stats-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,215px),1fr))", gap: 14 }}
      >
        <StatCard
          icon={<Building2 size={20} strokeWidth={1.9} />}
          label="Eklediğim firmalar"
          value={companies.length}
          hint={`${leads.length} firma adayı topladınız`}
        />
        <StatCard
          icon={<Receipt size={20} strokeWidth={1.9} />}
          label="Gerçekleşen satış"
          value={confirmed.length}
          tone="success"
          hint={formatTRY(confirmed.reduce((s, x) => s + x.amount, 0))}
        />
        <StatCard
          icon={<Banknote size={20} strokeWidth={1.9} />}
          label="Hak edilmiş komisyon"
          value={formatTRY(paidCommission)}
          tone="primary"
          hint={`${formatTRY(pendingCommission)} onay bekliyor`}
        />
        <StatCard
          icon={<CalendarClock size={20} strokeWidth={1.9} />}
          label="Takip edilecek yenileme"
          value={renewals.length}
          tone={renewals.length ? "warning" : "default"}
          hint={`${RENEWAL_WINDOW_DAYS} gün içinde biten üyelik`}
        />
      </div>

      <div
        className="grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: 16, marginTop: 18 }}
      >
        <section className="card card__pad">
          <h3 style={{ fontWeight: 800 }}>Hızlı işlemler</h3>
          <p className="text-muted small">Sahada en sık kullandığınız üç adım.</p>
          <div className="quick-grid" style={{ marginTop: 12 }}>
            <Link className="quick-tile" to="/temsilci/firmalar">
              <span className="quick-tile__icon" aria-hidden="true">
                <Target size={16} strokeWidth={1.9} />
              </span>
              <span>
                <strong>Firma bul / ekle</strong>
                <span className="text-muted small">Ara, mükerrer kontrol et, aday kaydet</span>
              </span>
            </Link>
            <Link className="quick-tile" to="/temsilci/uyelik">
              <span className="quick-tile__icon" aria-hidden="true">
                <Wallet size={16} strokeWidth={1.9} />
              </span>
              <span>
                <strong>Üyelik satışı</strong>
                <span className="text-muted small">Firma seç, satış kaydı aç</span>
              </span>
            </Link>
            <Link className="quick-tile" to="/temsilci/satislarim">
              <span className="quick-tile__icon" aria-hidden="true">
                <Receipt size={16} strokeWidth={1.9} />
              </span>
              <span>
                <strong>Satışlarım</strong>
                <span className="text-muted small">Ödeme ve komisyon durumu</span>
              </span>
            </Link>
          </div>

          <h4 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
            Yaklaşan yenilemeler
          </h4>
          {renewals.length === 0 ? (
            <p className="text-muted small" style={{ margin: 0 }}>
              Önümüzdeki {RENEWAL_WINDOW_DAYS} gün içinde biten üyelik yok.
            </p>
          ) : (
            <ul className="pick-list" aria-label="Yaklaşan yenilemeler">
              {renewals.map(({ membership, days }) => (
                <li key={membership.id}>
                  <div className="pick-list__item" style={{ cursor: "default" }}>
                    <span className="pick-list__main">
                      <strong>{getCompanyById(membership.companyId)?.name ?? "Firma"}</strong>
                      <span className="text-muted small">
                        Bitiş: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(membership.endsAt))}
                      </span>
                    </span>
                    <Badge tone={days <= 14 ? "orange" : "gray"}>
                      {days < 0 ? "Süresi geçti" : `${days} gün`}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card__pad">
          <div className="flex-between">
            <h3 style={{ fontWeight: 800 }}>Son satışlarım</h3>
            <Link to="/temsilci/satislarim" className="small">
              Tümü
            </Link>
          </div>
          {recentSales.length === 0 ? (
            <EmptyState
              icon={<Receipt size={28} strokeWidth={1.6} aria-hidden="true" />}
              title="Henüz satış kaydınız yok"
              description="Üyelik Satışı ekranından ilk satışınızı açabilirsiniz."
              action={
                <Link className="btn btn--primary btn--sm" to="/temsilci/uyelik">
                  Satış aç
                  <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                </Link>
              }
            />
          ) : (
            <ul className="pick-list" aria-label="Son satışlarım">
              {recentSales.map((sale) => {
                const company = getCompanyById(sale.companyId);
                return (
                  <li key={sale.id}>
                    <div className="pick-list__item" style={{ cursor: "default" }}>
                      <span className="pick-list__main">
                        <strong>{company?.name ?? "Firma"}</strong>
                        <span className="text-muted small">{formatDateTime(sale.createdAt)}</span>
                      </span>
                      <span style={{ display: "grid", justifyItems: "end", gap: 3 }}>
                        <strong className="small">{formatTRY(sale.amount)}</strong>
                        <Badge tone={sale.status === "odendi" ? "green" : sale.status === "iptal" ? "red" : "orange"}>
                          {sale.status === "odendi" ? "Kesinleşti" : sale.status === "iptal" ? "İptal" : "Beklemede"}
                        </Badge>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
