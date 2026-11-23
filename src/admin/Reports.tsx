import { useState } from "react";
import {
  BadgeCheck,
  Banknote,
  Receipt,
  Store,
  Tag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY } from "../lib/format";
import {
  categoryCompanyCount,
  getCompanyById,
  listCategories,
  listCommissions,
  listCommissionPayouts,
  listCommissionPayoutSummary,
  listCompanies,
  listPayments,
  listReps,
  listSales,
} from "../lib/repo";
import type { Payment } from "../lib/types";

/*
 * ANALİZ
 *
 * Sıra: göstergeler → eğilimler → kişi/komisyon → dağılımlar → (kapalı) ayrıntı.
 * Her sayı TEK yerde gösterilir; aynı tutar hem kartta hem listede tekrarlanmaz.
 * Hesaplamalar ve veri kaynakları raporun önceki sürümüyle aynıdır.
 */

type GroupMode = "gunluk" | "haftalik" | "aylik";

const GROUP_LABEL: Record<GroupMode, string> = {
  gunluk: "Günlük",
  haftalik: "Haftalık",
  aylik: "Aylık",
};

function isoDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function bucketKey(value: string, mode: GroupMode): string {
  const date = new Date(value);
  if (mode === "aylik") return isoDay(date).slice(0, 7);
  if (mode === "gunluk") return isoDay(date);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Pazartesi başlangıcı
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
  return isoDay(monday);
}

function bucketLabel(key: string, mode: GroupMode): string {
  if (mode === "aylik") {
    return new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit" }).format(
      new Date(`${key}-01T12:00:00`),
    );
  }
  const date = new Date(`${key}T12:00:00`);
  const base = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(date);
  return mode === "haftalik" ? `${base} haftası` : base;
}

function methodOf(payment: Payment): "Kart" | "EFT" | "Manuel" {
  if (payment.provider === "eft") return "EFT";
  if (payment.provider === "hicbiri") return "Manuel";
  return "Kart";
}

function paymentStatusLabel(status: Payment["status"]): string {
  if (status === "onaylandi") return "Onaylandı";
  if (status === "beklemede") return "Bekliyor";
  if (status === "hata") return "Reddedildi";
  return "İade";
}

interface TrendPoint {
  key: string;
  label: string;
  amount: number;
  count: number;
}

/** Dönem kovalarına göre tutar/sayı dizisi — en güncel 14 dönem. */
function buildTrend(
  items: Array<{ at: string; amount: number }>,
  mode: GroupMode,
): TrendPoint[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const item of items) {
    const key = bucketKey(item.at, mode);
    const row = map.get(key) ?? { amount: 0, count: 0 };
    row.amount += item.amount;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([key, value]) => ({ key, label: bucketLabel(key, mode), ...value }));
}

