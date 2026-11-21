import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  CircleAlert,
  ClipboardList,
  CreditCard,
  Download,
  Store,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, InfoBanner, auditActionLabels } from "../components/ui";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatShortDate, formatTRY } from "../lib/format";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  companyHasConfirmedPayment,
  getCompanyById,
  listAudit,
  listCommissions,
  listCompanies,
  listCommissionPayoutSummary,
  listLeads,
  listPayments,
  listRepApplications,
  listReps,
  listSales,
  listTeamCommissionSummary,
  listTeamJoinApplications,
  monthlyReport,
} from "../lib/repo";
import type { Lead, Payment, Sale } from "../lib/types";
import "./dashboard.css";

/*
 * GENEL BAKIŞ — "Nöbet defteri"
 *
 * İlke: bu dosya YALNIZ sunum yapar. Hiçbir sayı sabit değildir; her değer
 * aşağıdaki repo okumalarından türetilir. İş kuralları (ödeme onayı, satış
 * kesinleştirme, komisyon, yayın kapısı) repo/engine içinde kalır; burada
 * yalnız "hangi kayıt hangi kararı bekliyor" sınıflandırması yapılır.
 */

const QUICK_ACTIONS = [
  { to: "/yonetim/firmalar", label: "Firma ekle", desc: "Yeni kayıt", icon: Store },
  { to: "/yonetim/ice-aktar", label: "İçe aktar", desc: "Toplu liste", icon: Download },
  { to: "/yonetim/odemeler", label: "Ödeme onayla", desc: "EFT kuyruğu", icon: CreditCard },
  { to: "/yonetim/satislar", label: "Satış aç", desc: "Yeni üyelik", icon: Wallet },
  { to: "/yonetim/adaylar", label: "Adayları gör", desc: "Saha bildirimleri", icon: Target },
  { to: "/yonetim/temsilciler", label: "Personel", desc: "Ekip yönetimi", icon: Users },
];

/** Kuyruk grupları — sıra ekrandaki sıradır (para önce). */
type QueueGroup = "money" | "content" | "field" | "team";

const QUEUE_GROUPS: Array<{ id: QueueGroup; label: string; short: string }> = [
  { id: "money", label: "Para · onay bekleyen", short: "para" },
  { id: "content", label: "İçerik · yayın", short: "içerik" },
  { id: "field", label: "Saha · adaylar", short: "saha" },
  { id: "team", label: "Ekip · başvurular", short: "ekip" },
];

interface QueueRow {
  /** Kayıt kimliği — aynı kayıt iki satır üretmesin diye tek anahtar. */
  id: string;
  group: QueueGroup;
  icon: LucideIcon;
  subject: string;
  detail: string;
  amount?: number;
  ageDays?: number;
  to: string;
}

/**
 * Satış aşaması — SIRA ÖNEMLİ, ilk eşleşen kazanır (rapor §1):
 * S1 kesinleşti → S2 iptal → S3 kesinleştirme yarım → S4/S5 bekleyen
 * ödeme (EFT/manuel vs kart) → S6 ödeme kaydı yok.
 * Böylece bir satış kuyrukta en fazla bir satır üretir.
 */
type SaleStage = "settled" | "cancelled" | "confirm" | "eft" | "card" | "none";

function saleStage(sale: Sale, rows: Payment[]): SaleStage {
  if (sale.status === "odendi") return "settled";
  if (sale.status === "iptal") return "cancelled";
  // Onaylı ödeme var ama satış hâlâ potansiyel: kesinleştirme yarıda kalmış.
  if (rows.some((payment) => payment.status === "onaylandi")) return "confirm";
  const pending = rows.find((payment) => payment.status === "beklemede");
  if (pending) {
    // "hicbiri" = sağlayıcı yok, yöneticinin manuel/EFT onayı bekleniyor.
    return pending.provider === "eft" || pending.provider === "hicbiri" ? "eft" : "card";
  }
  return "none";
}

function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function ageLabel(days: number): string {
  return days <= 0 ? "bugün" : `${days} gündür`;
}

