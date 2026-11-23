import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CircleAlert,
  Clock3,
  CreditCard,
  ListChecks,
  Loader2,
  Store,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { EmptyState, ErrorBanner, InfoBanner } from "../components/ui";
import { useActor, useAuth } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatTRY } from "../lib/format";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  approveEftPayment,
  cancelSale,
  companyHasConfirmedPayment,
  confirmRenewal,
  confirmSale,
  createPendingPayment,
  getCompanyById,
  listCompanies,
  listLeads,
  listPayments,
  listReps,
  listSales,
  rejectPendingPayment,
  setCompanyPublished,
  verifyPayment,
} from "../lib/repo";
import {
  groupPaymentsBySale,
  paymentMethodLabel,
  primaryPaymentForSale,
  saleStage,
} from "../lib/saleState";
import type { Payment, Sale } from "../lib/types";
import DigitalVisibility from "./DigitalVisibility";
import "./dashboard.css";

/*
 * İŞLEM MERKEZİ
 *
 * Tek kural: karar gerektiren her kayıt TEK kuyrukta, tek satırda görünür ve
 * işlemi satırın kendisinden yapılır. Sıra: para → yayın → bilgi.
 *
 * İş kuralları burada YOKTUR. Satır eylemleri repo'nun mevcut fonksiyonlarını
 * aynı parametrelerle çağırır (approveEftPayment / verifyPayment /
 * confirmSale / confirmRenewal / createPendingPayment / cancelSale /
 * setCompanyPublished); sınıflandırma lib/saleState.ts'ten gelir.
 */

/** Saate göre karşılama + kısa motivasyon cümlesi. */
function greetingFor(hour: number): { hello: string; lead: string } {
  if (hour >= 6 && hour < 12)
    return {
      hello: "Günaydın",
      lead: "Yeni gün, temiz bir sayfa. Küçük bir onay bile günün akışını rahatlatır.",
    };
  if (hour >= 12 && hour < 18)
    return {
      hello: "İyi günler",
      lead: "Günün ortasındayız; biriken işi ertelemeden kapatmak en iyisi.",
    };
  if (hour >= 18 && hour < 22)
    return {
      hello: "İyi akşamlar",
      lead: "Günü kapatmadan önce bekleyen birkaç kaydı netleştirelim.",
    };
  return {
    hello: "İyi geceler",
    lead: "Sessiz saatlerde verilen bir onay, yarını çok daha rahat ettirir.",
  };
}

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function ageLabel(days?: number): string {
  if (days === undefined) return "";
  return days <= 0 ? "bugün" : `${days} gündür`;
}

interface SaleQueueRow {
  sale: Sale;
  payment?: Payment;
  companyId: string;
  companyName: string;
  detail: string;
  ageDays?: number;
  /** Satış kanalı temsilci ise satışı yapan personelin adı. */
  repName?: string;
}

type Tone = "money" | "content" | "info";

/** Kuyruk satırı — miktar/yaş sağda, eylemler satırın içinde. */
function QueueRow({
  icon: Icon,
  tone,
  title,
  titleTo,
  detail,
  amount,
  ageDays,
  actions,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  titleTo: string;
  detail: string;
  amount?: number;
  ageDays?: number;
  actions?: ReactNode;
}) {
  return (
    <div
      className={`dq-row dq-row--${tone} ${actions ? "dq-row--act" : "dq-row--info"}`}
    >
      <span className="dq-row__glyph">
        <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="dq-row__text">
        <Link className="dq-row__title" to={titleTo}>
          {title}
        </Link>
        <span>{detail}</span>
      </span>
      <span className="dq-row__side">
        {amount !== undefined && (
          <span className="dq-row__amount">{formatTRY(amount)}</span>
        )}
        {ageDays !== undefined && (
          <span className="dq-row__age">{ageLabel(ageDays)}</span>
        )}
      </span>
      {actions && <span className="dq-row__actions">{actions}</span>}
    </div>
  );
}

function QueueGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="dq-queue__group">
      <div className="dq-queue__grouplabel">
        {label}
        <em>{count}</em>
      </div>
      {children}
    </div>
  );
}

