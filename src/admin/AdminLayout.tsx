import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Bell,
  ChartLine,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  ExternalLink,
  FolderTree,
  LayoutDashboard,
  type LucideIcon,
  LogOut,
  Map,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings2,
  Store,
  Target,
  Ticket,
  Users,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { RoleError } from "../App";
import { SyncBanner } from "../components/SyncBanner";
import { useAdminLiveUpdates } from "./useAdminLiveUpdates";
import "./admin.css";

interface SectionTab {
  to: string;
  label: string;
  icon?: LucideIcon;
}

interface NavSection {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Bu bölüme bağlı tüm yollar (aktiflik ve kırıntı için). */
  paths: string[];
  tabs: SectionTab[];
}

/**
 * Yönetim bilgi mimarisi — dokuz temel bölüm.
 * Alt sayfalar yeni rota uydurmadan, bölüm içi sekmelerle korunur.
 */
const SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Genel Bakış",
    to: "/yonetim",
    icon: LayoutDashboard,
    paths: ["/yonetim"],
    tabs: [],
  },
  {
    id: "company-workflow",
    label: "Firma Akışı",
    to: "/yonetim/firma-akisi",
    icon: Workflow,
    paths: ["/yonetim/firma-akisi"],
    tabs: [],
  },
  {
    id: "companies",
    label: "Firma Yönetimi",
    to: "/yonetim/firmalar",
    icon: Store,
    paths: ["/yonetim/firmalar", "/yonetim/adaylar", "/yonetim/ice-aktar"],
    tabs: [
      { to: "/yonetim/firmalar", label: "Firmalar", icon: Store },
      { to: "/yonetim/adaylar", label: "Adaylar", icon: Target },
      { to: "/yonetim/ice-aktar", label: "İçe Aktarma", icon: Download },
    ],
  },
  {
    id: "sales",
    label: "Satış ve Ödemeler",
    to: "/yonetim/satislar",
    icon: Wallet,
    paths: [
      "/yonetim/satislar",
      "/yonetim/uyelikler",
      "/yonetim/komisyonlar",
      "/yonetim/referanslar",
    ],
    tabs: [
      { to: "/yonetim/satislar", label: "Satışlar", icon: Wallet },
      { to: "/yonetim/uyelikler", label: "Üyelikler", icon: BadgeCheck },
      { to: "/yonetim/komisyonlar", label: "Temsilci Ödemeleri", icon: Receipt },
      { to: "/yonetim/referanslar", label: "Referanslar", icon: Ticket },
    ],
  },
  {
    id: "payment-approvals",
    label: "Ödeme Onayları",
    to: "/yonetim/odemeler",
    icon: CreditCard,
    paths: ["/yonetim/odemeler"],
    tabs: [],
  },
  {
    id: "team",
    label: "Personel Yönetimi",
    to: "/yonetim/temsilciler",
    icon: Users,
    paths: ["/yonetim/temsilciler"],
    tabs: [],
  },
  {
    id: "categories",
    label: "Kategoriler",
    to: "/yonetim/kategoriler",
    icon: FolderTree,
    paths: ["/yonetim/kategoriler", "/yonetim/sehirler"],
    tabs: [
      { to: "/yonetim/kategoriler", label: "Kategoriler", icon: FolderTree },
      { to: "/yonetim/sehirler", label: "Şehir ve İlçeler", icon: Map },
    ],
  },
  {
    id: "reports",
    label: "Raporlar",
    to: "/yonetim/raporlar",
    icon: ChartLine,
    paths: ["/yonetim/raporlar"],
    tabs: [],
  },
  {
    id: "audit",
    label: "İşlem Geçmişi",
    to: "/yonetim/denetim",
    icon: ClipboardList,
    paths: ["/yonetim/denetim"],
    tabs: [],
  },
  {
    id: "settings",
    label: "Ayarlar",
    to: "/yonetim/ayarlar",
    icon: Settings2,
    paths: ["/yonetim/ayarlar"],
    tabs: [],
  },
];

const RAIL_KEY = "ff.admin.sidebarRail";

