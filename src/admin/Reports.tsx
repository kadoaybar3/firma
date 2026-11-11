import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  CalendarRange,
  CreditCard,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, InfoBanner, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY } from "../lib/format";
import {
  categoryCompanyCount,
  getCompanyById,
  getSettings,
  listCategories,
  listCommissions,
  listCompanies,
  listPayments,
  listReps,
  listSales,
} from "../lib/repo";
import type { Payment } from "../lib/types";

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

export default function AdminReports() {
  const actor = useActor();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<GroupMode>("aylik");
  const [showAllCategories, setShowAllCategories] = useState(false);

  const sales = listSales(actor);
  const payments = listPayments(actor);
  const commissions = listCommissions(actor);
  const reps = listReps(actor);
  const settings = getSettings();

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

  const totalRevenue = confirmedSales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalCommission = rangeCommissions.reduce((sum, { com }) => sum + com.amount, 0);
  const paidCommission = rangeCommissions
    .filter(({ com }) => com.status === "odendi")
    .reduce((sum, { com }) => sum + com.amount, 0);
  const pendingCommission = totalCommission - paidCommission;

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

  const trend = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const sale of confirmedSales) {
      const key = bucketKey(sale.confirmedAt ?? sale.createdAt, mode);
      const row = map.get(key) ?? { amount: 0, count: 0 };
      row.amount += sale.amount;
      row.count += 1;
      map.set(key, row);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([key, value]) => ({ key, label: bucketLabel(key, mode), ...value }));
  }, [confirmedSales, mode]);

  const maxTrend = Math.max(1, ...trend.map((row) => row.amount));

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
  const methodTotal = Math.max(
    1,
    methodRows.reduce((sum, row) => sum + row.amount, 0),
  );

  const categories = listCategories()
    .map((category) => ({ category, count: categoryCompanyCount(category.id) }))
    .sort((a, b) => b.count - a.count);
  const maxCategory = Math.max(1, ...categories.map((row) => row.count));

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
        title="Raporlar"
        desc="Tarih aralığına göre satış, tahsilat, ödeme yöntemi, personel performansı ve komisyon raporları. Gelir rakamları yalnızca kesinleşen satışları sayar."
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
            <span>Satış grafiği</span>
            <div className="adm-seg" role="group" aria-label="Satış grafiği dönemi">
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
          label="Komisyon toplamı"
          value={formatTRY(totalCommission)}
          hint={`${formatTRY(pendingCommission)} ödeme bekliyor`}
        />
      </div>

      <div className="adm-report-grid">
        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <TrendingUp size={16} strokeWidth={1.9} aria-hidden="true" /> Satış trendi
            </h2>
            <Badge tone="blue">{GROUP_LABEL[mode]}</Badge>
          </div>
          <div className="adm-panel__body">
            {trend.length === 0 ? (
              <p className="text-muted small">Seçilen aralıkta kesinleşen satış yok.</p>
            ) : (
              <div className="adm-bars">
                {trend.map((row) => (
                  <div className="adm-bar" key={row.key}>
                    <span className="adm-bar__label">{row.label}</span>
                    <span
                      className="adm-bar__track"
                      role="img"
                      aria-label={`${row.count} satış, ${formatTRY(row.amount)}`}
                    >
                      <span
                        className="adm-bar__fill"
                        style={{ width: `${(row.amount / maxTrend) * 100}%` }}
                      />
                    </span>
                    <span className="adm-bar__value">
                      {formatTRY(row.amount)} <span className="text-muted">· {row.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted small" style={{ marginTop: 10 }}>
              En güncel 14 dönem gösterilir.
            </p>
          </div>
        </section>

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
              <CreditCard size={16} strokeWidth={1.9} aria-hidden="true" /> Kart / EFT dağılımı
            </h2>
          </div>
          <div className="adm-panel__body">
            {approvedPayments.length === 0 ? (
              <p className="text-muted small">Seçilen aralıkta onaylanmış ödeme yok.</p>
            ) : (
              <div className="adm-bars">
                {methodRows.map((row) => (
                  <div className="adm-bar" key={row.method}>
                    <span className="adm-bar__label">{row.method}</span>
                    <span
                      className="adm-bar__track"
                      role="img"
                      aria-label={`${row.method}: ${formatTRY(row.amount)}`}
                    >
                      <span
                        className="adm-bar__fill"
                        style={{ width: `${(row.amount / methodTotal) * 100}%` }}
                      />
                    </span>
                    <span className="adm-bar__value">
                      {formatTRY(row.amount)} <span className="text-muted">· {row.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted small" style={{ marginTop: 10 }}>
              Yalnızca onaylanmış ödemeler; tutar bazlı dağılım.
            </p>
          </div>
        </section>

        <section className="adm-panel">
          <div className="adm-panel__head">
            <h2>
              <CalendarRange size={16} strokeWidth={1.9} aria-hidden="true" /> Tahsilat ve komisyon
            </h2>
          </div>
          <div className="adm-panel__body">
            <div className="adm-list">
              <div className="adm-list__row">
                <span className="adm-dot adm-dot--green" aria-hidden="true" />
                <span className="adm-list__main">
                  <span className="adm-list__title">Tahsil edilen</span>
                  <span className="adm-list__meta">{approvedPayments.length} onaylı ödeme</span>
                </span>
                <span className="adm-list__amount">{formatTRY(collected)}</span>
              </div>
              <div className="adm-list__row">
                <span className="adm-dot adm-dot--amber" aria-hidden="true" />
                <span className="adm-list__main">
                  <span className="adm-list__title">Bekleyen ödemeler</span>
                  <span className="adm-list__meta">{pendingPayments.length} kayıt</span>
                </span>
                <span className="adm-list__amount">{formatTRY(pendingAmount)}</span>
              </div>
              <div className="adm-list__row">
                <span className="adm-dot adm-dot--blue" aria-hidden="true" />
                <span className="adm-list__main">
                  <span className="adm-list__title">Komisyon toplamı</span>
                  <span className="adm-list__meta">{rangeCommissions.length} kayıt</span>
                </span>
                <span className="adm-list__amount">{formatTRY(totalCommission)}</span>
              </div>
              <div className="adm-list__row">
                <span className="adm-dot" aria-hidden="true" />
                <span className="adm-list__main">
                  <span className="adm-list__title">Ödenmemiş komisyon</span>
                  <span className="adm-list__meta">Ödeme bekleyen kayıtlar</span>
                </span>
                <span className="adm-list__amount">{formatTRY(pendingCommission)}</span>
              </div>
            </div>
            <p className="text-muted small" style={{ marginTop: 10 }}>
              Platform payı (gider öncesi): <strong>{formatTRY(totalRevenue - totalCommission)}</strong>.
              Örnek üyelik bedeli {formatTRY(settings.membershipPrice)}.
            </p>
          </div>
        </section>
      </div>

      <section className="adm-panel" style={{ marginTop: 14 }}>
        <div className="adm-panel__head">
          <h2>
            <Banknote size={16} strokeWidth={1.9} aria-hidden="true" /> Bekleyen ödeme kayıtları
          </h2>
          <Badge tone={pendingSales.length ? "orange" : "green"}>{pendingSales.length}</Badge>
        </div>
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
                        <td>{company?.name ?? "—"}</td>
                        <td className="small text-muted">{rep?.name ?? "Doğrudan"}</td>
                        <td>{formatTRY(sale.amount)}</td>
                        <td className="small">{payment ? methodOf(payment) : "Kayıt yok"}</td>
                        <td>
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
      </section>

      <section className="adm-panel" style={{ marginTop: 14 }}>
        <div className="adm-panel__head">
          <h2>Kategori dağılımı</h2>
          <Badge tone="gray">{categories.length} kategori</Badge>
        </div>
        <div className="adm-panel__body">
          <InfoBanner>Yalnızca yayındaki firmalar sayılır; tarih aralığından bağımsızdır.</InfoBanner>
          {categories.slice(0, showAllCategories ? categories.length : 6).map(({ category, count }) => (
            <div className="adm-bar" key={category.id} style={{ marginTop: 10 }}>
              <span className="adm-bar__label" style={{ width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={category.name}>
                {category.icon} {category.name}
              </span>
              <span className="adm-bar__track">
                <span
                  className="adm-bar__fill"
                  style={{ width: `${(count / maxCategory) * 100}%` }}
                />
              </span>
              <span className="adm-bar__value">{count} firma</span>
            </div>
          ))}
          {categories.length > 6 && (
            <button
              type="button"
              className="btn btn--sm"
              style={{ marginTop: 12 }}
              aria-expanded={showAllCategories}
              onClick={() => setShowAllCategories((current) => !current)}
            >
              {showAllCategories
                ? "Daha az göster"
                : `Devamını göster (${categories.length - 6})`}
            </button>
          )}
          <p className="text-muted small" style={{ marginTop: 12 }}>
            Yayındaki toplam firma: {listCompanies().filter((company) => company.published).length}
          </p>
        </div>
      </section>
    </div>
  );
}
