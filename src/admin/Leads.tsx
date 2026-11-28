import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, History, Target, Trash2 } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { CompanyForm } from "./Companies";
import { Badge, EmptyState, ErrorBanner, Field } from "../components/ui";
import {
  FirmFilterField,
  FirmFilters,
  FirmIdentity,
  FirmList,
  FirmListRow,
  FirmMenu,
  useFirmRowMenus,
} from "../components/FirmList";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatDateTime } from "../lib/format";
import {
  addVisit,
  convertLead,
  deleteLead,
  getCategoryById,
  getCityById,
  getCompanyById,
  getRepById,
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

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  yeni: "Yeni",
  irtibat: "İletişimde",
  "görüşme": "Görüşme",
  "anlaşma": "Anlaşma",
  iptal: "İptal",
};

type StatusFilter = "hepsi" | LeadStatus;

export default function AdminLeads() {
  const actor = useActor();
  return (
    <div className="panel-content">
      <PanelHead
        title="Adaylar"
        desc="Temsilcilerin sahadan topladığı firma adayları ve görüşme kayıtları."
      />
      <LeadBoard actor={actor} />
    </div>
  );
}

/** Aday tahtası — admin tümünü, temsilci yalnız kendi adaylarını görür */
export function LeadBoard({ actor }: { actor: ReturnType<typeof useActor> }) {
  useLiveDataRevision();
  useFirmRowMenus();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("hepsi");
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const leads = listLeads(actor);

  async function run(fn: () => void | Promise<void>) {
    setError(null);
    try {
      await fn();
      setTick((t) => t + 1); // Başarılı işlem sonrası satır verisini tazele (dönüşüm rozeti vb.)
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  const counts: Record<LeadStatus, number> = {
    yeni: 0,
    irtibat: 0,
    "görüşme": 0,
    "anlaşma": 0,
    iptal: 0,
  };
  for (const lead of leads) counts[lead.status] += 1;

  const needle = q.trim().toLocaleLowerCase("tr");
  const visible = leads.filter((lead) => {
    if (statusFilter !== "hepsi" && lead.status !== statusFilter) return false;
    if (!needle) return true;
    const repName = lead.repId ? (getRepById(lead.repId)?.name ?? "") : "";
    return `${lead.companyName} ${lead.district ?? ""} ${lead.phone ?? ""} ${lead.email ?? ""} ${lead.note} ${repName}`
      .toLocaleLowerCase("tr")
      .includes(needle);
  });

  const hasFilters = Boolean(needle || statusFilter !== "hepsi");

  function clearFilters() {
    setQ("");
    setStatusFilter("hepsi");
  }

  return (
    <div>
      {error && <ErrorBanner message={error} />}

      <FirmFilters
        total={leads.length}
        shown={visible.length}
        unit="aday"
        hasFilters={hasFilters}
        onClear={clearFilters}
        label="Aday listesi filtreleri"
      >
        <FirmFilterField label="Aday firma ara" wide>
          <input
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Firma adı, ilçe, telefon veya personel…"
            aria-label="Aday firma ara"
          />
        </FirmFilterField>
        <FirmFilterField label="Durum">
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Aday durumu filtresi"
          >
            <option value="hepsi">Tüm durumlar ({leads.length})</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABEL[status]} ({counts[status]})
              </option>
            ))}
          </select>
        </FirmFilterField>
      </FirmFilters>

      {leads.length === 0 ? (
        <EmptyState
          icon={<Target size={30} strokeWidth={1.5} aria-hidden="true" />}
          title="Henüz aday kaydı yok"
          description="Temsilciler sahadan firma adayı ekledikçe burada listelenir."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Target size={30} strokeWidth={1.5} aria-hidden="true" />}
          title="Eşleşen aday yok"
          description="Arama terimini veya durum filtresini değiştirin."
          action={
            <button type="button" className="btn" onClick={clearFilters}>
              Filtreleri temizle
            </button>
          }
        />
      ) : (
        <FirmList label="Aday firmalar">
          {visible.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              expanded={expanded === lead.id}
              converting={converting === lead.id}
              onToggleVisits={() => {
                setExpanded(expanded === lead.id ? null : lead.id);
                setConverting(null);
              }}
              onToggleConvert={() => {
                setConverting(converting === lead.id ? null : lead.id);
                setExpanded(null);
              }}
              run={run}
              actor={actor}
            />
          ))}
        </FirmList>
      )}
    </div>
  );
}

