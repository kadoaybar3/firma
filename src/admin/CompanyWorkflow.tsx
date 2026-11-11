import { useState } from "react";
import { ArrowRight, BadgeCheck, Building2, Check, CreditCard, Loader2, Target } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { CompanyForm } from "./Companies";
import { Badge, EmptyState, ErrorBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatTRY } from "../lib/format";
import {
  approveEftPayment,
  convertLead,
  createPendingPayment,
  getCompanyById,
  getSettings,
  listCategories,
  listCities,
  listLeads,
  listPayments,
  listReps,
  listSales,
  updateCompany,
} from "../lib/repo";
import type { CompanyDraft } from "../lib/repo";
import type { Lead, Sale } from "../lib/types";

export default function CompanyWorkflow() {
  useLiveDataRevision();
  const actor = useActor();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, refresh] = useState(0);

  const leads = listLeads(actor).filter((lead) => lead.status === "anlaşma" && !lead.convertedToCompanyId);
  const sales = listSales(actor).filter((sale) => sale.channel === "temsilci");
  const payments = listPayments(actor);
  const reps = listReps(actor);
  const pendingPaymentSales = sales.filter((sale) => sale.status === "potansiyel");
  const publishReady = sales
    .filter((sale) => sale.status === "odendi")
    .map((sale) => ({ sale, company: getCompanyById(sale.companyId) }))
    .filter((row) => row.company && !row.company.published);

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      refresh((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "İşlem tamamlanamadı.");
    } finally {
      setBusy(null);
    }
  }

  function paymentFor(sale: Sale) {
    return payments
      .filter((payment) => payment.saleId === sale.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((payment) => payment.status === "beklemede" || payment.status === "onaylandi");
  }

  const settings = getSettings();

  return (
    <div className="panel-content">
      <PanelHead
        title="Firma Akışı"
        desc="Temsilci adayını inceleyin, satış ve ödemeyi tamamlayın, firmayı aynı ekrandan yayına alın."
      />
      {error && <ErrorBanner message={error} />}
      {message && <div className="adm-workflow__notice" role="status">{message}</div>}
      <div className="adm-workflow__steps" aria-label="Firma kayıt adımları">
        <span><Target size={16} /> Aday inceleme</span><ArrowRight size={15} aria-hidden="true" />
        <span><Building2 size={16} /> Firma ve satış</span><ArrowRight size={15} aria-hidden="true" />
        <span><CreditCard size={16} /> Ödeme</span><ArrowRight size={15} aria-hidden="true" />
        <span><BadgeCheck size={16} /> Yayın</span>
      </div>

      <section className="adm-panel adm-workflow__section">
        <div className="adm-panel__head"><div><h2>1 · Yönetici onayındaki adaylar</h2><p>Anlaşma bildirimi ödeme alındığı anlamına gelmez. Adayı inceleyip firma kaydına dönüştürün.</p></div><Badge tone={leads.length ? "orange" : "gray"}>{leads.length}</Badge></div>
        <div className="adm-panel__body">
          {leads.length === 0 ? <EmptyState icon={<Target size={25} />} title="Onay bekleyen aday yok" /> : leads.map((lead) => (
            <article className="adm-workflow__row" key={lead.id}>
              <div><strong>{lead.companyName}</strong><div className="adm-workflow__meta">{lead.phone || "Telefon girilmemiş"} · {lead.district || "İlçe belirtilmemiş"} · {reps.find((rep) => rep.id === lead.repId)?.name ?? "Temsilci atanmamış"}</div></div>
              <button className="btn btn--primary btn--sm" type="button" onClick={() => setSelectedLead(lead)}>İncele ve firmaya dönüştür</button>
            </article>
          ))}
        </div>
      </section>

      <section className="adm-panel adm-workflow__section">
        <div className="adm-panel__head"><div><h2>2 · Ödeme bekleyen temsilci satışları</h2><p>Önce ödeme kaydını açın; EFT gerçekten hesaba geçtiğinde aynı satırdan onaylayın.</p></div><Badge tone={pendingPaymentSales.length ? "orange" : "gray"}>{pendingPaymentSales.length}</Badge></div>
        <div className="adm-panel__body">
          {pendingPaymentSales.length === 0 ? <EmptyState icon={<CreditCard size={25} />} title="Ödeme bekleyen satış yok" /> : pendingPaymentSales.map((sale) => {
            const company = getCompanyById(sale.companyId);
            const payment = paymentFor(sale);
            const key = `payment-${sale.id}`;
            return <article className="adm-workflow__row" key={sale.id}>
              <div><strong>{company?.name ?? "Firma kaydı bulunamadı"}</strong><div className="adm-workflow__meta">{formatTRY(sale.amount || settings.membershipPrice)} · {payment ? "Ödeme kaydı açık" : "Ödeme kaydı henüz açılmadı"}</div></div>
              {payment ? <button className="btn btn--primary btn--sm" type="button" disabled={busy === key} onClick={() => void run(key, async () => { await approveEftPayment(sale.id, actor); setMessage("EFT onaylandı; satış kesinleşti. Firma yayın adımına geçti."); })}>{busy === key ? <Loader2 size={15} /> : <Check size={15} />} EFT alındı · onayla</button> : <button className="btn btn--sm" type="button" disabled={busy === key} onClick={() => void run(key, async () => { await createPendingPayment(sale.id, actor); setMessage("Ödeme kaydı açıldı. EFT hesaba geçtiğinde bu ekrandan onaylayabilirsiniz."); })}>{busy === key ? <Loader2 size={15} /> : <CreditCard size={15} />} Ödeme kaydı aç</button>}
            </article>;
          })}
        </div>
      </section>

      <section className="adm-panel adm-workflow__section">
        <div className="adm-panel__head"><div><h2>3 · Yayına alınmaya hazır firmalar</h2><p>Ödemesi onaylanmış firmaları son kez kontrol edip rehberde yayınlayın.</p></div><Badge tone={publishReady.length ? "blue" : "gray"}>{publishReady.length}</Badge></div>
        <div className="adm-panel__body">
          {publishReady.length === 0 ? <EmptyState icon={<BadgeCheck size={25} />} title="Yayına hazır firma yok" /> : publishReady.map(({ sale, company }) => company && <article className="adm-workflow__row" key={sale.id}>
            <div><strong>{company.name}</strong><div className="adm-workflow__meta">{formatTRY(sale.amount)} · Ödeme onaylandı · {company.phone}</div></div>
            <button className="btn btn--primary btn--sm" type="button" disabled={busy === `publish-${company.id}`} onClick={() => void run(`publish-${company.id}`, async () => { updateCompany(company.id, { published: true }, actor); setMessage(`${company.name} rehberde yayına alındı.`); })}>{busy === `publish-${company.id}` ? <Loader2 size={15} /> : <Check size={15} />} Yayına al</button>
          </article>)}
        </div>
      </section>

      {selectedLead && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLead(null); }}>
        <div className="adm-workflow__dialog" role="dialog" aria-modal="true" aria-label="Adayı incele ve firmaya dönüştür">
          <ConvertLeadForm lead={selectedLead} onCancel={() => setSelectedLead(null)} onSubmit={(draft) => void run(`lead-${selectedLead.id}`, async () => { await convertLead(selectedLead.id, draft, actor); setSelectedLead(null); setMessage("Firma ve temsilci satışı oluşturuldu. Ödeme adımına geçebilirsiniz."); })} />
        </div>
      </div>}
    </div>
  );
}

function ConvertLeadForm({ lead, onCancel, onSubmit }: { lead: Lead; onCancel: () => void; onSubmit: (draft: CompanyDraft) => void }) {
  const categories = listCategories();
  const cities = listCities();
  return <CompanyForm categories={categories} cities={cities} reps={listReps()} title={`Adayı incele: ${lead.companyName}`} onCancel={onCancel} onSubmit={onSubmit} initial={{ name: lead.companyName, categoryId: lead.categoryId ?? categories[0]?.id ?? "", cityId: lead.cityId ?? cities[0]?.id ?? "", district: lead.district ?? "Merkez", address: lead.address ?? "", latitude: lead.latitude, longitude: lead.longitude, phone: lead.phone ?? "", email: lead.email ?? "", website: "", socials: { ...lead.socials, whatsapp: lead.socials?.whatsapp ?? lead.phone ?? "" }, description: lead.note, featured: false, published: false, repId: lead.repId ?? null }} />;
}
