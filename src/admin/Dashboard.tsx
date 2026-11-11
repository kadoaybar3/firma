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
import { Badge, EmptyState, InfoBanner, auditActionLabels } from "../components/ui";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatDateTime, formatTRY } from "../lib/format";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  getCompanyById,
  listAudit,
  listCompanies,
  listCommissionPayoutSummary,
  listCommissions,
  listLeads,
  listPayments,
  listReps,
  listSales,
  monthlyReport,
} from "../lib/repo";
import type { Payment, Sale } from "../lib/types";

const QUICK_ACTIONS = [
  { to: "/yonetim/firmalar", label: "Firma ekle", desc: "Yeni kayıt", icon: Store },
  { to: "/yonetim/ice-aktar", label: "İçe aktar", desc: "Toplu liste", icon: Download },
  { to: "/yonetim/odemeler", label: "Ödeme onayla", desc: "EFT kuyruğu", icon: CreditCard },
  { to: "/yonetim/satislar", label: "Satış aç", desc: "Yeni üyelik", icon: Wallet },
  { to: "/yonetim/adaylar", label: "Adayları gör", desc: "Saha bildirimleri", icon: Target },
  { to: "/yonetim/temsilciler", label: "Personel", desc: "Ekip yönetimi", icon: Users },
];

function saleStatus(sale: Sale): { tone: "green" | "orange" | "red"; label: string } {
  if (sale.status === "odendi") return { tone: "green", label: "Kesinleşti" };
  if (sale.status === "iptal") return { tone: "red", label: "İptal" };
  return { tone: "orange", label: "Bekliyor" };
}

function paymentMethod(payment?: Payment): string {
  if (!payment) return "Kayıt yok";
  if (payment.provider === "eft") return "EFT";
  if (payment.provider === "hicbiri") return "Manuel";
  return "Kart";
}

function paymentLabel(payment: Payment): { tone: "green" | "orange" | "red" | "gray"; label: string } {
  if (payment.status === "onaylandi") return { tone: "green", label: "Onaylandı" };
  if (payment.status === "beklemede") return { tone: "orange", label: "Bekliyor" };
  if (payment.status === "hata") return { tone: "red", label: "Reddedildi" };
  return { tone: "gray", label: "İade" };
}