/** Tek bar listesi — satış, tahsilat ve yöntem dağılımı aynı görünümü kullanır. */
function TrendBars({
  rows,
  max,
  unit,
  emptyText,
}: {
  rows: TrendPoint[];
  max: number;
  unit: string;
  emptyText: string;
}) {
  if (rows.length === 0) return <p className="text-muted small">{emptyText}</p>;

  return (
    <div className="adm-bars">
      {rows.map((row) => (
        <div className="adm-bar" key={row.key}>
          <span className="adm-bar__label">{row.label}</span>
          <span
            className="adm-bar__track"
            role="img"
            aria-label={`${row.count} ${unit}, ${formatTRY(row.amount)}`}
          >
            <span className="adm-bar__fill" style={{ width: `${(row.amount / max) * 100}%` }} />
          </span>
          <span className="adm-bar__value">
            {formatTRY(row.amount)} <span className="text-muted">· {row.count}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminReports() {
  const actor = useActor();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<GroupMode>("aylik");
  const [showAllCategories, setShowAllCategories] = useState(false);

  const sales = listSales(actor);
  const payments = listPayments(actor);
  const commissions = listCommissions(actor);
  const payouts = listCommissionPayouts(actor);
  const reps = listReps(actor);
  const allCompanies = listCompanies({ includeUnpublished: true });

  const confirmedAll = sales.filter((sale) => sale.status === "odendi");
  const inRange = (value: string): boolean => {
    const day = isoDay(value);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  };

  const confirmedSales = confirmedAll.filter((sale) =>
    inRange(sale.confirmedAt ?? sale.createdAt),
  );
  const rangePayments = payments.filter((payment) => inRange(payment.createdAt));
  const rangeCommissions = commissions.filter(({ com }) => inRange(com.createdAt));
  // Dönemde ÖDENEN komisyon: yalnız commission_payouts defteri, payout'un
  // paidAt tarihi aralığa giren kayıtlar (nakit çıkışı).
  const rangePayouts = payouts.filter((payout) => inRange(payout.paidAt));

  const totalRevenue = confirmedSales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalCommission = rangeCommissions.reduce((sum, { com }) => sum + com.amount, 0);
  const paidCommission = rangePayouts.reduce((sum, payout) => sum + payout.amount, 0);
  // Güncel kalan hakediş: dönem filtresinden BAĞIMSIZ, defterin tamamından.
  const outstandingCommission = listCommissionPayoutSummary(actor).reduce(
    (sum, row) => sum + row.outstanding,
    0,
  );

  const approvedPayments = rangePayments.filter((payment) => payment.status === "onaylandi");
  const collected = approvedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingPayments = rangePayments.filter((payment) => payment.status === "beklemede");
  const pendingAmount = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);

  /** Ödeme kaydı henüz açılmamış bekleyen satışlar da tahsilat kuyruğundadır. */
  const pendingSales = sales.filter((sale) => {
    if (sale.status !== "potansiyel" || !inRange(sale.createdAt)) return false;
    return !payments.some(
      (payment) => payment.saleId === sale.id && payment.status === "onaylandi",
    );
  });

  const trend = buildTrend(
    confirmedSales.map((sale) => ({
      at: sale.confirmedAt ?? sale.createdAt,
      amount: sale.amount,
    })),
    mode,
  );
  const maxTrend = Math.max(1, ...trend.map((row) => row.amount));

  /** Tahsilat eğilimi — onaylanmış ödemeler, satış trendiyle aynı kovalar. */
  const collectedTrend = buildTrend(
    approvedPayments.map((payment) => ({ at: payment.createdAt, amount: payment.amount })),
    mode,
  );
  const maxCollected = Math.max(1, ...collectedTrend.map((row) => row.amount));

  const repPerformance = reps
    .map((rep) => {
      const repSales = confirmedSales.filter((sale) => sale.repId === rep.id);
      const amount = repSales.reduce((sum, sale) => sum + sale.amount, 0);
      const repCommission = rangeCommissions
        .filter(({ com }) => com.repId === rep.id)
        .reduce((sum, { com }) => sum + com.amount, 0);
      return { rep, count: repSales.length, amount, commission: repCommission };
    })
    .sort((a, b) => b.amount - a.amount);
  const maxRep = Math.max(1, ...repPerformance.map((row) => row.amount));

  const methods: Array<"Kart" | "EFT" | "Manuel"> = ["Kart", "EFT", "Manuel"];
  const methodRows = methods.map((method) => {
    const rows = approvedPayments.filter((payment) => methodOf(payment) === method);
    return {
      method,
      count: rows.length,
      amount: rows.reduce((sum, payment) => sum + payment.amount, 0),
    };
  });
  const methodTotal = Math.max(1, methodRows.reduce((sum, row) => sum + row.amount, 0));

  const categories = listCategories()
    .map((category) => ({ category, count: categoryCompanyCount(category.id) }))
    .sort((a, b) => b.count - a.count);
  const maxCategory = Math.max(1, ...categories.map((row) => row.count));

  const publishedCompanies = allCompanies.filter((company) => company.published).length;
  const companyTotal = allCompanies.length;
  const unpublishedCompanies = companyTotal - publishedCompanies;
  const publishedShare = companyTotal === 0 ? 0 : (publishedCompanies / companyTotal) * 100;

  const applyQuickRange = (days: number | "year" | "all") => {
    if (days === "all") {
      setFrom("");
      setTo("");
      return;
    }
    const end = new Date();
    const start = new Date();
    if (days === "year") start.setMonth(0, 1);
    else start.setDate(start.getDate() - days + 1);
    setFrom(isoDay(start));
    setTo(isoDay(end));
  };

  return (
    <div className="panel-content">
      <PanelHead
        title="Analiz"
        desc="Dönem seçin; göstergeler, eğilimler ve dağılımlar tek ekranda."
      />

      <div className="adm-filterbar">
        <div className="adm-filtergrid">
          <label className="adm-filter">
            <span>Başlangıç tarihi</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="adm-filter">
            <span>Bitiş tarihi</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="adm-filter">
            <span>Grafik dönemi</span>
            <div className="adm-seg" role="group" aria-label="Grafik dönemi">
              {(Object.keys(GROUP_LABEL) as GroupMode[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={mode === key ? "is-active" : ""}
                  aria-pressed={mode === key}
                  onClick={() => setMode(key)}
                >
                  {GROUP_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="adm-filterbar__foot">
          <span>
            {from || to
              ? `${from ? new Date(`${from}T12:00:00`).toLocaleDateString("tr-TR") : "Başlangıç"} – ${
                  to ? new Date(`${to}T12:00:00`).toLocaleDateString("tr-TR") : "Bugün"
                }`
              : "Tüm zamanlar"}
          </span>
          <div className="adm-filterbar__actions">
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => applyQuickRange(7)}>
              Son 7 gün
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => applyQuickRange(30)}>
              Son 30 gün
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => applyQuickRange("year")}>
              Bu yıl
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => applyQuickRange("all")}>
              Tümü
            </button>
          </div>
        </div>
      </div>

      {/* ============ 1) TEMEL GÖSTERGELER ============ */}
      <div className="stats-grid">
        <StatCard
          icon={<Wallet size={20} strokeWidth={1.9} />}
          label="Kesinleşen satış"
          value={formatTRY(totalRevenue)}
          tone="success"
          hint={`${confirmedSales.length} satış`}
        />
        <StatCard
          icon={<BadgeCheck size={20} strokeWidth={1.9} />}
          label="Tahsil edilen"
          value={formatTRY(collected)}
          hint={`${approvedPayments.length} onaylı ödeme`}
        />
        <StatCard
          icon={<Banknote size={20} strokeWidth={1.9} />}
          label="Bekleyen tahsilat"
          value={formatTRY(pendingAmount)}
          tone={pendingAmount > 0 ? "warning" : "default"}
          hint={`${pendingPayments.length} ödeme kaydı`}
        />
        <StatCard
          icon={<Receipt size={20} strokeWidth={1.9} />}
          label="Kalan hakediş"
          value={formatTRY(outstandingCommission)}
          hint="Tüm dönemler"
        />
      </div>

      <div className="adm-report-grid" style={{ marginTop: 14 }}>
        {/* ============ 2) EĞİLİMLER ============ */}
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <TrendingUp size={16} strokeWidth={1.9} aria-hidden="true" /> Satış eğilimi
            </h2>
            <Badge tone="blue">{GROUP_LABEL[mode]}</Badge>
          </div>
          <div className="adm-panel__body">
            <TrendBars
              rows={trend}
              max={maxTrend}
              unit="satış"
              emptyText="Seçilen aralıkta kesinleşen satış yok."
            />
          </div>
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Banknote size={16} strokeWidth={1.9} aria-hidden="true" /> Tahsilat eğilimi
            </h2>
            <Badge tone="gray">{approvedPayments.length} ödeme</Badge>
          </div>
          <div className="adm-panel__body">
            <TrendBars
              rows={collectedTrend}
              max={maxCollected}
              unit="ödeme"
              emptyText="Seçilen aralıkta onaylanmış ödeme yok."
            />

            <div className="adm-report-sub">Ödeme yöntemi</div>
            <TrendBars
              rows={methodRows.map((row) => ({
                key: row.method,
                label: row.method,
                amount: row.amount,
                count: row.count,
              }))}
              max={methodTotal}
              unit="ödeme"
              emptyText="Onaylanmış ödeme yok."
            />
          </div>
        </section>

        {/* ============ 3) PERSONEL VE KOMİSYON ============ */}
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Users size={16} strokeWidth={1.9} aria-hidden="true" /> Personel performansı
            </h2>
            <Badge tone="gray">{reps.length} personel</Badge>
          </div>
          <div className="adm-panel__body">
            {repPerformance.length === 0 ? (
              <p className="text-muted small">Kayıtlı personel yok.</p>
            ) : (
              repPerformance.map(({ rep, count, amount, commission }) => (
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
                      style={{ width: `${amount === 0 ? 0 : Math.max(4, (amount / maxRep) * 100)}%` }}
                    />
                  </span>
                  <div className="adm-perf__meta">
                    {count} kesinleşen satış · {formatTRY(commission)} komisyon
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Receipt size={16} strokeWidth={1.9} aria-hidden="true" /> Komisyon
            </h2>
            <Badge tone="blue">{rangeCommissions.length} kayıt</Badge>
          </div>
          <div className="adm-panel__body">
            <div className="adm-list">
              <div className="adm-list__row">
                <span className="adm-dot adm-dot--blue" aria-hidden="true" />
                <span className="adm-list__main">
                  <span className="adm-list__title">Dönemde kazanılan</span>
                  <span className="adm-list__meta">Kesinleşen satışlardan</span>
                </span>
                <span className="adm-list__amount">{formatTRY(totalCommission)}</span>
              </div>
              <div className="adm-list__row">
                <span className="adm-dot adm-dot--green" aria-hidden="true" />
                <span className="adm-list__main">
                  <span className="adm-list__title">Dönemde ödenen</span>
                  <span className="adm-list__meta">Ödeme defteri</span>
                </span>
                <span className="adm-list__amount">{formatTRY(paidCommission)}</span>
              </div>
            </div>
            <p className="text-muted small" style={{ marginTop: 12 }}>
              Platform payı (gider öncesi): <strong>{formatTRY(totalRevenue - totalCommission)}</strong>
            </p>
          </div>
        </section>

        {/* ============ 4) DAĞILIMLAR ============ */}
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Tag size={16} strokeWidth={1.9} aria-hidden="true" /> Kategori dağılımı
            </h2>
            <Badge tone="gray">{categories.length} kategori</Badge>
          </div>
          <div className="adm-panel__body">
            {categories.length === 0 ? (
              <p className="text-muted small">Kategori yok.</p>
            ) : (
              <div className="adm-bars">
                {categories.slice(0, showAllCategories ? categories.length : 6).map(({ category, count }) => (
                  <div className="adm-bar adm-bar--wide" key={category.id}>
                    <span className="adm-bar__label" title={category.name}>
                      {category.name}
                    </span>
                    <span className="adm-bar__track">
                      <span
                        className="adm-bar__fill"
                        style={{ width: `${(count / maxCategory) * 100}%` }}
                      />
                    </span>
                    <span className="adm-bar__value">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {categories.length > 6 && (
              <button
                type="button"
                className="btn btn--sm"
                style={{ marginTop: 12 }}
                aria-expanded={showAllCategories}
                onClick={() => setShowAllCategories((current) => !current)}
              >
                {showAllCategories ? "Daha az göster" : `Devamını göster (${categories.length - 6})`}
              </button>
            )}
            <p className="text-muted small" style={{ marginTop: 12 }}>
              Yalnızca yayındaki firmalar; tarih aralığından bağımsız.
            </p>
          </div>
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <Store size={16} strokeWidth={1.9} aria-hidden="true" /> Firma dağılımı
            </h2>
            <Badge tone="gray">{companyTotal} firma</Badge>
          </div>
          <div className="adm-panel__body">
            <div className="adm-bars">
              <div className="adm-bar">
                <span className="adm-bar__label">Yayında</span>
                <span className="adm-bar__track" role="img" aria-label={`${publishedCompanies} firma yayında`}>
                  <span className="adm-bar__fill" style={{ width: `${publishedShare}%` }} />
                </span>
                <span className="adm-bar__value">{publishedCompanies}</span>
              </div>
              <div className="adm-bar">
                <span className="adm-bar__label">Yayın dışı</span>
                <span
                  className="adm-bar__track"
                  role="img"
                  aria-label={`${unpublishedCompanies} firma yayın dışı`}
                >
                  <span className="adm-bar__fill" style={{ width: `${100 - publishedShare}%` }} />
                </span>
                <span className="adm-bar__value">{unpublishedCompanies}</span>
              </div>
            </div>
            <p className="text-muted small" style={{ marginTop: 12 }}>
              Toplam {companyTotal} firma
            </p>
          </div>
        </section>
      </div>

      {/* ============ 5) AYRINTILAR (kapalı) ============ */}
      <details className="adm-details">
        <summary>
          Bekleyen ödeme kayıtları
          <span className="adm-details__count">{pendingSales.length}</span>
        </summary>
        <div className="adm-panel__body adm-panel__body--flush">
          {pendingSales.length === 0 ? (
            <p className="text-muted small" style={{ padding: 18 }}>
              Seçilen aralıkta onay bekleyen ödeme yok.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    <th>Firma</th>
                    <th>Personel</th>
                    <th>Tutar</th>
                    <th>Ödeme</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSales.slice(0, 20).map((sale) => {
                    const company = getCompanyById(sale.companyId);
                    const rep = reps.find((row) => row.id === sale.repId);
                    const payment = payments.find((row) => row.saleId === sale.id);
                    return (
                      <tr key={sale.id}>
                        <td data-label="Firma">{company?.name ?? "—"}</td>
                        <td data-label="Personel" className="small text-muted">
                          {rep?.name ?? "Doğrudan"}
                        </td>
                        <td data-label="Tutar">{formatTRY(sale.amount)}</td>
                        <td data-label="Ödeme" className="small">
                          {payment ? methodOf(payment) : "Kayıt yok"}
                        </td>
                        <td data-label="Durum">
                          <Badge tone={payment?.status === "beklemede" ? "orange" : "gray"}>
                            {payment ? paymentStatusLabel(payment.status) : "Ödeme bekliyor"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
