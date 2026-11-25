import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ChartLine,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FolderTree,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  LogOut,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings2,
  Users,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { RoleError } from "../App";
import { SyncBanner } from "../components/SyncBanner";
import { useAdminLiveUpdates } from "./useAdminLiveUpdates";
import { useMediaQuery } from "../lib/useMediaQuery";
import "./admin.css";

interface SectionTab {
  to: string;
  label: string;
}

interface NavSection {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Bu bölüme bağlı tüm yollar (aktiflik ve kırıntı için). */
  paths: string[];
  /** Bölümün alt sayfaları — boşsa bölüm tek bağlantıdır. */
  children: SectionTab[];
}

/**
 * Yönetim bilgi mimarisi — sekiz ana bölüm.
 * Alt sayfalar yeni rota uydurmadan, mevcut rotalar korunarak bağlanır.
 */
const MAIN_SECTIONS: NavSection[] = [
  {
    id: "today",
    label: "İşlem Merkezi",
    to: "/yonetim",
    icon: LayoutDashboard,
    paths: ["/yonetim"],
    children: [],
  },
  {
    id: "company-line",
    label: "Firma Detayları",
    to: "/yonetim/adaylar",
    icon: Workflow,
    paths: ["/yonetim/adaylar", "/yonetim/firmalar"],
    children: [
      { to: "/yonetim/adaylar", label: "Adaylar" },
      { to: "/yonetim/firmalar", label: "Firmalar" },
    ],
  },
  {
    id: "sales",
    label: "Satış ve Tahsilat",
    to: "/yonetim/satislar",
    icon: Wallet,
    paths: ["/yonetim/satislar"],
    children: [],
  },
  {
    id: "misc",
    label: "Çeşitli",
    to: "/yonetim/firma-akisi",
    icon: LayoutGrid,
    paths: [
      "/yonetim/firma-akisi",
      "/yonetim/ice-aktar",
      "/yonetim/odemeler",
      "/yonetim/uyelikler",
    ],
    children: [
      { to: "/yonetim/firma-akisi", label: "Firma Hattı" },
      { to: "/yonetim/ice-aktar", label: "İçe Aktarma" },
      { to: "/yonetim/odemeler", label: "Ödeme Kayıtları" },
      { to: "/yonetim/uyelikler", label: "Üyelik Yenileme" },
    ],
  },
  {
    id: "commissions",
    label: "Hakediş",
    to: "/yonetim/komisyonlar",
    icon: Receipt,
    paths: ["/yonetim/komisyonlar"],
    children: [],
  },
  {
    id: "staff",
    label: "Personel",
    to: "/yonetim/temsilciler",
    icon: Users,
    paths: [
      "/yonetim/temsilciler",
      "/yonetim/ekipler",
      "/yonetim/basvurular",
      "/yonetim/referanslar",
    ],
    children: [
      { to: "/yonetim/ekipler", label: "Ekipler" },
      { to: "/yonetim/basvurular", label: "Başvurular" },
      { to: "/yonetim/referanslar", label: "Referanslar" },
    ],
  },
  {
    id: "showcase",
    label: "Kategoriler",
    to: "/yonetim/kategoriler",
    icon: FolderTree,
    paths: ["/yonetim/kategoriler", "/yonetim/sehirler"],
    children: [
      { to: "/yonetim/sehirler", label: "Şehir ve İlçeler" },
    ],
  },
  {
    id: "analysis",
    label: "Analiz",
    to: "/yonetim/raporlar",
    icon: ChartLine,
    paths: ["/yonetim/raporlar", "/yonetim/etkilesimler"],
    children: [
      { to: "/yonetim/etkilesimler", label: "Ziyaret ve Etkileşimler" },
    ],
  },
];

/** Ana menünün altında, ince ayırıcıyla ayrılan sistem bölümleri. */
const SYSTEM_SECTIONS: NavSection[] = [
  {
    id: "settings",
    label: "Ayarlar",
    to: "/yonetim/ayarlar",
    icon: Settings2,
    paths: ["/yonetim/ayarlar"],
    children: [],
  },
  {
    id: "audit",
    label: "İşlem Geçmişi",
    to: "/yonetim/denetim",
    icon: ClipboardList,
    paths: ["/yonetim/denetim"],
    children: [],
  },
];

const ALL_SECTIONS: NavSection[] = [...MAIN_SECTIONS, ...SYSTEM_SECTIONS];

const RAIL_KEY = "ff.admin.sidebarRail";