function matchesPath(pathname: string, path: string): boolean {
  if (path === "/yonetim") return pathname === "/yonetim";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Aktif bölüm — en uzun yol eşleşmesi kazanır. */
function activeSection(pathname: string): NavSection | undefined {
  return SECTIONS.find((section) =>
    section.paths.some((path) => matchesPath(pathname, path)),
  );
}

/** Aktif sekme — bölüm içindeki en uzun eşleşme. */
function activeTab(section: NavSection | undefined, pathname: string): SectionTab | undefined {
  if (!section) return undefined;
  return [...section.tabs]
    .sort((a, b) => b.to.length - a.to.length)
    .find((tab) => matchesPath(pathname, tab.to));
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const live = useAdminLiveUpdates();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [rail, setRail] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [drawer, setDrawer] = useState(false);

  const section = activeSection(pathname);
  const tab = activeTab(section, pathname);
  const pageLabel = tab?.label ?? section?.label ?? "Panel";

  // Rota değişince mobil çekmece kapanır.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  // Çekmece açıkken arka plan kaydırması kilitlenir ve Esc ile kapanır.
  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawer]);

  // Ray tercihi yalnızca bir arayüz tercihi olarak saklanır.
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, rail ? "1" : "0");
    } catch {
      /* gizli mod — tercih saklanamaz */
    }
  }, [rail]);

  // Yetki koruması — asıl sınır sunucu tarafındaki RLS'dir.
  if (!user) {
    return (
      <RoleGate
        title="Yönetim paneli"
        message="Devam etmek için lütfen giriş yapın."
        onLogin={() => navigate("/giris", { replace: true })}
      />
    );
  }
  if (user.role !== "admin") return <RoleError expected="yönetici" />;

  return (
    <div
      className={`adm-shell ${rail ? "is-rail" : ""} ${drawer ? "is-drawer-open" : ""}`}
    >
      <button
        type="button"
        className="adm-backdrop"
        aria-label="Menüyü kapat"
        tabIndex={drawer ? 0 : -1}
        onClick={() => setDrawer(false)}
      />

      <aside className="adm-sidebar" aria-label="Yönetim menüsü">
        <div className="adm-brandrow">
          <Link className="adm-brand" to="/yonetim">
            <span className="adm-brand__mark" aria-hidden="true">
              <MapPin size={17} strokeWidth={2.1} />
            </span>
            <span className="adm-brand__text">
              <span className="adm-brand__title">Firma Rehberi</span>
              <span className="adm-brand__sub">Yönetim paneli</span>
            </span>
          </Link>
          <button
            type="button"
            className="adm-iconbtn adm-sidebar__close"
            aria-label="Menüyü kapat"
            onClick={() => setDrawer(false)}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="adm-sidebar__scroll">
          <div className="adm-navlabel">Yönetim</div>
          <nav className="adm-nav">
            {SECTIONS.map(({ to, icon: Icon, label, paths }) => {
              const isActive = paths.some((path) => matchesPath(pathname, path));
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/yonetim"}
                  title={label}
                  className={`adm-navlink ${isActive ? "is-active" : ""}`}
                  onClick={() => setDrawer(false)}
                >
                  <Icon size={18} strokeWidth={1.85} aria-hidden="true" />
                  <span className="adm-navlink__label">{label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="adm-sidebar__foot">
          <div className="adm-user">
            <span className="adm-user__avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="adm-user__text">
              <div className="adm-user__name" title={user.name}>
                {user.name}
              </div>
              <div className="adm-user__role">Yönetici</div>
            </div>
            <button
              type="button"
              className="adm-logout"
              aria-label="Çıkış yap"
              title="Çıkış yap"
              onClick={() => {
                logout();
                navigate("/", { replace: true });
              }}
            >
              <LogOut size={15} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-topbar">
          <div className="adm-topbar__left">
            <button
              type="button"
              className="adm-iconbtn adm-topbar__menu"
              aria-label="Menüyü aç"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={19} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="adm-iconbtn adm-topbar__rail"
              aria-label={rail ? "Menüyü genişlet" : "Menüyü daralt"}
              aria-pressed={rail}
              onClick={() => setRail((value) => !value)}
            >
              {rail ? (
                <PanelLeftOpen size={18} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={18} strokeWidth={1.9} aria-hidden="true" />
              )}
            </button>

            <nav className="adm-crumbs" aria-label="Sayfa konumu">
              <span>Yönetim</span>
              {section && section.id !== "overview" && (
                <>
                  <ChevronRight
                    className="adm-crumbs__sep"
                    size={13}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <span className="adm-crumbs__section">{section.label}</span>
                  <ChevronRight
                    className="adm-crumbs__sep"
                    size={13}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </>
              )}
              <span className="adm-crumbs__page">{pageLabel}</span>
            </nav>
          </div>

          <div className="adm-topbar__right">
            {live.permission === "default" && (
              <button
                type="button"
                className="adm-topbar__site adm-notification-enable"
                onClick={() => void live.enableBrowserNotifications()}
                title="Yeni firma bildirimlerine izin ver"
              >
                <Bell size={14} strokeWidth={2} aria-hidden="true" />
                <span>Bildirimleri aç</span>
              </button>
            )}
            <Link className="adm-topbar__site" to="/" title="Siteyi görüntüle">
              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
              <span>Siteyi gör</span>
            </Link>
          </div>
        </header>

        {live.notice && (
          <div className="adm-live-toast" role="status" aria-live="polite">
            <div className="adm-live-toast__text">
              <strong>{live.notice.kind === "lead" ? "Yeni firma adayı" : "Yeni firma kaydı"}</strong>
              <span>{live.notice.kind === "lead" ? `${live.notice.companyName} yönetici incelemesi bekliyor.` : `${live.notice.companyName} firma listesine eklendi.`}</span>
            </div>
            <Link className="btn btn--sm btn--primary" to={live.notice.kind === "lead" ? "/yonetim/firma-akisi" : "/yonetim/firmalar"} onClick={live.dismissNotice}>İncele</Link>
            <button className="adm-live-toast__close" type="button" onClick={live.dismissNotice} aria-label="Bildirimi kapat">×</button>
          </div>
        )}

        <main className="adm-content">
          {section && section.tabs.length > 0 && (
            <nav className="adm-tabs" aria-label={`${section.label} bölümleri`}>
              {section.tabs.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={({ isActive }) => `adm-tab ${isActive ? "is-active" : ""}`}
                >
                  {Icon && <Icon size={14} strokeWidth={1.9} aria-hidden="true" />}
                  {label}
                </NavLink>
              ))}
            </nav>
          )}

          <SyncBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function RoleGate({
  title,
  message,
  onLogin,
}: {
  title: string;
  message: string;
  onLogin: () => void;
}) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>{title}</h1>
        <p>{message}</p>
        <button className="btn btn--primary btn--block" onClick={onLogin}>
          Giriş sayfasına git
        </button>
      </div>
    </div>
  );
}

/** Panel sayfaları ortak üst bölüm */
export function PanelHead({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-pagehead">
      <div className="panel-pagehead__text">
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {action && <div className="panel-pagehead__actions">{action}</div>}
    </div>
  );
}
