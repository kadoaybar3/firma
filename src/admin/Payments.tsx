import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  FilterX,
  History,
  Loader2,
  XCircle,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, ErrorBanner, InfoBanner, StatCard, auditActionLabels } from "../components/ui";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatDateTime, formatTRY, isPlaceholderPaymentRef } from "../lib/format";
import {
  approveEftPayment,
  cancelSale,
  confirmRenewal,
  confirmSale,
  getCompanyById,
  getSettings,
  listAudit,
  listLeads,
  listPayments,
  listReps,
  listSales,
  rejectPendingPayment,
  verifyPayment,
} from "../lib/repo";
import type { Payment } from "../lib/types";

function methodLabel(payment?: Payment): string {
  if (!payment) return "Kayıt yok";
  if (payment.provider === "eft") return "EFT";
  if (payment.provider === "hicbiri") return "Manuel / EFT";
  return `Kart · ${payment.provider}`;
}

function paymentTone(status: Payment["status"]): "green" | "orange" | "red" | "gray" {
  if (status === "onaylandi") return "green";
  if (status === "beklemede") return "orange";
  if (status === "hata") return "red";
  return "gray";
}

function paymentLabel(status: Payment["status"]): string {
  if (status === "onaylandi") return "Ödeme onaylandı";
  if (status === "beklemede") return "Ödeme bekliyor";
  if (status === "hata") return "Reddedildi / başarısız";
  return "İade edildi";
}

