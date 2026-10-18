import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelHead } from "./AdminLayout";
import { CompanyForm } from "./Companies";
import { Badge, EmptyState, ErrorBanner, Field, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import {
  addVisit,
  convertLead,
  createLead,
  deleteLead,
  getCompanyById,
  listCategories,
  listCities,
  listLeads,
  listReps,
  listVisits,
  updateLeadStatus,
} from "../lib/repo";
import type { CompanyDraft } from "../lib/repo";
import type { Lead, LeadStatus } from "../lib/types";

const LEAD_STATUSES: LeadStatus[] = ["yeni", "irtibat", "görüşme", "anlaşma", "iptal"];
const STATUS_TONE: Record<LeadStatus, "blue" | "gray" | "green" | "orange" | "red"> = {
  yeni: "blue",
  irtibat: "gray",
  görüşme: "orange",
  anlaşma: "green",
  iptal: "red",
};

export default function AdminLeads() {
  const actor = useActor();
  return (
    <div className="panel-content">
      <PanelHead
        title="Firma adayları"
        desc="Temsilcilerin sahadan topladığı firma adayları ve görüşme kayıtları."
      />
      <LeadBoard actor={actor} />
    </div>
  );
}

/** Aday tahtası — admin tümünü, temsilci yalnız kendi adaylarını görür */
export function LeadBoard({ actor }: { actor: ReturnType<typeof useActor> }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const leads = listLeads(actor);

  function run(fn: () => void) {
    setError(null);
    try {
      fn();
      setTick((t) => t + 1); // Başarılı işlem sonrası satır verisini tazele (dönüşüm rozeti vb.)
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  return (
    <div>
      {error && <ErrorBanner message={error} />}
      {leads.length === 0 ? (
        <EmptyState icon="🎯" title="Henüz aday kaydı yok" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Aday firma</th>
                <th>Temsilci</th>
                <th>İlçe</th>
                <th>Durum</th>
                <th>Ziyaret</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  expanded={expanded === lead.id}
                  onToggle={() => setExpanded(expanded === lead.id ? null : lead.id)}
                  run={run}
                  actor={actor}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeadRow({
  lead,
  expanded,
  onToggle,
  run,
  actor,
}: {
  lead: ReturnType<typeof listLeads>[number];
  expanded: boolean;
  onToggle: () => void;
  run: (fn: () => void) => void;
  actor: ReturnType<typeof useActor>;
}) {
  const [note, setNote] = useState(lead.note);
  const [converting, setConverting] = useState(false);
  const convertedCompany = lead.convertedToCompanyId
    ? getCompanyById(lead.convertedToCompanyId)
    : undefined;
  return (
    <>
      <tr>
        <td>
          <strong>{lead.companyName}</strong>
          {convertedCompany && (
            <div>
              <Link to={`/firma/${convertedCompany.slug}`} style={{ color: "inherit" }}>
                <Badge tone="green">→ Firma</Badge>
              </Link>
            </div>
          )}
          <div className="text-muted small">{formatDateTime(lead.createdAt)}</div>
        </td>
        <td>{actor.role === "admin" ? "—" : null}</td>
        <td className="text-muted">{lead.district ?? "—"}</td>
        <td>
          <select
            className="input"
            style={{ padding: "6px 10px", width: "auto" }}
            value={lead.status}
            onChange={(e) =>
              run(() => updateLeadStatus(lead.id, e.target.value as LeadStatus, undefined, actor))
            }
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>
        <td>
          <Badge tone={STATUS_TONE[lead.status]}>{lead.visitCount} ziyaret</Badge>
        </td>
        <td>
          <div className="actions-cell">
            <button className="btn btn--sm btn--ghost" onClick={onToggle}>
              {expanded ? "Kayıtları kapat" : "Ziyaret kayıtları"}
            </button>
            {actor.role === "admin" && !lead.convertedToCompanyId && (
              <button
                className="btn btn--sm btn--primary"
                onClick={() => setConverting((c) => !c)}
              >
                {converting ? "Dönüşümü kapat" : "Firmaya dönüştür"}
              </button>
            )}
            {actor.role === "admin" && !lead.convertedToCompanyId && (
              <button
                className="btn btn--sm btn--danger"
                onClick={() => {
                  if (confirm(`"${lead.companyName}" adayı silinsin mi?`))
                    run(() => deleteLead(lead.id, actor));
                }}
              >
                Sil
              </button>
            )}
          </div>
        </td>
      </tr>
      {converting && (
        <tr>
          <td colSpan={6} style={{ background: "#fafbfe" }}>
            <ConvertLeadPanel
              lead={lead}
              run={run}
              actor={actor}
              onClose={() => setConverting(false)}
            />
          </td>
        </tr>
      )}
      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: "#fafbfe" }}>
            <div className="grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <h4 style={{ marginBottom: 8 }}>Ziyaret / görüşme geçmişi</h4>
                {listVisits(lead.id).length === 0 ? (
                  <p className="text-muted small">Henüz ziyaret kaydı yok.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                    {listVisits(lead.id).map((v) => (
                      <li key={v.id} className="small">
                        <strong>{formatDateTime(v.date)}</strong> — {v.outcome || "sonuç yok"}{" "}
                        <div className="text-muted">{v.note}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <VisitForm leadId={lead.id} run={run} actor={actor} />
              </div>
              <div>
                <h4 style={{ marginBottom: 8 }}>Not güncelle</h4>
                <Field label="Aday notu">
                  <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                <button
                  className="btn btn--sm btn--primary"
                  onClick={() => run(() => updateLeadStatus(lead.id, lead.status, note, actor))}
                >
                  Notu kaydet
                </button>
                <div className="mt-14">
                  <StatCard
                    icon="📅"
                    label="Aday durumu değişikliği en son"
                    value={formatDateTime(lead.updatedAt)}
                    hint="Adayın güncellenme zamanı"
                  />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Aday→firma dönüşüm bölmesi: CompanyForm aday verisiyle önceden dolu açılır;
 * kaydedince firma oluşur (rep eşlemeli) ve aday dönüşüm işaretlenir.
 */
function ConvertLeadPanel({
  lead,
  run,
  actor,
  onClose,
}: {
  lead: Lead;
  run: (fn: () => void) => void;
  actor: ReturnType<typeof useActor>;
  onClose: () => void;
}) {
  const categories = listCategories();
  const cities = listCities();
  const reps = listReps();

  const initial: CompanyDraft = {
    name: lead.companyName,
    categoryId: lead.categoryId ?? categories[0]?.id ?? "",
    cityId: lead.cityId ?? cities[0]?.id ?? "",
    district: lead.district ?? "Merkez",
    address: "",
    phone: lead.phone ?? "",
    email: "",
    website: "",
    socials: {},
    description: lead.note,
    // hours verilmez → createCompany varsayılanını kullanır
    images: ["🏢"],
    featured: false,
    published: false, // admin onayı (doğrudan yayına al) olmadan yayına girmez
    repId: lead.repId ?? null,
  };

  return (
    <CompanyForm
      categories={categories}
      cities={cities}
      reps={reps}
      initial={initial}
      title={`Firmaya dönüştür: ${lead.companyName}`}
      onCancel={onClose}
      onSubmit={(draft) =>
        run(() => {
          convertLead(lead.id, draft, actor);
          onClose();
        })
      }
    />
  );
}

function VisitForm({
  leadId,
  run,
  actor,
}: {
  leadId: string;
  run: (fn: () => void) => void;
  actor: ReturnType<typeof useActor>;
}) {
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));

  return (
    <form
      className="mt-14"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => {
          addVisit(
            leadId,
            { date: new Date(date).toISOString(), note, outcome },
            actor,
          );
          setNote("");
          setOutcome("");
        });
      }}
    >
      <h4 style={{ marginBottom: 8 }}>Ziyaret ekle</h4>
      <div className="form-row">
        <input
          className="input"
          style={{ maxWidth: 210 }}
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <input
          className="input"
          style={{ maxWidth: 160 }}
          placeholder="Sonuç (ör: anlaşılma)"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
        <input
          className="input"
          placeholder="Görüşme notu…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
        />
        <button className="btn btn--sm btn--primary" type="submit">
          Kaydet
        </button>
      </div>
    </form>
  );
}

/** Temsilci aday formu (rep paneli de kullanır) */
export function NewLeadForm({ actor, onDone }: { actor: ReturnType<typeof useActor>; onDone?: () => void }) {
  const categories = listCitiesInventory();
  void categories;
  const [companyName, setCompanyName] = useState("");
  const [district, setDistrict] = useState("Merkez");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cities = listCities();

  return (
    <div className="card card__pad mb-14">
      <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Yeni firma adayı ekle</h3>
      {error && <ErrorBanner message={error} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          try {
            createLead(
              { companyName, cityId: cities[0]?.id, district, phone, note },
              actor,
            );
            setCompanyName("");
            setPhone("");
            setNote("");
            onDone?.();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Aday kaydedilemedi.");
          }
        }}
      >
        <div className="form-grid">
          <Field label="Firma adı" required>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </Field>
          <Field label="İlçe">
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              {cities[0]?.districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Telefon">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0555 000 00 00" />
          </Field>
          <Field label="Not">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Görüşme özeti…" />
          </Field>
        </div>
        <button className="btn btn--primary" type="submit">
          Adayı kaydet
        </button>
      </form>
    </div>
  );
}

function listCitiesInventory() {
  return listCities().flatMap((c) => c.districts);
}