export default function AdminDashboard() {
  useLiveDataRevision();
  const actor = useActor();
  const { user } = useAuth();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [, setTick] = useState(0);

  const companies = listCompanies({ includeUnpublished: true });
  const sales = listSales(actor);
  const payments = listPayments(actor);
  const reps = listReps(actor);
  /**
   * Yönetici incelemesi bekleyen adaylar: temsilcinin «anlaşma bildir» dediği,
   * henüz firmaya dönüştürülmemiş kayıtlar — /yonetim/firma-akisi 1. adımı.
   * Dönüştürülen (convertedToCompanyId dolu) veya iptal edilen adaylar burada
   * sayılmaz; onay sonrası kayıt satış/ödeme kuyruğuna geçer.
   */
  const pendingLeads = listLeads(actor).filter(
    (lead) => lead.status === "anlaşma" && !lead.convertedToCompanyId,
  );

  /** Hızlı çift tıklama / mükerrer gönderim koruması. */
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

  // --- Kuyruk kovaları (tek sınıflandırma: saleState.saleStage) ---
  const bySale = groupPaymentsBySale(payments);
  const buckets: Record<"confirm" | "eft" | "card" | "none", SaleQueueRow[]> = {
    eft: [],
    confirm: [],
    none: [],
    card: [],
  };

  for (const sale of sales) {
    const rows = bySale.get(sale.id) ?? [];
    const stage = saleStage(sale, rows);
    if (stage === "settled" || stage === "cancelled") continue;

    const payment = primaryPaymentForSale(rows);
    const company = getCompanyById(sale.companyId);
    const renewal = sale.renewalForMembershipId ? "Yenileme" : "Üyelik";
    buckets[stage].push({
      sale,
      payment,
      companyId: sale.companyId,
      companyName: company?.name ?? "Firma kaydı yok",
      detail:
        stage === "eft"
          ? `${paymentMethodLabel(payment)} ödeme onayı bekliyor · ${renewal}`
          : stage === "confirm"
            ? `Ödeme onaylı, satış kesinleşmedi · ${renewal}`
            : stage === "card"
              ? "Kart ödemesi sağlayıcı doğrulamasında"
              : `Ödeme kaydı açılmamış · ${renewal}`,
      ageDays: daysSince(payment?.createdAt ?? sale.createdAt),
      repName:
        sale.channel === "temsilci"
          ? (reps.find((rep) => rep.id === sale.repId)?.name ?? "temsilci")
          : undefined,
    });
  }

  // --- Yayına hazır: yayında değil + kesinleşmiş satış + onaylı ödeme ---
  const confirmedCompanyIds = new Set(
    sales.filter((sale) => sale.status === "odendi").map((sale) => sale.companyId),
  );
  const readyCompanies = companies.filter(
    (company) =>
      !company.published &&
      confirmedCompanyIds.has(company.id) &&
      companyHasConfirmedPayment(company.id),
  );

  const confirmedTotal = sales
    .filter((sale) => sale.status === "odendi")
    .reduce((sum, sale) => sum + sale.amount, 0);
  const waitingTotal = sales
    .filter((sale) => sale.status === "potansiyel")
    .reduce((sum, sale) => sum + sale.amount, 0);

  const queueTotal =
    pendingLeads.length +
    buckets.eft.length +
    buckets.confirm.length +
    buckets.none.length +
    readyCompanies.length +
    buckets.card.length;

  // --- Karşılama (yerel saat) + Türkçe tarih ---
  const now = new Date();
  const { hello, lead } = greetingFor(now.getHours());
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? null;
  const dateLong = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const dayNumber = new Intl.DateTimeFormat("tr-TR", { day: "numeric" }).format(now);
  const monthYear = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(now);
  const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(now);

  const publishedCount = companies.filter((company) => company.published).length;
  const summary: Array<{ label: string; value: string; icon: LucideIcon; alert?: boolean }> = [
    { label: "Toplam firma", value: String(companies.length), icon: Building2 },
    { label: "Yayında firma", value: String(publishedCount), icon: BadgeCheck },
    { label: "Bekleyen işlem", value: String(queueTotal), icon: ListChecks, alert: queueTotal > 0 },
    { label: "Personel", value: String(reps.length), icon: Users },
    { label: "Tahsil edilen", value: formatTRY(confirmedTotal), icon: Banknote },
    { label: "Bekleyen tutar", value: formatTRY(waitingTotal), icon: Clock3 },
  ];

  return (
    <div className="panel-content adm-dash">
      {/* ============ KARŞILAMA ============ */}
      <section className="dq-hero" aria-labelledby="dq-hero-title">
        <div className="dq-hero__text">
          <p className="dq-hero__eyebrow">İşlem Merkezi</p>
          <h1 id="dq-hero-title" className="dq-hero__title">
            {hello}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="dq-hero__lead">
            {queueTotal === 0
              ? "Bugün bekleyen iş yok; her şey akışında. Yeni bir gün için hazırsınız."
              : lead}
          </p>
        </div>
        <div className="dq-hero__date" aria-label={dateLong}>
          <span className="dq-hero__day">{dayNumber}</span>
          <span className="dq-hero__month">{monthYear}</span>
          <span className="dq-hero__weekday">{weekday}</span>
        </div>
      </section>

      {/* ============ DİJİTAL GÖRÜNÜRLÜK ============ */}
      <DigitalVisibility />

      {!isSupabaseConfigured && (
        <InfoBanner>
          <strong>Demo mod aktif:</strong> Veriler bu tarayıcıda tutuluyor.
        </InfoBanner>
      )}

      {error && <ErrorBanner message={error} />}
      {message && (
        <div className="info-banner" role="status">
          {message}
        </div>
      )}

      {/* ============ İŞ ÖZETİ ============ */}
      <section className="dq-summary" aria-labelledby="dq-summary-title">
        <h2 id="dq-summary-title" className="dq-summary__title">
          İş özeti
        </h2>
        <div className="dq-summary__grid">
          {summary.map(({ label, value, icon: Icon, alert }) => (
            <div key={label} className={`dq-sum ${alert ? "dq-sum--alert" : ""}`}>
              <span className="dq-sum__icon">
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <span className="dq-sum__body">
                <span className="dq-sum__value">{value}</span>
                <span className="dq-sum__label">{label}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ============ TEK İŞLEM KUYRUĞU ============ */}
      <section className="dq-panel" aria-label="İşlem kuyruğu">
        <div className="dq-panel__head">
          <h2>İşlem kuyruğu</h2>
          <Link className="dq-panel__link" to="/yonetim/satislar">
            Tüm satışlar
            <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>

        {queueTotal === 0 ? (
          <div className="dq-panel__body">
            <EmptyState
              title="Bekleyen iş yok"
              description="Onay bekleyen aday, ödeme, kesinleştirme ve yayına hazır firma bulunmuyor."
            />
          </div>
        ) : (
          <div className="dq-panel__body dq-panel__body--flush">
            {pendingLeads.length > 0 && (
              <QueueGroup label="Yönetici onayındaki adaylar" count={pendingLeads.length}>
                {pendingLeads.map((lead) => {
                  const leadTo = `/yonetim/firma-akisi?lead=${encodeURIComponent(lead.id)}`;
                  const repName =
                    reps.find((rep) => rep.id === lead.repId)?.name ?? "Temsilci atanmamış";
                  return (
                    <QueueRow
                      key={lead.id}
                      icon={Target}
                      tone="content"
                      title={lead.companyName}
                      titleTo={leadTo}
                      detail={`${repName} · Aday incelemesi bekliyor · Ödeme kaydı yok (onay sonrası üyelik satışı açılır)`}
                      ageDays={daysSince(lead.updatedAt)}
                      actions={
                        <Link className="btn btn--sm btn--primary" to={leadTo}>
                          İncele
                        </Link>
                      }
                    />
                  );
                })}
              </QueueGroup>
            )}

            {buckets.eft.length > 0 && (
              <QueueGroup label="Ödeme bekleyen" count={buckets.eft.length}>
                {buckets.eft.map((row) => {
                  const key = `eft-${row.sale.id}`;
                  const rowBusy = busy === key;
                  const isEft = row.payment?.provider === "eft";
                  return (
                    <QueueRow
                      key={row.sale.id}
                      icon={Banknote}
                      tone="money"
                      title={row.companyName}
                      titleTo="/yonetim/firmalar"
                      detail={`${row.detail}${row.repName ? ` · ${row.repName}` : ""}`}
                      amount={row.sale.amount}
                      ageDays={row.ageDays}
                      actions={
                        <>
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            disabled={rowBusy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  isEft
                                    ? `${row.companyName} için EFT ödemesinin hesabınıza ulaştığını onaylıyor musunuz? Bu işlem satışı kesinleştirir ve komisyon oluşturur.`
                                    : `${row.companyName} için manuel ödeme onaylansın mı? Satışı ayrıca «Kesinleştir» adımıyla tamamlamalısınız.`,
                                )
                              )
                                return;
                              void run(key, async () => {
                                if (isEft) {
                                  await approveEftPayment(row.sale.id, actor);
                                  return "EFT onaylandı; satış kesinleşti ve komisyon oluşturuldu.";
                                }
                                if (!row.payment) throw new Error("Ödeme kaydı bulunamadı.");
                                await verifyPayment(row.payment.id, actor);
                                return "Ödeme onaylandı; satışı «Kesinleştir» ile tamamlayın.";
                              });
                            }}
                          >
                            {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                            Onayla
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={rowBusy || row.payment?.status !== "beklemede"}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Bekleyen ödeme reddedilsin mi? Kayıt silinmez, 'reddedildi' olarak saklanır.",
                                )
                              )
                                return;
                              void run(`${key}-reject`, async () => {
                                await rejectPendingPayment(row.sale.id, actor);
                                return "Ödeme reddedildi. Doğru ödeme geldiğinde yeniden onaylayabilirsiniz.";
                              });
                            }}
                          >
                            Reddet
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </QueueGroup>
            )}

            {buckets.confirm.length > 0 && (
              <QueueGroup label="Kesinleştirme bekleyen" count={buckets.confirm.length}>
                {buckets.confirm.map((row) => {
                  const key = `confirm-${row.sale.id}`;
                  const rowBusy = busy === key;
                  return (
                    <QueueRow
                      key={row.sale.id}
                      icon={CircleAlert}
                      tone="money"
                      title={row.companyName}
                      titleTo="/yonetim/firmalar"
                      detail={`${row.detail}${row.repName ? ` · ${row.repName}` : ""}`}
                      amount={row.sale.amount}
                      ageDays={row.ageDays}
                      actions={
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={rowBusy}
                          onClick={() =>
                            void run(key, async () => {
                              if (row.sale.renewalForMembershipId) {
                                await confirmRenewal(row.sale.id, actor);
                                return "Yenileme kesinleştirildi; komisyon tek kez oluşturuldu.";
                              }
                              await confirmSale(row.sale.id, actor);
                              return "Satış kesinleştirildi; üyelik ve komisyon oluşturuldu.";
                            })
                          }
                        >
                          {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                          Kesinleştir
                        </button>
                      }
                    />
                  );
                })}
              </QueueGroup>
            )}

            {buckets.none.length > 0 && (
              <QueueGroup label="Ödeme kaydı açılmamış" count={buckets.none.length}>
                {buckets.none.map((row) => {
                  const key = `none-${row.sale.id}`;
                  const rowBusy = busy === key;
                  return (
                    <QueueRow
                      key={row.sale.id}
                      icon={Wallet}
                      tone="money"
                      title={row.companyName}
                      titleTo="/yonetim/firmalar"
                      detail={`${row.detail}${row.repName ? ` · ${row.repName}` : ""}`}
                      amount={row.sale.amount}
                      ageDays={row.ageDays}
                      actions={
                        <>
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            disabled={rowBusy}
                            onClick={() =>
                              void run(key, async () => {
                                await createPendingPayment(row.sale.id, actor);
                                return "Beklemede ödeme kaydı açıldı; onayı bu ekrandan verin.";
                              })
                            }
                          >
                            {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                            Ödeme kaydı aç
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            disabled={rowBusy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Satış iptal edilsin mi? Kayıt silinmez; bekleyen ödemeler kapatılır ve bu işlem geri alınamaz.",
                                )
                              )
                                return;
                              void run(`${key}-cancel`, async () => {
                                await cancelSale(row.sale.id, actor);
                                return "Satış iptal edildi; bekleyen ödemeler kapatıldı.";
                              });
                            }}
                          >
                            İptal
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </QueueGroup>
            )}

            {readyCompanies.length > 0 && (
              <QueueGroup label="Yayına hazır firmalar" count={readyCompanies.length}>
                {readyCompanies.map((company) => {
                  const key = `publish-${company.id}`;
                  const rowBusy = busy === key;
                  const confirmed = sales
                    .filter((sale) => sale.companyId === company.id && sale.status === "odendi")
                    .sort((a, b) =>
                      (b.confirmedAt ?? b.createdAt).localeCompare(a.confirmedAt ?? a.createdAt),
                    )[0];
                  return (
                    <QueueRow
                      key={company.id}
                      icon={Store}
                      tone="content"
                      title={company.name}
                      titleTo="/yonetim/firmalar"
                      detail={`Satış kesinleşti ve ödeme onaylı · yayına alınmayı bekliyor${
                        confirmed?.channel === "temsilci"
                          ? ` · ${reps.find((rep) => rep.id === confirmed.repId)?.name ?? "temsilci"}`
                          : ""
                      }`}
                      ageDays={daysSince(confirmed?.confirmedAt ?? confirmed?.createdAt)}
                      actions={
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          disabled={rowBusy}
                          onClick={() =>
                            void run(key, async () => {
                              await setCompanyPublished(company.id, true, actor);
                              return "Firma yayına alındı.";
                            })
                          }
                        >
                          {rowBusy ? <Loader2 size={14} className="spin" /> : null}
                          Yayınla
                        </button>
                      }
                    />
                  );
                })}
              </QueueGroup>
            )}

            {buckets.card.length > 0 && (
              <QueueGroup label="Kart doğrulaması bekleyen" count={buckets.card.length}>
                {buckets.card.map((row) => (
                  <QueueRow
                    key={row.sale.id}
                    icon={CreditCard}
                    tone="info"
                    title={row.companyName}
                    titleTo="/yonetim/firmalar"
                    detail={`Sağlayıcı doğrulaması bekleniyor · manuel onay verilemez${
                      row.repName ? ` · ${row.repName}` : ""
                    }`}
                    amount={row.sale.amount}
                    ageDays={row.ageDays}
                  />
                ))}
              </QueueGroup>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