export default function AdminPayments() {
  useLiveDataRevision();
  const actor = useActor();
  const settings = getSettings();
  const paymentList = listPayments(actor).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sales = listSales(actor);
  const leads = listLeads(actor);
  const reps = listReps(actor);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [, setTick] = useState(0);

  // Ödeme kayıtları filtreleri
  const [q, setQ] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | "kart" | "eft" | "manuel">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Payment["status"]>("all");

  async function run(key: string, fn: () => Promise<string>) {
    if (busyRef.current) return; // hızlı çift tıklama koruması
    busyRef.current = true;
    setBusy(key);
    setError(null);
    setMessage(null);
    // Yükleme durumunun görünmesi için bir sonraki karede çalıştır.
    await new Promise((resolve) => setTimeout(resolve, 0));
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

  const pendingLeads = leads.filter((l) => l.status === "anlaşma" && !l.convertedToCompanyId);

  /** EFT/manuel onay kuyruğu: kart ödemesi bekleyen satışlar aşağıdaki tabloda kalır. */
  const eftQueue = sales
    .filter((s) => s.status === "potansiyel")
    .map((sale) => {
      const payment = paymentList.find((p) => p.saleId === sale.id);
      const cardPending =
        payment?.status === "beklemede" &&
        payment.provider !== "hicbiri" &&
        payment.provider !== "eft";
      return {
        sale,
        payment,
        cardPending,
        company: getCompanyById(sale.companyId),
        rep: reps.find((r) => r.id === sale.repId),
      };
    })
    .filter((row) => !row.cardPending);

  const filteredPayments = paymentList.filter((payment) => {
    const sale = sales.find((row) => row.id === payment.saleId);
    const company = sale ? getCompanyById(sale.companyId) : undefined;

    if (statusFilter !== "all" && payment.status !== statusFilter) return false;

    if (methodFilter !== "all") {
      const isEft = payment.provider === "eft";
      const isManual = payment.provider === "hicbiri";
      const isCard = !isEft && !isManual;
      if (methodFilter === "eft" && !isEft) return false;
      if (methodFilter === "manuel" && !isManual) return false;
      if (methodFilter === "kart" && !isCard) return false;
    }

    if (q.trim()) {
      const haystack = `${company?.name ?? ""} ${payment.providerRef} ${payment.provider}`;
      if (
        !haystack
          .toLocaleLowerCase("tr")
          .replace(/İ/g, "i")
          .replace(/ı/g, "i")
          .includes(q.toLocaleLowerCase("tr").replace(/İ/g, "i").replace(/ı/g, "i"))
      )
        return false;
    }

    return true;
  });

  const paymentHasFilters = Boolean(q.trim() || methodFilter !== "all" || statusFilter !== "all");

  const recentPaymentAudit = listAudit(60)
    .filter((entry) => entry.action.startsWith("odeme_") || entry.action.startsWith("satis_"))
    .slice(0, 6);

  return (
    <div className="panel-content">
      <PanelHead title="Ödeme Onayları" />
      {error && <ErrorBanner message={error} />}
      {message && (
        <div className="info-banner" role="status" style={{ background: "#e3f6ee", borderColor: "#bfe8d8" }}>
          <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" /> {message}
        </div>
      )}

      <InfoBanner>
        EFT tutarının hesabınıza geçtiğini doğruladıktan sonra onaylayın. Onay, satışı, üyeliği ve
        komisyonu kesinleştirir.
      </InfoBanner>

      <div className="stats-grid mb-14">
        <StatCard
          icon={<Clock size={20} strokeWidth={1.9} />}
          label="Bekleyen anlaşma"
          value={pendingLeads.length}
          tone={pendingLeads.length > 0 ? "warning" : undefined}
        />
        <StatCard
          icon={<Banknote size={20} strokeWidth={1.9} />}
          label="EFT onayı bekleyen"
          value={eftQueue.filter((r) => r.payment?.status !== "onaylandi").length}
          tone="warning"
        />
        <StatCard
          icon={<BadgeCheck size={20} strokeWidth={1.9} />}
          label="Doğrulanmış ödeme"
          value={paymentList.filter((p) => p.status === "onaylandi").length}
          tone="success"
        />
        <StatCard
          icon={<CreditCard size={20} strokeWidth={1.9} />}
          label="Kart ödemesi bekleyen"
          value={
            paymentList.filter(
              (p) =>
                p.status === "beklemede" && p.provider !== "hicbiri" && p.provider !== "eft",
            ).length
          }
        />
      </div>

      {/* --- Personel anlaşma bildirimleri --- */}
      <section style={{ marginBottom: 22 }}>
        <div className="panel-section-head" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
            <FileText size={18} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Personel anlaşma bildirimleri
          </h2>
        </div>

        {pendingLeads.length === 0 ? (
          <div className="card card__pad text-muted small">Bekleyen anlaşma bildirimi yok.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Personel</th>
                  <th>Anlaşma tutarı</th>
                  <th>Tarih</th>
                  <th>Ödeme yöntemi</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {pendingLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.companyName}</strong>
                      <div className="text-muted small">
                        {[lead.phone].filter(Boolean).join(" · ") || "İletişim bilgisi yok"}
                      </div>
                    </td>
                    <td>{reps.find((r) => r.id === lead.repId)?.name ?? "—"}</td>
                    <td>{formatTRY(settings.membershipPrice)}</td>
                    <td className="small text-muted">{formatDateTime(lead.updatedAt)}</td>
                    <td className="small">EFT (firma onayı sonrası)</td>
                    <td>
                      <Badge tone="orange">Anlaşma bildirildi</Badge>
                    </td>
                    <td>
                      <Link className="btn btn--sm" to="/yonetim/adaylar">
                        Firmayı onayla / satış aç
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- EFT onay kuyruğu --- */}
      <section style={{ marginBottom: 22 }}>
        <div className="panel-section-head" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
            <Banknote size={18} strokeWidth={2} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Bekleyen EFT / tahsilat onayı
          </h2>
        </div>

        {eftQueue.length === 0 ? (
          <div className="card card__pad text-muted small">Onay bekleyen satış yok.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Firma / personel</th>
                  <th>Tutar</th>
                  <th>Tarih</th>
                  <th>Yöntem</th>
                  <th>Ödeme durumu</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {eftQueue.map(({ sale, payment, company, rep }) => {
                  const approved = payment?.status === "onaylandi";
                  const rowKey = `sale-${sale.id}`;
                  const rowBusy = busy === rowKey;
                  return (
                    <tr key={sale.id}>
                      <td>
                        <strong>{company?.name ?? "—"}</strong>
                        <div className="text-muted small">{rep?.name ?? "Temsilci atanmamış"}</div>
                      </td>
                      <td>{formatTRY(sale.amount)}</td>
                      <td className="small text-muted">{formatDateTime(sale.createdAt)}</td>
                      <td className="small">{methodLabel(payment)}</td>
                      <td>
                        {payment ? (
                          <Badge tone={paymentTone(payment.status)}>{paymentLabel(payment.status)}</Badge>
                        ) : (
                          <Badge tone="orange">Ödeme kaydı yok</Badge>
                        )}
                      </td>
                      <td>
                        <div className="actions-cell">
                          {approved ? (
                            <button
                              className="btn btn--sm btn--primary"
                              disabled={rowBusy}
                              onClick={() =>
                                run(rowKey, async () => {
                                  if (sale.renewalForMembershipId) await confirmRenewal(sale.id, actor);
                                  else await confirmSale(sale.id, actor);
                                  return "Satış kesinleştirildi.";
                                })
                              }
                            >
                              {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                              Kesinleştir
                            </button>
                          ) : (
                            <button
                              className="btn btn--sm btn--primary"
                              disabled={rowBusy}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `${company?.name ?? "Satış"} için EFT ödemesinin hesabınıza ulaştığını onaylıyor musunuz? Bu işlem satışı kesinleştirir ve komisyon oluşturur.`,
                                  )
                                )
                                  return;
                                void run(rowKey, async () => {
                                  await approveEftPayment(sale.id, actor);
                                  return "EFT alındı; ödeme onaylandı, satış kesinleşti ve komisyon oluşturuldu.";
                                });
                              }}
                            >
                              {rowBusy ? <Loader2 size={14} className="spin" /> : <Banknote size={14} />}
                              EFT alındı / Ödemeyi onayla
                            </button>
                          )}

                          <button
                            className="btn btn--sm"
                            disabled={rowBusy || payment?.status !== "beklemede"}
                            onClick={() => {
                              if (!window.confirm("Bekleyen ödeme reddedilsin mi? Kayıt silinmez, 'reddedildi' olarak saklanır."))
                                return;
                              void run(`${rowKey}-reject`, async () => {
                                await rejectPendingPayment(sale.id, actor);
                                return "Ödeme reddedildi. Doğru ödeme geldiğinde yeniden onaylayabilirsiniz.";
                              });
                            }}
                          >
                            Reddet
                          </button>

                          <button
                            className="btn btn--sm btn--danger"
                            disabled={rowBusy}
                            onClick={() => {
                              if (!window.confirm("Satış iptal edilsin mi? Bu işlem geri alınamaz; bekleyen ödemeler kapatılır."))
                                return;
                              void run(`${rowKey}-cancel`, async () => {
                                await cancelSale(sale.id, actor);
                                return "Satış iptal edildi; bekleyen ödemeler kapatıldı.";
                              });
                            }}
                          >
                            <XCircle size={14} /> İptal
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Tüm ödeme kayıtları --- */}
      <section>
        <div className="panel-section-head" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ödeme kayıtları</h2>
        </div>

        <div className="adm-filterbar">
          <div className="adm-filtergrid">
            <label className="adm-filter" style={{ gridColumn: "span 2" }}>
              <span>Firma veya sağlayıcı referansı</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Firma adı, sağlayıcı referansı…"
              />
            </label>
            <label className="adm-filter">
              <span>Yöntem</span>
              <select
                value={methodFilter}
                onChange={(e) =>
                  setMethodFilter(e.target.value as "all" | "kart" | "eft" | "manuel")
                }
              >
                <option value="all">Tüm yöntemler</option>
                <option value="kart">Kart</option>
                <option value="eft">EFT</option>
                <option value="manuel">Manuel</option>
              </select>
            </label>
            <label className="adm-filter">
              <span>Durum</span>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as "all" | Payment["status"])
                }
              >
                <option value="all">Tüm durumlar</option>
                <option value="beklemede">Beklemede</option>
                <option value="onaylandi">Onaylandı</option>
                <option value="hata">Reddedildi</option>
                <option value="iade">İade</option>
              </select>
            </label>
          </div>
          <div className="adm-filterbar__foot">
            <span>
              {filteredPayments.length} / {paymentList.length} kayıt gösteriliyor
            </span>
            {paymentHasFilters && (
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  setQ("");
                  setMethodFilter("all");
                  setStatusFilter("all");
                }}
              >
                <FilterX size={14} strokeWidth={1.9} aria-hidden="true" />
                Filtreleri temizle
              </button>
            )}
          </div>
        </div>

        {paymentList.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={30} strokeWidth={1.5} aria-hidden="true" />}
            title="Ödeme kaydı yok"
            description="Satış kayıtları sayfasında bir satış için 'Ödeme kaydı aç' adımını kullanın."
          />
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={30} strokeWidth={1.5} aria-hidden="true" />}
            title="Eşleşen ödeme yok"
            description="Yöntem, durum veya arama filtresini değiştirin."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Satış / firma</th>
                  <th>Tutar</th>
                  <th>Yöntem</th>
                  <th>Sağlayıcı referansı</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => {
                  const sale = sales.find((s) => s.id === p.saleId);
                  const company = sale ? getCompanyById(sale.companyId) : undefined;
                  const isEft = p.provider === "eft";
                  const isCard = p.provider !== "hicbiri" && p.provider !== "eft";
                  const rowKey = `payment-${p.id}`;
                  const rowBusy = busy === rowKey;

                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{company?.name ?? "—"}</strong>
                        <div className="text-muted small">{formatDateTime(p.createdAt)}</div>
                      </td>
                      <td>{formatTRY(p.amount)}</td>
                      <td className="small">{methodLabel(p)}</td>
                      <td className="text-muted small" style={{ overflowWrap: "anywhere" }}>
                        {p.providerRef}
                        {isPlaceholderPaymentRef(p.providerRef) && (
                          <div>Dahili bekleyen kayıt — sağlayıcı referansı henüz oluşmadı.</div>
                        )}
                      </td>
                      <td>
                        <Badge tone={paymentTone(p.status)}>{paymentLabel(p.status)}</Badge>
                      </td>
                      <td>
                        {p.status === "beklemede" && !isCard ? (
                          <button
                            className="btn btn--sm btn--primary"
                            disabled={rowBusy || !sale}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  isEft
                                    ? "EFT ödemesi onaylansın mı? Satış kesinleşir ve komisyon oluşur."
                                    : "Bu ödeme manuel olarak doğrulansın mı? Satışı ayrıca 'Kesinleştir' adımıyla tamamlamalısınız.",
                                )
                              )
                                return;
                              void run(rowKey, async () => {
                                if (isEft && sale) {
                                  await approveEftPayment(sale.id, actor);
                                  return "EFT ödemesi onaylandı; satış kesinleşti ve komisyon oluşturuldu.";
                                }
                                await verifyPayment(p.id, actor);
                                return "Ödeme doğrulandı. Satışı 'Kesinleştir' ile tamamlayın.";
                              });
                            }}
                          >
                            {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                            {isEft ? "EFT alındı / Onayla" : "Doğrula (manuel)"}
                          </button>
                        ) : (
                          <span className="text-muted small">
                            {p.status === "beklemede"
                              ? "Kart sağlayıcı doğrulaması bekleniyor; manuel onay verilemez."
                              : p.status === "onaylandi"
                                ? `Doğrulandı: ${formatDateTime(p.updatedAt)}`
                                : p.status === "hata"
                                  ? "Reddedildi / başarısız — yeni kayıt açılmalı"
                                  : "İade edildi"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-panel" style={{ marginTop: 22 }}>
        <div className="adm-panel__head">
          <h2>
            <History size={16} strokeWidth={1.9} aria-hidden="true" /> Son ödeme ve satış denetim kayıtları
          </h2>
        </div>
        <div className="adm-panel__body">
          {recentPaymentAudit.length === 0 ? (
            <p className="text-muted small">Henüz ödeme veya satış denetim kaydı yok.</p>
          ) : (
            <div className="adm-list">
              {recentPaymentAudit.map((entry) => (
                <div className="adm-list__row" key={entry.id}>
                  <span className="adm-dot adm-dot--blue" aria-hidden="true" />
                  <span className="adm-list__main">
                    <span className="adm-list__title">{entry.summary}</span>
                    <span className="adm-list__meta">
                      {formatDateTime(entry.at)} · {entry.actorRole}
                    </span>
                  </span>
                  <Badge tone="blue">{auditActionLabels[entry.action] ?? entry.action}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