function LeadRow({
  lead,
  expanded,
  converting,
  onToggleVisits,
  onToggleConvert,
  run,
  actor,
}: {
  lead: ReturnType<typeof listLeads>[number];
  expanded: boolean;
  converting: boolean;
  onToggleVisits: () => void;
  onToggleConvert: () => void;
  run: (fn: () => void | Promise<void>) => void;
  actor: ReturnType<typeof useActor>;
}) {
  const [note, setNote] = useState(lead.note);
  const convertedCompany = lead.convertedToCompanyId
    ? getCompanyById(lead.convertedToCompanyId)
    : undefined;
  const category = lead.categoryId ? getCategoryById(lead.categoryId) : undefined;
  const city = lead.cityId ? getCityById(lead.cityId) : undefined;
  const place = [lead.district, city?.name].filter(Boolean).join(", ");
  const repName = lead.repId ? getRepById(lead.repId)?.name : undefined;

  return (
    <FirmListRow
      identity={
        <FirmIdentity
          name={lead.companyName}
          href={convertedCompany ? `/firma/${convertedCompany.slug}` : undefined}
          category={category?.name}
          place={place || undefined}
          phone={lead.phone}
          note={
            <>
              {formatDateTime(lead.createdAt)}
              {actor.role === "admin" && <> · {repName ?? "Temsilci atanmamış"}</>}
              {lead.source === "web" && <> · Web başvurusu</>}
            </>
          }
          badges={
            <>
              {lead.packageKey && (
                <Badge tone="blue">
                  {lead.packageKey === "normal" ? "Normal Paket" : "Öne Çıkan Paket"}
                </Badge>
              )}
              {convertedCompany ? (
                <Badge tone="green">Firmaya dönüştü</Badge>
              ) : lead.status === "anlaşma" ? (
                <Badge tone="orange">Anlaşma · yönetici incelemesinde</Badge>
              ) : null}
            </>
          }
        />
      }
      aside={
        <>
          <label className="fl-status">
            <span className="sr-only">{lead.companyName} aday durumu</span>
            <select
              value={lead.status}
              onChange={(e) =>
                run(() => {
                  updateLeadStatus(lead.id, e.target.value as LeadStatus, undefined, actor);
                })
              }
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <Badge tone="gray">{lead.visitCount} ziyaret</Badge>
          <div className="fl-row__actions">
            {convertedCompany ? (
              <Link className="btn btn--sm" to={`/firma/${convertedCompany.slug}`}>
                Profili gör
              </Link>
            ) : actor.role === "admin" ? (
              <button
                type="button"
                className="btn btn--sm btn--primary"
                aria-expanded={converting}
                onClick={onToggleConvert}
              >
                {converting ? "Dönüşümü kapat" : "Firmaya dönüştür"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--sm"
                aria-expanded={expanded}
                onClick={onToggleVisits}
              >
                {expanded ? "Kayıtları kapat" : "Ziyaret kayıtları"}
              </button>
            )}
            <FirmMenu
              label={`${lead.companyName} işlemleri`}
              items={[
                ...(actor.role === "admin"
                  ? [
                      {
                        label: expanded ? "Ziyaret kayıtlarını kapat" : "Ziyaret kayıtları",
                        icon: <History size={15} strokeWidth={1.9} aria-hidden="true" />,
                        onSelect: onToggleVisits,
                      },
                    ]
                  : []),
                ...(actor.role === "admin" && !lead.convertedToCompanyId
                  ? [
                      {
                        label: converting ? "Dönüşümü kapat" : "Firmaya dönüştür",
                        icon: <Building2 size={15} strokeWidth={1.9} aria-hidden="true" />,
                        onSelect: onToggleConvert,
                      },
                      {
                        label: "Adayı sil",
                        icon: <Trash2 size={15} strokeWidth={1.9} aria-hidden="true" />,
                        tone: "danger" as const,
                        onSelect: () => {
                          if (confirm(`"${lead.companyName}" adayı silinsin mi?`))
                            run(() => deleteLead(lead.id, actor));
                        },
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </>
      }
      footer={
        converting || expanded ? (
          <>
            {converting && (
              <ConvertLeadPanel lead={lead} run={run} actor={actor} onClose={onToggleConvert} />
            )}
            {expanded && (
              <div className="fl-detail">
                <div>
                  <h4>Ziyaret / görüşme geçmişi</h4>
                  {listVisits(lead.id).length === 0 ? (
                    <p className="text-muted small">Henüz ziyaret kaydı yok.</p>
                  ) : (
                    <ul className="fl-visits">
                      {listVisits(lead.id).map((v) => (
                        <li key={v.id}>
                          <strong>{formatDateTime(v.date)}</strong> — {v.outcome || "sonuç yok"}
                          {v.note && <div className="text-muted">{v.note}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <VisitForm leadId={lead.id} run={run} actor={actor} />
                </div>
                <div>
                  <h4>Not güncelle</h4>
                  <Field label="Aday notu">
                    <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                  <button
                    className="btn btn--sm btn--primary"
                    type="button"
                    onClick={() =>
                      run(() => {
                        updateLeadStatus(lead.id, lead.status, note, actor);
                      })
                    }
                  >
                    Notu kaydet
                  </button>
                  {(lead.address || lead.latitude !== undefined) && (
                    <div className="mt-14 small">
                      {lead.address && (
                        <p style={{ margin: "0 0 4px" }}>
                          <strong>Adres:</strong> {lead.address}
                        </p>
                      )}
                      {lead.latitude !== undefined && lead.longitude !== undefined && (
                        <p className="text-muted" style={{ margin: 0 }}>
                          Kayıtlı konum: {lead.latitude.toFixed(6)}, {lead.longitude.toFixed(6)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : undefined
      }
    />
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
  run: (fn: () => void | Promise<void>) => void;
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
    address: lead.address ?? "",
    latitude: lead.latitude,
    longitude: lead.longitude,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    website: "",
    socials: { ...lead.socials, whatsapp: lead.socials?.whatsapp ?? lead.phone ?? "" },
    description: lead.note,
    // Personelin girdiği saatler varsa aynen aktarılır; yoksa createCompany varsayılanı
    hours: lead.hours,
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
        run(async () => {
          await convertLead(lead.id, draft, actor);
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
  run: (fn: () => void | Promise<void>) => void;
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