function matchesPath(pathname: string, path: string): boolean {
  if (path === "/yonetim") return pathname === "/yonetim";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Aktif bölüm — en uzun yol eşleşmesi kazanır. */
function activeSection(pathname: string): NavSection | undefined {
  let best: NavSection | undefined;
  let bestLength = -1;
  for (const section of ALL_SECTIONS) {
    for (const path of section.paths) {
      if (matchesPath(pathname, path) && path.length > bestLength) {
        best = section;
        bestLength = path.length;
      }
    }
  }
  return best;
}

/** Aktif alt sayfa — varsayılan sayfayla aynıysa ayrıca gösterilmez. */
function activeTab(
  section: NavSection | undefined,
  pathname: string,
): SectionTab | undefined {
  if (!section) return undefined;
  return [...section.children]
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
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Mobil çekmece yalnız ≤960px'de bir modal gibi davranır. Kapalıyken
  // `inert` ile odak sırasından ve erişilebilirlik ağacından çıkarılır.
  const isMobile = useMediaQuery("(max-width: 960px)");
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const drawerWasOpen = useRef(false);

  const section = activeSection(pathname);
  const tab = activeTab(section, pathname);
  const subPage = section && tab && tab.to !== section.to ? tab : undefined;

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

  // Çekmece açılışında odak menüye taşınır, Tab menü içinde döner ve
  // kapanışta odak çekmeceyi açan düğmeye geri döner.
  useEffect(() => {
    if (!drawer) {
      if (drawerWasOpen.current) {
        drawerWasOpen.current = false;
        const opener = openerRef.current;
        if (opener?.isConnected) opener.focus();
      }
      return;
    }

    drawerWasOpen.current = true;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const sidebar = sidebarRef.current;
      if (!sidebar) return;
      const focusables = [
        ...sidebar.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && sidebar.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
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

  // Akordeon: aynı anda yalnızca BİR bölüm açık kalır. Rota değiştiğinde
  // aktif bölüm açılır, öncekiler kapanır. Böylece menü, ziyaret geçmişine
  // göre birikip eski uzun bağlantı listesine dönüşmez.
  useEffect(() => {
    setOpenGroup(section?.id ?? null);
  }, [section?.id]);

  const toggleGroup = (id: string) => {
    setOpenGroup((current) => (current === id ? null : id));
  };

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

  const renderSection = (item: NavSection) => {
    const Icon = item.icon;
    const isActive = section?.id === item.id;
    const hasChildren = item.children.length > 0;
    const isOpen = hasChildren && openGroup === item.id;
    return (
      <li
        key={item.id}
        className={`adm-navgroup ${isActive ? "is-active" : ""} ${isOpen ? "is-open" : ""}`}
      >
        <div className="adm-navgroup__row">
          <Link
            to={item.to}
            title={item.label}
            className="adm-navlink"
            aria-current={pathname === item.to ? "page" : undefined}
            onClick={() => setDrawer(false)}
          >
            <Icon size={18} strokeWidth={1.85} aria-hidden="true" />
            <span className="adm-navlink__label">{item.label}</span>
          </Link>
          {hasChildren && (
            <button
              type="button"
              className="adm-navgroup__toggle"
              aria-expanded={isOpen}
              aria-controls={`adm-nav-${item.id}`}
              aria-label={
                isOpen
                  ? `${item.label} alt sayfalarını kapat`
                  : `${item.label} alt sayfalarını aç`
              }
              title={isOpen ? "Alt sayfaları kapat" : "Alt sayfaları aç"}
              onClick={() => toggleGroup(item.id)}
            >
              <ChevronDown size={15} strokeWidth={2.1} aria-hidden="true" />
            </button>
          )}
        </div>
        {hasChildren && (
          <div
            id={`adm-nav-${item.id}`}
            className="adm-navgroup__panel"
            inert={!isOpen}
          >
            <ul className="adm-navgroup__children">
              {item.children.map((child) => {
                const childActive = matchesPath(pathname, child.to);
                return (
                  <li key={child.to}>
                    <Link
                      to={child.to}
                      className={`adm-navlink adm-navlink--sub ${childActive ? "is-active" : ""}`}
                      aria-current={childActive ? "page" : undefined}
                      onClick={() => setDrawer(false)}
                    >
                      <span className="adm-navlink__label">{child.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </li>
    );
  };

  return (
    <div
      className={`adm-shell ${rail ? "is-rail" : ""} ${drawer ? "is-drawer-open" : ""}`}
    >
      <button
        type="button"
        className="adm-backdrop"
        aria-label="Menüyü kapat"
        aria-hidden={!drawer}
        tabIndex={drawer ? 0 : -1}
        onClick={() => setDrawer(false)}
      />

      <aside
        ref={sidebarRef}
        id="adm-sidebar"
        className="adm-sidebar"
        aria-label="Yönetim menüsü"
        inert={isMobile && !drawer}
      >
        <div className="adm-brandrow">
          <Link className="adm-brand" to="/yonetim">
            <span className="adm-brand__mark" aria-hidden="true">
              <MapPin size={17} strokeWidth={2.1} />
            </span>
            <span className="adm-brand__text">
              <span className="adm-brand__title">RehberiX</span>
              <span className="adm-brand__sub">Yönetim paneli</span>
            </span>
          </Link>
          <button
            ref={closeButtonRef}
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
          <ul className="adm-nav">{MAIN_SECTIONS.map(renderSection)}</ul>

          <div className="adm-nav__divider" aria-hidden="true" />
          <div className="adm-navlabel">Sistem</div>
          <ul className="adm-nav">{SYSTEM_SECTIONS.map(renderSection)}</ul>
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
              ref={menuButtonRef}
              type="button"
              className="adm-iconbtn adm-topbar__menu"
              aria-label="Menüyü aç"
              aria-expanded={drawer}
              aria-controls="adm-sidebar"
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
              {section && (
                <>
                  <ChevronRight
                    className="adm-crumbs__sep"
                    size={13}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <span
                    className={
                      subPage ? "adm-crumbs__section" : "adm-crumbs__page"
                    }
                  >
                    {section.label}
                  </span>
                </>
              )}
              {subPage && (
                <>
                  <ChevronRight
                    className="adm-crumbs__sep"
                    size={13}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                  <span className="adm-crumbs__page" aria-current="page">
                    {subPage.label}
                  </span>
                </>
              )}
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