export default function AdminDashboard() {
  useLiveDataRevision();
  const actor = useActor();
  const companies = listCompanies({ includeUnpublished: true });
  const payments = listPayments(actor);
  const sales = listSales(actor);
  const leads = listLeads(actor);
  const reps = listReps(actor);
  const commissions = listCommissions(actor);
  const payoutSummary = listCommissionPayoutSummary(actor);
  const audit = listAudit(6);
  const months = monthlyReport(6);

  const published = companies.filter((company) => company.published).length;
  const unpublished = companies.length - published;
  const activeReps = reps.filter((rep) => rep.status === "aktif");
  const confirmedSales = sales.filter((sale) => sale.status === "odendi");
  const collected = confirmedSales.reduce((sum, sale) => sum + sale.amount, 0);
  const potentialSales = sales.filter((sale) => sale.status === "potansiyel");

  /** Ödeme onayı bekleyen satışlar: kaydı olmayan veya ödemesi henüz onaylanmamış. */
  const awaitingPayment = potentialSales.filter((sale) => {
    const rows = payments.filter((payment) => payment.saleId === sale.id);
    return !rows.some((payment) => payment.status === "onaylandi");
  });
  const pendingLeads = leads.filter(
    (lead) => lead.status === "anlaşma" && !lead.convertedToCompanyId,
  );
  const openLeads = leads.filter((lead) => lead.status !== "anlaşma" && lead.status !== "iptal");
  const outstandingCommission = payoutSummary.reduce((sum, row) => sum + row.outstanding, 0);

  const recentSales = sales.slice(0, 6);
  const recentPayments = [...payments]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  const perf = reps
    .map((rep) => {
      const repSales = confirmedSales.filter((sale) => sale.repId === rep.id);
      const amount = repSales.reduce((sum, sale) => sum + sale.amount, 0);
      const commission = commissions
        .filter(({ com }) => com.repId === rep.id)
        .reduce((sum, { com }) => sum + com.amount, 0);
      return { rep, count: repSales.length, amount, commission };
    })
    .sort((a, b) => b.amount - a.amount);
  const maxPerf = Math.max(1, ...perf.map((row) => row.amount));

  const maxMonth = Math.max(1, ...months.map((month) => month.totalAmount));

  return (
    <div className="panel-content">
      <PanelHead
        title="Genel Bakış"
        desc="Firma, satış, tahsilat ve saha ekibinin güncel durumu. Tüm rakamlar kayıtlı gerçek verilerden hesaplanır."
      />

      {!isSupabaseConfigured && (
        <InfoBanner>
          <strong>Demo mod aktif:</strong> Veriler bu tarayıcıda tutuluyor.
        </InfoBanner>
      )}

      <div className="adm-kpi-band" aria-label="Özet göstergeler">
        <div className="adm-kpi">
          <div className="adm-kpi__label">
            <Store size={14} strokeWidth={1.9} aria-hidden="true" /> Toplam firma
          </div>
          <div className="adm-kpi__value">{companies.length}</div>
          <div className="adm-kpi__hint">Rehberdeki tüm kayıtlar</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">
            <BadgeCheck size={14} strokeWidth={1.9} aria-hidden="true" /> Yayındaki
          </div>
          <div className="adm-kpi__value">{published}</div>
          <div className="adm-kpi__hint">Sitede görünen firmalar</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">
            <CircleAlert size={14} strokeWidth={1.9} aria-hidden="true" /> Onay bekleyen
          </div>
          <div className="adm-kpi__value">{unpublished}</div>
          <div className="adm-kpi__hint">Yayına alınmayı bekleyen</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">
            <Wallet size={14} strokeWidth={1.9} aria-hidden="true" /> Toplam satış
          </div>
          <div className="adm-kpi__value">{sales.length}</div>
          <div className="adm-kpi__hint">{potentialSales.length} satış beklemede</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">
            <ChartNoAxesColumnIncreasing size={14} strokeWidth={1.9} aria-hidden="true" />{" "}
            Tahsil edilen
          </div>
          <div className="adm-kpi__value">{formatTRY(collected)}</div>
          <div className="adm-kpi__hint">{confirmedSales.length} kesinleşen satış</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">
            <CreditCard size={14} strokeWidth={1.9} aria-hidden="true" /> Ödeme onayı
          </div>
          <div className="adm-kpi__value">{awaitingPayment.length}</div>
          <div className="adm-kpi__hint">EFT / manuel tahsilat</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">
            <Users size={14} strokeWidth={1.9} aria-hidden="true" /> Aktif personel
          </div>
          <div className="adm-kpi__value">{activeReps.length}</div>
          <div className="adm-kpi__hint">{reps.length} kayıtlı personel</div>
        </div>
      </div>

      <div className="adm-dash-grid">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Wallet size={16} strokeWidth={1.9} aria-hidden="true" /> Son satışlar
            </h2>
            <Link className="adm-panel__link" to="/yonetim/satislar">
              Tümü <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="adm-panel__body adm-panel__body--flush">
            {recentSales.length === 0 ? (
              <EmptyState
                title="Henüz satış kaydı yok"
                description="İlk satışı açtığınızda burada görünecek."
              />
            ) : (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th>Firma</th>
                      <th>Kanal</th>
                      <th>Tutar</th>
                      <th>Durum</th>
                      <th>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.map((sale) => {
                      const company = getCompanyById(sale.companyId);
                      const status = saleStatus(sale);
                      const rep = reps.find((row) => row.id === sale.repId);
                      return (
                        <tr key={sale.id}>
                          <td>
                            <strong className="adm-list__title" style={{ display: "block" }}>
                              {company?.name ?? "—"}
                            </strong>
                            <span className="text-muted small">
                              {sale.channel === "temsilci"
                                ? rep?.name ?? "Temsilci"
                                : sale.referralCode
                                  ? `Doğrudan · ${sale.referralCode}`
                                  : "Doğrudan"}
                            </span>
                          </td>
                          <td className="small text-muted">
                            {sale.renewalForMembershipId ? "Yenileme" : "Üyelik"}
                          </td>
                          <td>{formatTRY(sale.amount)}</td>
                          <td>
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </td>
                          <td className="small text-muted">{formatDateTime(sale.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <div className="adm-dash-stack">
          <section className="adm-panel">
            <div className="adm-panel__head">
              <h2>
                <CircleAlert size={16} strokeWidth={1.9} aria-hidden="true" /> Bekleyen işlemler
              </h2>
              <Badge tone={awaitingPayment.length + pendingLeads.length + unpublished ? "orange" : "green"}>
                {awaitingPayment.length + pendingLeads.length + unpublished}
              </Badge>
            </div>
            <div className="adm-panel__body">
              <Link className="adm-task adm-task--warn" to="/yonetim/odemeler">
                <span className="adm-task__icon" aria-hidden="true">
                  <CreditCard size={16} strokeWidth={1.9} />
                </span>
                <span className="adm-task__text">
                  <strong>{awaitingPayment.length} ödeme onayı bekliyor</strong>
                  <span>EFT onayı satışı ve komisyonu kesinleştirir</span>
                </span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link className="adm-task adm-task--warn" to="/yonetim/adaylar">
                <span className="adm-task__icon" aria-hidden="true">
                  <Target size={16} strokeWidth={1.9} />
                </span>
                <span className="adm-task__text">
                  <strong>{pendingLeads.length} anlaşma bildirimi</strong>
                  <span>Firmaya dönüştürüp satış açın</span>
                </span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link className="adm-task adm-task--blue" to="/yonetim/firmalar">
                <span className="adm-task__icon" aria-hidden="true">
                  <Store size={16} strokeWidth={1.9} />
                </span>
                <span className="adm-task__text">
                  <strong>{unpublished} firma yayın dışı</strong>
                  <span>İçerik kontrolü sonrası yayına alın</span>
                </span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link className="adm-task" to="/yonetim/adaylar">
                <span className="adm-task__icon" aria-hidden="true">
                  <Target size={16} strokeWidth={1.9} />
                </span>
                <span className="adm-task__text">
                  <strong>{openLeads.length} aday takip bekliyor</strong>
                  <span>Yeni, iletişim ve görüşme aşamasındakiler</span>
                </span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section className="adm-panel">
            <div className="adm-panel__head">
              <h2>Hızlı işlemler</h2>
            </div>
            <div className="adm-panel__body">
              <div className="adm-quick">
                {QUICK_ACTIONS.map(({ to, label, desc, icon: Icon }) => (
                  <Link key={to} className="adm-quick__item" to={to}>
                    <span className="adm-quick__icon" aria-hidden="true">
                      <Icon size={15} strokeWidth={1.9} />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{desc}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="adm-dash-grid" style={{ marginTop: 14 }}>
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <CreditCard size={16} strokeWidth={1.9} aria-hidden="true" /> Son ödeme hareketleri
            </h2>
            <Link className="adm-panel__link" to="/yonetim/odemeler">
              Ödeme onayları <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="adm-panel__body">
            {recentPayments.length === 0 ? (
              <p className="text-muted small">Henüz ödeme kaydı oluşmadı.</p>
            ) : (
              <div className="adm-list">
                {recentPayments.map((payment) => {
                  const sale = sales.find((row) => row.id === payment.saleId);
                  const company = sale ? getCompanyById(sale.companyId) : undefined;
                  const status = paymentLabel(payment);
                  return (
                    <div className="adm-list__row" key={payment.id}>
                      <span
                        className={`adm-dot ${
                          payment.status === "onaylandi"
                            ? "adm-dot--green"
                            : payment.status === "beklemede"
                              ? "adm-dot--amber"
                              : payment.status === "hata"
                                ? "adm-dot--red"
                                : "adm-dot--blue"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="adm-list__main">
                        <span className="adm-list__title">{company?.name ?? "—"}</span>
                        <span className="adm-list__meta">
                          {paymentMethod(payment)} · {formatDateTime(payment.updatedAt)}
                        </span>
                      </span>
                      <span className="adm-list__amount">
                        {formatTRY(payment.amount)}
                        <span style={{ display: "block", marginTop: 3 }}>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Users size={16} strokeWidth={1.9} aria-hidden="true" /> Personel performansı
            </h2>
            <Link className="adm-panel__link" to="/yonetim/temsilciler">
              Personel <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="adm-panel__body">
            {perf.length === 0 ? (
              <p className="text-muted small">Kayıtlı personel yok.</p>
            ) : (
              <>
                {perf.slice(0, 4).map(({ rep, count, amount, commission }) => (
                  <div className="adm-perf" key={rep.id}>
                    <div className="adm-perf__top">
                      <span className="adm-perf__name">
                        {rep.name}{" "}
                        <Badge tone={rep.status === "aktif" ? "green" : "gray"}>
                          {rep.status === "aktif" ? "Aktif" : "Pasif"}
                        </Badge>
                      </span>
                      <span className="adm-perf__value">{formatTRY(amount)}</span>
                    </div>
                    <span className="adm-perf__meter" aria-hidden="true">
                      <span
                        className="adm-perf__fill"
                        style={{ width: `${amount === 0 ? 0 : Math.max(4, (amount / maxPerf) * 100)}%` }}
                      />
                    </span>
                    <div className="adm-perf__meta">
                      {count} kesinleşen satış · {formatTRY(commission)} komisyon
                    </div>
                  </div>
                ))}
                {outstandingCommission > 0 && (
                  <p className="text-muted small" style={{ marginTop: 10 }}>
                    Temsilcilere toplam {formatTRY(outstandingCommission)} ödeme bekliyor.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      <section className="adm-panel" style={{ marginTop: 14 }}>
        <div className="adm-panel__head">
          <h2>
            <ChartNoAxesColumnIncreasing size={16} strokeWidth={1.9} aria-hidden="true" /> Son 6 ay
            satış eğilimi
          </h2>
          <Link className="adm-panel__link" to="/yonetim/raporlar">
            Raporlar <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <div className="adm-panel__body">
          {maxMonth <= 1 && months.every((month) => month.totalAmount === 0) ? (
            <p className="text-muted small">Kesinleşen satış olmadığı için grafik boş.</p>
          ) : (
            <div className="adm-bars">
              {months.map((month) => (
                <div className="adm-bar" key={month.month}>
                  <span className="adm-bar__label">
                    {new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit" }).format(
                      new Date(`${month.month}-01T12:00:00`),
                    )}
                  </span>
                  <span
                    className="adm-bar__track"
                    role="img"
                    aria-label={`${month.saleCount} satış, ${formatTRY(month.totalAmount)}`}
                  >
                    <span
                      className="adm-bar__fill"
                      style={{ width: `${(month.totalAmount / maxMonth) * 100}%` }}
                    />
                  </span>
                  <span className="adm-bar__value">
                    {formatTRY(month.totalAmount)}{" "}
                    <span className="text-muted">· {month.saleCount}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="adm-panel" style={{ marginTop: 14 }}>
        <div className="adm-panel__head">
          <h2>Son denetim kayıtları</h2>
          <Link className="adm-panel__link" to="/yonetim/denetim">
            Tüm denetim kayıtları <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <div className="adm-panel__body adm-panel__body--flush">
          {audit.length === 0 ? (
            <p className="text-muted small" style={{ padding: 18 }}>
              Henüz denetim kaydı yok.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 560 }}>
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
                      <td>{entry.summary}</td>
                      <td className="small text-muted">{entry.actorRole}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