function oldest(rows: Payment[], status: Payment["status"]): string | undefined {
  return rows
    .filter((payment) => payment.status === status)
    .map((payment) => payment.createdAt)
    .sort()[0];
}

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

function channelLabel(sale: Sale, reps: { id: string; name: string }[]): string {
  if (sale.channel === "temsilci") return reps.find((rep) => rep.id === sale.repId)?.name ?? "Temsilci";
  if (sale.referralCode) return `Doğrudan · ${sale.referralCode}`;
  return "Doğrudan";
}

function leadDetail(lead: Lead): string {
  const parts = ["Anlaşma bildirildi"];
  if (lead.district) parts.push(lead.district);
  parts.push("firmaya dönüştürülmedi");
  return parts.join(" · ");
}

export default function AdminDashboard() {
  useLiveDataRevision();
  const actor = useActor();

  // --- Okumalar (tek geçiş; iş mantığı çağrılmaz, yalnız sorgular) ---
  const companies = listCompanies({ includeUnpublished: true });
  const sales = listSales(actor);
  const payments = listPayments(actor);
  const leads = listLeads(actor);
  const reps = listReps(actor);
  const commissions = listCommissions(actor);
  const payoutSummary = listCommissionPayoutSummary(actor);
  const teamSummary = listTeamCommissionSummary(actor);
  const repApplications = listRepApplications(actor);
  const teamApplications = listTeamJoinApplications(actor);
  const audit = listAudit(6);
  const months = monthlyReport(6);

  // Satış → ödemeleri indeksi: her satış için tek aşama sınıflaması.
  const paymentsBySale = new Map<string, Payment[]>();
  for (const payment of payments) {
    const rows = paymentsBySale.get(payment.saleId);
    if (rows) rows.push(payment);
    else paymentsBySale.set(payment.saleId, [payment]);
  }
  const salesByCompany = new Map<string, Sale[]>();
  for (const sale of sales) {
    const rows = salesByCompany.get(sale.companyId);
    if (rows) rows.push(sale);
    else salesByCompany.set(sale.companyId, [sale]);
  }

  // --- Cetvel bandı: kesinleşmiş para ---
  const confirmedSales = sales.filter((sale) => sale.status === "odendi");
  const collected = confirmedSales.reduce((sum, sale) => sum + sale.amount, 0);
  const potentialSales = sales.filter((sale) => sale.status === "potansiyel");
  const awaitingAmount = potentialSales.reduce((sum, sale) => sum + sale.amount, 0);

  // --- Kuyruk ---
  const queue: QueueRow[] = [];
  const stageCounts: Record<Exclude<SaleStage, "settled" | "cancelled">, number> = {
    confirm: 0,
    eft: 0,
    card: 0,
    none: 0,
  };

  for (const sale of sales) {
    const rows = paymentsBySale.get(sale.id) ?? [];
    const stage = saleStage(sale, rows);
    if (stage === "settled" || stage === "cancelled") continue;

    const companyName = getCompanyById(sale.companyId)?.name ?? "Firma kaydı yok";
    const renewal = sale.renewalForMembershipId ? "Yenileme" : "Üyelik";
    stageCounts[stage] += 1;

    if (stage === "confirm") {
      queue.push({
        id: `sale:${sale.id}`,
        group: "money",
        icon: CircleAlert,
        subject: companyName,
        detail: `Onaylı ödeme var, satış kesinleşmedi · ${renewal}`,
        amount: sale.amount,
        ageDays: daysSince(sale.createdAt),
        to: "/yonetim/odemeler",
      });
    } else if (stage === "eft") {
      const pending = rows.find((payment) => payment.status === "beklemede");
      queue.push({
        id: `sale:${sale.id}`,
        group: "money",
        icon: CreditCard,
        subject: companyName,
        detail: `${paymentMethod(pending)} ödeme onayı bekliyor · ${renewal}`,
        amount: sale.amount,
        ageDays: daysSince(oldest(rows, "beklemede") ?? sale.createdAt),
        to: "/yonetim/odemeler",
      });
    } else if (stage === "card") {
      queue.push({
        id: `sale:${sale.id}`,
        group: "money",
        icon: CreditCard,
        subject: companyName,
        detail: `Kart ödemesi sağlayıcı doğrulamasında · ${renewal}`,
        amount: sale.amount,
        ageDays: daysSince(oldest(rows, "beklemede") ?? sale.createdAt),
        to: "/yonetim/odemeler",
      });
    } else {
      queue.push({
        id: `sale:${sale.id}`,
        group: "money",
        icon: Wallet,
        subject: companyName,
        detail: `Ödeme kaydı açılmamış · ${renewal}`,
        amount: sale.amount,
        ageDays: daysSince(sale.createdAt),
        to: "/yonetim/odemeler",
      });
    }
  }

  /*
   * F1 — yayına hazır firma. Çift sayım kilidi: yayında DEĞİL + onaylı ödeme
   * var + kesinleşmiş (odendi) satış var. "Onaylı ödeme var ama satış hâlâ
   * potansiyel" durumu burada DEĞİL, S3 satırında görünür.
   */
  const readyCompanies = companies.filter((company) => {
    if (company.published) return false;
    const companySales = salesByCompany.get(company.id) ?? [];
    if (!companySales.some((sale) => sale.status === "odendi")) return false;
    return companyHasConfirmedPayment(company.id);
  });

  for (const company of readyCompanies) {
    const confirmed = (salesByCompany.get(company.id) ?? []).find((sale) => sale.status === "odendi");
    queue.push({
      id: `company:${company.id}`,
      group: "content",
      icon: Store,
      subject: company.name,
      detail: "Ödeme onaylı, firma yayına alınmayı bekliyor",
      ageDays: daysSince(confirmed?.confirmedAt ?? confirmed?.createdAt ?? company.createdAt),
      to: "/yonetim/firmalar",
    });
  }

  // --- Adaylar: dönüşüm (anlaşma) ve takip (diğer) ayrık kümeler ---
  const pendingLeads = leads.filter(
    (lead) => lead.status === "anlaşma" && !lead.convertedToCompanyId,
  );
  const openLeads = leads.filter(
    (lead) => lead.status !== "anlaşma" && lead.status !== "iptal",
  );

  for (const lead of pendingLeads) {
    queue.push({
      id: `lead:${lead.id}`,
      group: "field",
      icon: Target,
      subject: lead.companyName,
      detail: leadDetail(lead),
      ageDays: daysSince(lead.createdAt),
      to: "/yonetim/adaylar",
    });
  }

  if (openLeads.length > 0) {
    const oldestLead = [...openLeads].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    queue.push({
      id: "lead:open",
      group: "field",
      icon: Target,
      subject: `${openLeads.length} aday takip bekliyor`,
      detail: "Yeni, iletişim ve görüşme aşamasındakiler",
      ageDays: daysSince(oldestLead?.createdAt),
      to: "/yonetim/adaylar",
    });
  }

  // --- Başvurular: personel ve ekip ayrı defter, ayrı satır ---
  const pendingRepApplications = repApplications.filter((app) => app.status === "beklemede");
  const pendingTeamApplications = teamApplications.filter((app) => app.status === "beklemede");

  if (pendingRepApplications.length > 0) {
    const oldestApp = [...pendingRepApplications].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    queue.push({
      id: "application:rep",
      group: "team",
      icon: ClipboardList,
      subject: `${pendingRepApplications.length} personel başvurusu`,
      detail: "Referansla gelen başvurular incelenmeyi bekliyor",
      ageDays: daysSince(oldestApp?.createdAt),
      to: "/yonetim/basvurular",
    });
  }

  if (pendingTeamApplications.length > 0) {
    const oldestApp = [...pendingTeamApplications].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    queue.push({
      id: "application:team",
      group: "team",
      icon: Users,
      subject: `${pendingTeamApplications.length} ekip katılım başvurusu`,
      detail: "Personelin ekip katılımı onay bekliyor",
      ageDays: daysSince(oldestApp?.createdAt),
      to: "/yonetim/ekipler",
    });
  }

  // Grup sırası sabit; grup içinde tutar (yoksa 0) ve bekleme yaşı azalan.
  const groupRank: Record<QueueGroup, number> = { money: 0, content: 1, field: 2, team: 3 };
  queue.sort(
    (a, b) =>
      groupRank[a.group] - groupRank[b.group] ||
      (b.amount ?? -1) - (a.amount ?? -1) ||
      (b.ageDays ?? -1) - (a.ageDays ?? -1),
  );

  const queueByGroup = queue.reduce<Record<string, number>>((acc, row) => {
    acc[row.group] = (acc[row.group] ?? 0) + 1;
    return acc;
  }, {});

  // --- Firma durumu ---
  const publishedCount = companies.filter((company) => company.published).length;
  const unpublishedCount = companies.length - publishedCount;

  // --- Komisyon borçları: iki ayrı defter, ayrı toplam ---
  const repDebt = payoutSummary.reduce((sum, row) => sum + row.outstanding, 0);
  const leaderDebt = teamSummary.reduce((sum, row) => sum + row.outstanding, 0);

  // --- İkincil ölçümler ---
  const activeReps = reps.filter((rep) => rep.status === "aktif");
  const pendingApplicationCount = pendingRepApplications.length + pendingTeamApplications.length;

  const pendingParts: string[] = [];
  if (stageCounts.none) pendingParts.push(`${stageCounts.none} ödeme kaydı yok`);
  if (stageCounts.eft) pendingParts.push(`${stageCounts.eft} EFT onayı`);
  if (stageCounts.confirm) pendingParts.push(`${stageCounts.confirm} kesinleştirme`);
  if (stageCounts.card) pendingParts.push(`${stageCounts.card} kart doğrulaması`);

  const queueSub = QUEUE_GROUPS.filter((group) => queueByGroup[group.id] > 0)
    .map((group) => `${queueByGroup[group.id]} ${group.short}`)
    .join(" · ");

  // --- Son hareketler ---
  const recentSales = sales.slice(0, 6);
  const recentPayments = [...payments]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  // --- Personel performansı ---
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

  // --- Altı aylık eğilim ---
  const maxMonth = Math.max(1, ...months.map((month) => month.totalAmount));
  const trendEmpty = months.every((month) => month.totalAmount === 0 && month.saleCount === 0);

  return (
    <div className="panel-content adm-dash">
      <PanelHead
        title="Genel Bakış"
        desc="Tahsilat, karar kuyruğu ve yayın durumu. Tüm rakamlar kayıtlı gerçek verilerden hesaplanır."
      />

      {!isSupabaseConfigured && (
        <InfoBanner>
          <strong>Demo mod aktif:</strong> Veriler bu tarayıcıda tutuluyor.
        </InfoBanner>
      )}

      {/* ============ CETVEL BANDI ============ */}
      <section className="dq-band" aria-label="Özet göstergeler">
        <div className="dq-band__primary">
          <div className="dq-cell">
            <div className="dq-cell__label">Tahsil edilen</div>
            <div className="dq-cell__value">{formatTRY(collected)}</div>
            <div className="dq-cell__sub">{confirmedSales.length} kesinleşen satış</div>
          </div>
          <div className="dq-cell">
            <div className="dq-cell__label">Bekleyen tahsilat</div>
            <div className="dq-cell__value">{formatTRY(awaitingAmount)}</div>
            <div className="dq-cell__sub">
              {pendingParts.length > 0 ? pendingParts.join(" · ") : "Bekleyen satış yok"}
            </div>
          </div>
          <div className="dq-cell">
            <div className="dq-cell__label">Karar kuyruğu</div>
            <div className="dq-cell__value">{queue.length}</div>
            <div className="dq-cell__sub">
              {queue.length === 0 ? "Bekleyen karar yok" : queueSub}
            </div>
          </div>
          <div className="dq-cell">
            <div className="dq-cell__label">Yayındaki firma</div>
            <div className="dq-cell__value">{publishedCount}</div>
            <div className="dq-cell__sub">
              {companies.length} firma · {unpublishedCount} yayın dışı
              {readyCompanies.length > 0 ? ` · ${readyCompanies.length} yayına hazır` : ""}
            </div>
          </div>
        </div>

        <div className="dq-band__secondary">
          <div className="dq-measure">
            <span className="dq-measure__label">Toplam satış</span>
            <span className="dq-measure__value">{sales.length}</span>
          </div>
          <div className="dq-measure">
            <span className="dq-measure__label">Açık aday</span>
            <span className="dq-measure__value">{openLeads.length}</span>
          </div>
          <div className="dq-measure">
            <span className="dq-measure__label">Aktif personel</span>
            <span className="dq-measure__value">
              {activeReps.length} / {reps.length}
            </span>
          </div>
          <div className="dq-measure">
            <span className="dq-measure__label">Temsilciye ödenecek</span>
            <span className="dq-measure__value">{formatTRY(repDebt)}</span>
          </div>
          <div className="dq-measure">
            <span className="dq-measure__label">Ekip liderine ödenecek</span>
            <span className="dq-measure__value">{formatTRY(leaderDebt)}</span>
          </div>
          <div className="dq-measure">
            <span className="dq-measure__label">Bekleyen başvuru</span>
            <span className="dq-measure__value">{pendingApplicationCount}</span>
          </div>
        </div>
      </section>

      {/* ============ OPERASYON KUYRUĞU ============ */}
      <section className="dq-panel" aria-labelledby="dq-queue-title">
        <div className="dq-panel__head">
          <h2 id="dq-queue-title">
            <CircleAlert size={16} strokeWidth={1.9} aria-hidden="true" />
            Operasyon kuyruğu
          </h2>
          <span className="dq-panel__count">{queue.length} iş</span>
        </div>
        <div className="dq-panel__body dq-panel__body--flush">
          {queue.length === 0 ? (
            <p className="dq-empty">
              Karar bekleyen iş yok. Para, içerik, saha ve ekip kuyruklarının tümü boş.
            </p>
          ) : (
            QUEUE_GROUPS.map((group) => {
              const rows = queue.filter((row) => row.group === group.id);
              if (rows.length === 0) return null;
              return (
                <div className="dq-queue__group" key={group.id}>
                  <div className="dq-queue__grouplabel">
                    {group.label}
                    <em>{rows.length}</em>
                  </div>
                  {rows.map((row, index) => {
                    const Icon = row.icon;
                    const hasSide = row.amount !== undefined || row.ageDays !== undefined;
                    return (
                      <Link
                        key={row.id}
                        to={row.to}
                        className={`dq-row dq-row--${row.group} dq-reveal${hasSide ? "" : " dq-row--plain"}`}
                        style={{ "--rd": index } as CSSProperties}
                      >
                        <span className="dq-row__glyph" aria-hidden="true">
                          <Icon size={16} strokeWidth={1.9} />
                        </span>
                        <span className="dq-row__text">
                          <strong>{row.subject}</strong>
                          <span>{row.detail}</span>
                        </span>
                        {hasSide && (
                          <span className="dq-row__side">
                            {row.amount !== undefined && (
                              <span className="dq-row__amount">{formatTRY(row.amount)}</span>
                            )}
                            {row.ageDays !== undefined && (
                              <span className="dq-row__age">{ageLabel(row.ageDays)}</span>
                            )}
                          </span>
                        )}
                        <ArrowRight
                          className="dq-row__go"
                          size={14}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      </Link>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ============ AKIŞ: SON SATIŞLAR + HIZLI İŞLEM / ÖDEMELER ============ */}
      <div className="dq-split">
        <section className="dq-panel" aria-labelledby="dq-sales-title">
          <div className="dq-panel__head">
            <h2 id="dq-sales-title">
              <Wallet size={16} strokeWidth={1.9} aria-hidden="true" />
              Son satışlar
            </h2>
            <Link className="dq-panel__link" to="/yonetim/satislar">
              Tümü <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="dq-panel__body dq-panel__body--flush">
            {recentSales.length === 0 ? (
              <EmptyState
                title="Henüz satış kaydı yok"
                description="İlk satışı açtığınızda burada görünecek."
              />
            ) : (
              <div className="dq-ledger">
                {recentSales.map((sale) => {
                  const company = getCompanyById(sale.companyId);
                  const status = saleStatus(sale);
                  return (
                    <div className="dq-ledger__row" key={sale.id}>
                      <div className="dq-ledger__main">
                        <span className="dq-ledger__title">{company?.name ?? "—"}</span>
                        <span className="dq-ledger__meta">
                          <span>{channelLabel(sale, reps)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{sale.renewalForMembershipId ? "Yenileme" : "Üyelik"}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatShortDate(sale.createdAt)}</span>
                        </span>
                      </div>
                      <div className="dq-ledger__side">
                        <span className="dq-ledger__amount">{formatTRY(sale.amount)}</span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="dq-split__stack">
          <section className="dq-panel" aria-labelledby="dq-quick-title">
            <div className="dq-panel__head">
              <h2 id="dq-quick-title">Hızlı işlem</h2>
            </div>
            <div className="dq-panel__body">
              <div className="dq-quick">
                {QUICK_ACTIONS.map(({ to, label, desc, icon: Icon }) => (
                  <Link key={to} className="dq-quick__item" to={to}>
                    <span className="dq-quick__icon" aria-hidden="true">
                      <Icon size={15} strokeWidth={1.9} />
                    </span>
                    <span className="dq-quick__text">
                      <strong>{label}</strong>
                      <small>{desc}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section className="dq-panel" aria-labelledby="dq-payments-title">
            <div className="dq-panel__head">
              <h2 id="dq-payments-title">
                <CreditCard size={16} strokeWidth={1.9} aria-hidden="true" />
                Son ödemeler
              </h2>
              <Link className="dq-panel__link" to="/yonetim/odemeler">
                Tümü <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>
            <div className="dq-panel__body dq-panel__body--flush">
              {recentPayments.length === 0 ? (
                <p className="dq-empty">Henüz ödeme kaydı oluşmadı.</p>
              ) : (
                <div className="dq-ledger">
                  {recentPayments.map((payment) => {
                    const sale = sales.find((row) => row.id === payment.saleId);
                    const company = sale ? getCompanyById(sale.companyId) : undefined;
                    const status = paymentLabel(payment);
                    const dot =
                      payment.status === "onaylandi"
                        ? "dq-dot--green"
                        : payment.status === "beklemede"
                          ? "dq-dot--amber"
                          : payment.status === "hata"
                            ? "dq-dot--red"
                            : "dq-dot--blue";
                    return (
                      <div className="dq-ledger__row" key={payment.id}>
                        <div className="dq-ledger__main">
                          <span className="dq-ledger__title">{company?.name ?? "—"}</span>
                          <span className="dq-ledger__meta">
                            <span
                              className={`dq-dot ${dot}`}
                              aria-hidden="true"
                              style={{ marginRight: 2 }}
                            />
                            <span>{paymentMethod(payment)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatShortDate(payment.updatedAt)}</span>
                          </span>
                        </div>
                        <div className="dq-ledger__side">
                          <span className="dq-ledger__amount">{formatTRY(payment.amount)}</span>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ============ EĞİLİM + PERSONEL ============ */}
      <div className="dq-split">
        <section className="dq-panel" aria-labelledby="dq-trend-title">
          <div className="dq-panel__head">
            <h2 id="dq-trend-title">
              <ChartNoAxesColumnIncreasing size={16} strokeWidth={1.9} aria-hidden="true" />
              Altı aylık satış eğilimi
            </h2>
            <Link className="dq-panel__link" to="/yonetim/raporlar">
              Raporlar <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="dq-panel__body">
            {trendEmpty ? (
              <p className="dq-empty" style={{ padding: 0 }}>
                Kesinleşen satış olmadığı için grafik boş.
              </p>
            ) : (
              <div className="dq-bars">
                {months.map((month) => (
                  <div className="dq-bar" key={month.month}>
                    <span className="dq-bar__label">
                      {new Intl.DateTimeFormat("tr-TR", {
                        month: "short",
                        year: "2-digit",
                      }).format(new Date(`${month.month}-01T12:00:00`))}
                    </span>
                    <span
                      className="dq-bar__track"
                      role="img"
                      aria-label={`${month.saleCount} satış, ${formatTRY(month.totalAmount)}`}
                    >
                      <span
                        className="dq-bar__fill"
                        style={{ width: `${(month.totalAmount / maxMonth) * 100}%` }}
                      />
                    </span>
                    <span className="dq-bar__value">
                      {formatTRY(month.totalAmount)}{" "}
                      <span>· {month.saleCount}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="dq-panel" aria-labelledby="dq-perf-title">
          <div className="dq-panel__head">
            <h2 id="dq-perf-title">
              <Users size={16} strokeWidth={1.9} aria-hidden="true" />
              Personel performansı
            </h2>
            <Link className="dq-panel__link" to="/yonetim/temsilciler">
              Personel <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className="dq-panel__body">
            {perf.length === 0 ? (
              <p className="dq-empty" style={{ padding: 0 }}>
                Kayıtlı personel yok.
              </p>
            ) : (
              <>
                {perf.slice(0, 4).map(({ rep, count, amount, commission }) => (
                  <div className="dq-perf" key={rep.id}>
                    <div className="dq-perf__top">
                      <span className="dq-perf__name">
                        {rep.name}
                        <Badge tone={rep.status === "aktif" ? "green" : "gray"}>
                          {rep.status === "aktif" ? "Aktif" : "Pasif"}
                        </Badge>
                      </span>
                      <span className="dq-perf__value">{formatTRY(amount)}</span>
                    </div>
                    <span className="dq-perf__meter" aria-hidden="true">
                      <span
                        className="dq-perf__fill"
                        style={{ width: `${amount === 0 ? 0 : Math.max(4, (amount / maxPerf) * 100)}%` }}
                      />
                    </span>
                    <div className="dq-perf__meta">
                      {count} kesinleşen satış · {formatTRY(commission)} komisyon
                    </div>
                  </div>
                ))}
                {repDebt > 0 && (
                  <p className="dq-perf__meta" style={{ marginTop: 12 }}>
                    Temsilcilere toplam {formatTRY(repDebt)} ödeme bekliyor.
                  </p>
                )}
                {leaderDebt > 0 && (
                  <p className="dq-perf__meta" style={{ marginTop: 2 }}>
                    Ekip liderlerine toplam {formatTRY(leaderDebt)} ödeme bekliyor.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {/* ============ DENETİM İZİ ============ */}
      <section className="dq-panel" aria-labelledby="dq-audit-title">
        <div className="dq-panel__head">
          <h2 id="dq-audit-title">
            <ClipboardList size={16} strokeWidth={1.9} aria-hidden="true" />
            Son işlemler
          </h2>
          <Link className="dq-panel__link" to="/yonetim/denetim">
            Tüm kayıtlar <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        <div className="dq-panel__body dq-panel__body--flush">
          {audit.length === 0 ? (
            <p className="dq-empty">Henüz denetim kaydı yok.</p>
          ) : (
            <div className="dq-log">
              {audit.map((entry) => (
                <div className="dq-log__row" key={entry.id}>
                  <span className="dq-log__time">{formatShortDate(entry.at)}</span>
                  <span className="dq-log__body">
                    <span className="dq-log__action">
                      {auditActionLabels[entry.action] ?? entry.action}
                    </span>
                    {entry.summary}
                  </span>
                  <span className="dq-log__actor">{entry.actorRole}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
