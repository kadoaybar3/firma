import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, FilterX, Loader2, Wallet } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatTRY, formatDateTime } from "../lib/format";
import {
  cancelSale,
  confirmRenewal,
  confirmSale,
  createPendingPayment,
  createSale,
  getCompanyById,
  listCompanies,
  listPayments,
  listReps,
  listSales,
} from "../lib/repo";
import type { Payment, SaleStatus } from "../lib/types";

function paymentTone(status: Payment["status"]): "green" | "orange" | "red" | "gray" {
  if (status === "onaylandi") return "green";
  if (status === "beklemede") return "orange";
  if (status === "hata") return "red";
  return "gray";
}

function paymentLabel(payment: Payment): string {
  const method =
    payment.provider === "eft" ? "EFT" : payment.provider === "hicbiri" ? "Manuel" : "Kart";
  if (payment.status === "onaylandi") return `${method} · onaylandı`;
  if (payment.status === "beklemede") return `${method} · bekliyor`;
  if (payment.status === "hata") return `${method} · reddedildi`;
  return `${method} · iade`;
}

export default function AdminSales() {
  useLiveDataRevision();
  const actor = useActor();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [, setTick] = useState(0);

  // Filtreler — mevcut satış/ödeme verisi üzerinde istemci tarafında çalışır.
  const [q, setQ] = useState("");
  const [repFilter, setRepFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | "eft" | "kart" | "manuel">("all");
  const [payStatusFilter, setPayStatusFilter] = useState<
    "all" | Payment["status"] | "kayit-yok"
  >("all");
  const [saleStatusFilter, setSaleStatusFilter] = useState<"all" | SaleStatus>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const sales = listSales(actor);
  const companies = listCompanies({ includeUnpublished: true });
  const reps = listReps(actor);
  const payments = listPayments(actor);

  /** Hızlı çift tıklama / mükerrer gönderim koruması + yükleme durumu. */
  async function run(key: string, fn: () => Promise<string>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const text = await fn();
      setMessage(text);
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function paymentForSale(saleId: string): Payment | undefined {
    const rows = payments.filter((p) => p.saleId === saleId);
    return (
      rows.find((p) => p.status === "onaylandi") ??
      rows
        .filter((p) => p.status === "beklemede")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    );
  }

  const min = minAmount.trim() === "" ? null : Number(minAmount);
  const max = maxAmount.trim() === "" ? null : Number(maxAmount);

  const filteredSales = sales.filter((sale) => {
    const company = getCompanyById(sale.companyId);
    const rep = reps.find((row) => row.id === sale.repId);
    const payment = paymentForSale(sale.id);

    if (repFilter && sale.repId !== repFilter) return false;
    if (saleStatusFilter !== "all" && sale.status !== saleStatusFilter) return false;
    if (min !== null && Number.isFinite(min) && sale.amount < min) return false;
    if (max !== null && Number.isFinite(max) && sale.amount > max) return false;

    if (from && sale.createdAt.slice(0, 10) < from) return false;
    if (to && sale.createdAt.slice(0, 10) > to) return false;

    if (methodFilter !== "all") {
      if (!payment) return false;
      const isEft = payment.provider === "eft";
      const isManual = payment.provider === "hicbiri";
      const isCard = !isEft && !isManual;
      if (methodFilter === "eft" && !isEft) return false;
      if (methodFilter === "manuel" && !isManual) return false;
      if (methodFilter === "kart" && !isCard) return false;
    }

    if (payStatusFilter !== "all") {
      if (payStatusFilter === "kayit-yok") {
        if (payment) return false;
      } else if (payment?.status !== payStatusFilter) {
        return false;
      }
    }

    if (q.trim()) {
      const haystack = `${company?.name ?? ""} ${rep?.name ?? ""} ${sale.referralCode ?? ""}`
        .toLocaleLowerCase("tr")
        .replace(/İ/g, "i")
        .replace(/ı/g, "i");
      if (!haystack.includes(q.toLocaleLowerCase("tr").replace(/İ/g, "i").replace(/ı/g, "i")))
        return false;
    }

    return true;
  });

  const hasFilters = Boolean(
    q.trim() ||
      repFilter ||
      from ||
      to ||
      methodFilter !== "all" ||
      payStatusFilter !== "all" ||
      saleStatusFilter !== "all" ||
      minAmount ||
      maxAmount,
  );

  function clearFilters() {
    setQ("");
    setRepFilter("");
    setFrom("");
    setTo("");
    setMethodFilter("all");
    setPayStatusFilter("all");
    setSaleStatusFilter("all");
    setMinAmount("");
    setMaxAmount("");
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Satışlar"
        action={
          <button className="btn btn--primary" onClick={() => setCreating((c) => !c)}>
            {creating ? "Kapat" : "+ Yeni satış"}
          </button>
        }
      />


      {error && <ErrorBanner message={error} />}
      {message && <div className="info-banner">{message}</div>}

      {creating && (
        <div className="card card__pad mb-14">
          <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Yeni satış kaydı</h3>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const companyId = (form.elements.namedItem("companyId") as HTMLSelectElement).value;
              const channel = (form.elements.namedItem("channel") as HTMLSelectElement).value as
                | "temsilci"
                | "dogrudan";
              const repId = (form.elements.namedItem("repId") as HTMLSelectElement).value;
              const referralCode = (form.elements.namedItem("referralCode") as HTMLInputElement).value;
              void run("create-sale", async () => {
                createSale(
                  {
                    companyId,
                    channel,
                    repId: channel === "temsilci" ? repId || null : null,
                    referralCode: channel === "dogrudan" ? referralCode : undefined,
                  },
                  actor,
                );
                setCreating(false);
                return "Satış kaydı açıldı. Ödeme kaydını açıp tahsilatı onaylayın.";
              });
            }}
          >
            <Field label="Firma" required>
              <select name="companyId" required>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kanal" required>
              <select name="channel" defaultValue="temsilci">
                <option value="temsilci">Satış temsilcisi ile</option>
                <option value="dogrudan">Doğrudan (referans koduyla)</option>
              </select>
            </Field>
            <Field label="Temsilci" hint="Kanal 'temsilci' ise">
              <select name="repId">
                <option value="">— seçin —</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Referans kodu" hint="Kanal 'dogrudan' ise">
              <input name="referralCode" placeholder="Örn: KADINANA-1001" />
            </Field>
            <button
              className="btn btn--primary"
              type="submit"
              disabled={busy === "create-sale"}
              style={{ alignSelf: "flex-end", marginBottom: 14 }}
            >
              {busy === "create-sale" ? <Loader2 size={14} className="spin" /> : null}
              Satışı aç
            </button>
          </form>
        </div>
      )}

      <div className="adm-filterbar">
        <div className="adm-filtergrid">
          <label className="adm-filter" style={{ gridColumn: "span 2" }}>
            <span>Firma ara</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Firma adı, personel veya referans kodu…"
            />
          </label>
          <label className="adm-filter">
            <span>Personel</span>
            <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)}>
              <option value="">Tüm personel</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name} ({rep.code})
                </option>
              ))}
            </select>
          </label>
          <label className="adm-filter">
            <span>Ödeme yöntemi</span>
            <select
              value={methodFilter}
              onChange={(e) =>
                setMethodFilter(e.target.value as "all" | "eft" | "kart" | "manuel")
              }
            >
              <option value="all">Kart / EFT / manuel</option>
              <option value="kart">Kart</option>
              <option value="eft">EFT</option>
              <option value="manuel">Manuel / EFT onayı</option>
            </select>
          </label>
          <label className="adm-filter">
            <span>Ödeme durumu</span>
            <select
              value={payStatusFilter}
              onChange={(e) =>
                setPayStatusFilter(
                  e.target.value as "all" | Payment["status"] | "kayit-yok",
                )
              }
            >
              <option value="all">Tüm ödeme durumları</option>
              <option value="beklemede">Beklemede</option>
              <option value="onaylandi">Onaylandı</option>
              <option value="hata">Reddedildi</option>
              <option value="iade">İade</option>
              <option value="kayit-yok">Ödeme kaydı yok</option>
            </select>
          </label>
          <label className="adm-filter">
            <span>Satış durumu</span>
            <select
              value={saleStatusFilter}
              onChange={(e) =>
                setSaleStatusFilter(e.target.value as "all" | SaleStatus)
              }
            >
              <option value="all">Tüm satış durumları</option>
              <option value="potansiyel">Beklemede</option>
              <option value="odendi">Kesinleşti</option>
              <option value="iptal">İptal</option>
            </select>
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
            <span>En az tutar (TL)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="adm-filter">
            <span>En çok tutar (TL)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="Sınırsız"
            />
          </label>
        </div>
        <div className="adm-filterbar__foot">
          <span>
            {filteredSales.length} / {sales.length} satış gösteriliyor
          </span>
          <div className="adm-filterbar__actions">
            {hasFilters && (
              <button type="button" className="btn btn--sm btn--ghost" onClick={clearFilters}>
                <FilterX size={14} strokeWidth={1.9} aria-hidden="true" />
                Filtreleri temizle
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="table-wrap table-wrap--cards">
        <table className="table">
          <thead>
            <tr>
              <th>Satış</th>
              <th>Kanal</th>
              <th>Tutar</th>
              <th>Durum</th>
              <th>Ödeme</th>
              <th>Adımlar</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  {sales.length === 0
                    ? "Henüz satış kaydı yok."
                    : "Filtrelerle eşleşen satış bulunamadı."}
                </td>
              </tr>
            )}
            {filteredSales.map((sale) => {
              const company = getCompanyById(sale.companyId);
              const paid = sale.status === "odendi";
              const payment = paymentForSale(sale.id);
              const pending = !paid && sale.status === "potansiyel";
              const rowKey = `sale-${sale.id}`;
              const rowBusy = busy === rowKey;
              return (
                <tr key={sale.id}>
                  <td data-label="Satış">
                    <strong>{company?.name ?? "—"}</strong>
                    <div className="text-muted small">{formatDateTime(sale.createdAt)}</div>
                    {sale.renewalForMembershipId && <Badge tone="blue">Üyelik yenileme</Badge>}
                  </td>
                  <td data-label="Kanal">
                    {sale.channel === "temsilci"
                      ? reps.find((r) => r.id === sale.repId)?.name ?? "temsilci"
                      : sale.referralCode
                        ? `Doğrudan (${sale.referralCode})`
                        : "Doğrudan"}
                  </td>
                  <td data-label="Tutar">{formatTRY(sale.amount)}</td>
                  <td data-label="Durum">
                    <Badge tone={paid ? "green" : sale.status === "potansiyel" ? "orange" : "red"}>
                      {sale.status === "potansiyel" ? "Beklemede" : paid ? "Kesinleşti" : "İptal"}
                    </Badge>
                    {sale.confirmedAt && (
                      <div className="text-muted small">{formatDateTime(sale.confirmedAt)}</div>
                    )}
                  </td>
                  <td data-label="Ödeme">
                    {payment ? (
                      <>
                        <Badge tone={paymentTone(payment.status)}>{paymentLabel(payment)}</Badge>
                      </>
                    ) : (
                      <span className="text-muted small">Kayıt yok</span>
                    )}
                  </td>
                  <td data-label="Adımlar">
                    <div className="actions-cell">
                      {pending && (
                        <>
                          {!payment && (
                            <button
                              className="btn btn--sm"
                              disabled={rowBusy}
                              onClick={() =>
                                void run(rowKey, async () => {
                                  await createPendingPayment(sale.id, actor);
                                  return "Beklemede ödeme kaydı açıldı. EFT onayı Ödeme ve EFT onayı ekranından verilir.";
                                })
                              }
                            >
                              {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                              Ödeme kaydı aç
                            </button>
                          )}
                          {payment?.status === "beklemede" && (
                            <Link className="btn btn--sm" to="/yonetim/odemeler">
                              Ödeme onayına git
                            </Link>
                          )}
                          {payment?.status === "onaylandi" && (
                            <button
                              className="btn btn--sm btn--primary"
                              disabled={rowBusy}
                              onClick={() =>
                                void run(rowKey, async () => {
                                  if (sale.renewalForMembershipId) {
                                    await confirmRenewal(sale.id, actor);
                                    return "Yenileme kesinleştirildi; komisyon tek kez oluşturuldu.";
                                  }
                                  await confirmSale(sale.id, actor);
                                  return "Satış kesinleştirildi; üyelik ve komisyon oluşturuldu.";
                                })
                              }
                            >
                              {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                              Kesinleştir
                            </button>
                          )}
                          <button
                            className="btn btn--sm btn--danger"
                            disabled={rowBusy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Satış iptal edilsin mi? Kayıt silinmez; bekleyen ödemeler kapatılır ve bu işlem geri alınamaz.",
                                )
                              )
                                return;
                              void run(`${rowKey}-cancel`, async () => {
                                await cancelSale(sale.id, actor);
                                return "Satış iptal edildi; bekleyen ödemeler kapatıldı.";
                              });
                            }}
                          >
                            İptal
                          </button>
                        </>
                      )}
                      {paid && sale.renewalForMembershipId && (
                        <span className="text-muted small">Yenileme tamam</span>
                      )}
                      {paid && !sale.renewalForMembershipId && (
                        <span className="text-muted small">Üyelik başladı</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="stats-grid mt-18">
        <StatCard
          icon={<Wallet size={20} strokeWidth={1.9} />}
          label="Kesinleşen satış toplamı"
          value={formatTRY(
            sales.filter((s) => s.status === "odendi").reduce((sum, s) => sum + s.amount, 0),
          )}
          tone="success"
        />
        <StatCard
          icon={<Clock size={20} strokeWidth={1.9} />}
          label="Bekleyen satış"
          value={sales.filter((s) => s.status === "potansiyel").length}
          tone="warning"
        />
      </div>
    </div>
  );
}
