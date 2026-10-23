import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  ChartLine,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Download,
  ExternalLink,
  FolderTree,
  LayoutDashboard,
  type LucideIcon,
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
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { RoleError } from "../App";
import { listCompanies } from "../lib/repo";
import { SyncBanner } from "../components/SyncBanner";

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/** Yönetim menüsü — beş işlevsel grup (spec: Genel Bakış → Analiz ve Sistem). */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Genel Bakış",
    items: [{ to: "/yonetim", icon: LayoutDashboard, label: "Genel durum" }],
  },
  {
    id: "companies",
    label: "Firma Yönetimi",
    items: [
      { to: "/yonetim/firmalar", icon: Store, label: "Firma kayıtları" },
      { to: "/yonetim/adaylar", icon: Target, label: "Firma adayları" },
      { to: "/yonetim/ice-aktar", icon: Download, label: "İçe aktarma" },
      { to: "/yonetim/kategoriler", icon: FolderTree, label: "Kategoriler" },
      { to: "/yonetim/sehirler", icon: Map, label: "Şehir ve ilçeler" },
    ],
  },
  {
    id: "team",
    label: "Satış Ekibi",
    items: [
      { to: "/yonetim/temsilciler", icon: Users, label: "Satış temsilcileri" },
      { to: "/yonetim/referanslar", icon: Ticket, label: "Referans kayıtları" },
    ],
  },
  {
    id: "commerce",
    label: "Ticari İşlemler",
    items: [
      { to: "/yonetim/satislar", icon: Wallet, label: "Satış kayıtları" },
      { to: "/yonetim/uyelikler", icon: BadgeCheck, label: "Üyelikler" },
      { to: "/yonetim/odemeler", icon: CreditCard, label: "Ödeme kayıtları" },
      { to: "/yonetim/komisyonlar", icon: Receipt, label: "Komisyon hesapları" },
    ],
  },
  {
    id: "system",
    label: "Analiz ve Sistem",
    items: [
      { to: "/yonetim/raporlar", icon: ChartLine, label: "Raporlar" },
      { to: "/yonetim/denetim", icon: ClipboardList, label: "İşlem geçmişi" },
      { to: "/yonetim/ayarlar", icon: Settings2, label: "Ayarlar" },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

/** Aktif sayfa etiketi — en uzun eşleşen yol kazanır (/yonetim/firmalar > /yonetim). */
function currentItem(pathname: string): NavItem | undefined {
  return [...ALL_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

/** İçinde aktif sayfa bulunan grup — açılışta açık gelir. */
function activeGroupId(pathname: string): string | undefined {
  const item = currentItem(pathname);
  if (!item) return undefined;
  return NAV_GROUPS.find((group) => group.items.some((i) => i.to === item.to))?.id;
}

const RAIL_KEY = "ff.admin.sidebarRail";

export function AdminLayout() {
  const { user, logout } = useAuth();
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
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => {
    // Yalnızca aktif olmayan gruplar kapalı başlar; kullanıcı tercihi oturum içinde korunur.
    const active = activeGroupId(pathname);
    return new Set(NAV_GROUPS.filter((g) => g.id !== active && g.id !== "overview").map((g) => g.id));
  });

  // Rota değişince mobil çekmece kapanır.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  // Çekmece/ray tercihini kalıcılaştır (yalnızca UI tercihi; veri değil).
  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, rail ? "1" : "0");
    } catch {
      /* gizli mod — tercih saklanamaz, sorun değil */
    }
  }, [rail]);

  const publishedCount = useMemo(() => listCompanies().length, []);

  // Yetki koruması — yalnızca admin rolü. (Sunucu tarafı asıl sınır: RLS.)
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

  const active = currentItem(pathname);

  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`panel-shell ${rail ? "is-rail" : ""} ${drawer ? "is-drawer-open" : ""}`}>
      <button
        type="button"
        className="panel-backdrop"
        aria-label="Menüyü kapat"
        tabIndex={drawer ? 0 : -1}
        onClick={() => setDrawer(false)}
      />

      <aside className="panel-sidebar" aria-label="Yönetim menüsü">
        <div className="panel-sidebar__brandrow">
          <Link className="panel-sidebar__brand" to="/yonetim">
            <span className="panel-sidebar__mark" aria-hidden="true">
              <MapPin size={16} strokeWidth={2.1} />
            </span>
            <span className="panel-sidebar__brandtext">
              <span className="panel-sidebar__title">Firma Rehberi</span>
              <span className="panel-sidebar__subtitle">Yönetim paneli</span>
            </span>
          </Link>
          <button
            type="button"
            className="panel-iconbtn panel-sidebar__close"
            aria-label="Menüyü kapat"
            onClick={() => setDrawer(false)}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="panel-sidebar__scroll">
          <nav>
            {NAV_GROUPS.map((group) => {
              const isClosed = closedGroups.has(group.id);
              const groupActive = group.items.some((i) => i.to === active?.to);
              return (
                <div className="panel-sidebar__groupblock" key={group.id}>
                  <button
                    type="button"
                    className={`panel-sidebar__grouptoggle ${groupActive ? "has-active" : ""}`}
                    aria-expanded={!isClosed}
                    onClick={() => toggleGroup(group.id)}
                    title={group.label}
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      size={14}
                      strokeWidth={2.1}
                      aria-hidden="true"
                      className={isClosed ? "is-closed" : ""}
                    />
                  </button>
                  {(!isClosed || rail) && (
                    <div className="panel-sidebar__groupitems">
                      {group.items.map(({ to, icon: Icon, label }) => (
                        <NavLink
                          key={to}
                          to={to}
                          end={to === "/yonetim"}
                          title={label}
                          className={({ isActive }) =>
                            `panel-sidebar__link ${isActive ? "is-active" : ""}`
                          }
                        >
                          <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                          <span className="panel-sidebar__label">{label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="panel-sidebar__foot">
          <div className="panel-sidebar__user">
            <span className="panel-sidebar__avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="panel-sidebar__usertext">
              <div className="panel-sidebar__name">{user.name}</div>
              <div className="panel-sidebar__role">
                Yönetici · {publishedCount} firma kayıtlı
              </div>
            </div>
          </div>
          <button
            className="btn btn--sm btn--block panel-sidebar__logout"
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
          >
            Çıkış yap
          </button>
        </div>
      </aside>

      <div className="panel-main">
        <header className="panel-topbar">
          <div className="panel-topbar__left">
            <button
              type="button"
              className="panel-iconbtn panel-topbar__menu"
              aria-label="Menüyü aç"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={19} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="panel-iconbtn panel-topbar__rail"
              aria-label={rail ? "Menüyü genişlet" : "Menüyü daralt"}
              aria-pressed={rail}
              onClick={() => setRail((r) => !r)}
            >
              {rail ? (
                <PanelLeftOpen size={18} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <PanelLeftClose size={18} strokeWidth={1.9} aria-hidden="true" />
              )}
            </button>
            <div className="panel-topbar__title">
              <span className="panel-topbar__eyebrow">Yönetim</span>
              <span className="panel-topbar__current">{active?.label ?? "Panel"}</span>
            </div>
          </div>
          <Link className="btn btn--ghost btn--sm panel-topbar__site" to="/">
            <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
            Siteyi gör
          </Link>
        </header>
        <SyncBanner />
        <Outlet />
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
