import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FileText,
  Home,
  LogOut,
  MapPin,
  PlusCircle,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { SyncBanner } from "../components/SyncBanner";
import "./rep.css";

/**
 * Temsilci paneli kabuğu.
 *
 * Mobil öncelikli: küçük ekranda üst çubuk + alt sekme çubuğu, masaüstünde
 * sol sabit menü. Menü yalnızca dört saha işine ayrılmıştır; yönetici
 * menüsünün küçültülmüş kopyası değildir.
 */
const NAV: Array<{ to: string; icon: LucideIcon; label: string; match: (path: string) => boolean }> = [
  { to: "/temsilci", icon: Home, label: "Ana Sayfa", match: (p) => p === "/temsilci" || p === "/temsilci/" },
  { to: "/temsilci/yeni", icon: PlusCircle, label: "Yeni Firma", match: (p) => p.startsWith("/temsilci/yeni") },
  {
    to: "/temsilci/taslaklar",
    icon: FileText,
    label: "Taslaklar",
    match: (p) => p.startsWith("/temsilci/taslak"),
  },
  {
    to: "/temsilci/satislarim",
    icon: Receipt,
    label: "Satışlarım",
    match: (p) => p.startsWith("/temsilci/satislarim"),
  },
];

export function RepLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!user) {
    return (
      <div className="rep-shell">
        <div className="rep-main" style={{ maxWidth: 460 }}>
          <div className="rep-card" style={{ marginTop: 40 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>Satış temsilcisi girişi</h1>
            <p style={{ color: "var(--rep-muted)", fontSize: 14, lineHeight: 1.5 }}>
              Devam etmek için giriş yapın.
            </p>
            <button className="rep-btn rep-btn--primary rep-btn--block" onClick={() => navigate("/giris")}>
              Giriş sayfasına git
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user.role !== "temsilci") {
    return (
      <div className="rep-shell">
        <div className="rep-main" style={{ maxWidth: 460 }}>
          <div className="rep-card" style={{ marginTop: 40 }}>
            <h1 style={{ margin: 0, fontSize: 20 }}>Yalnızca satış temsilcilerine açık</h1>
            <p style={{ color: "var(--rep-muted)", fontSize: 14, lineHeight: 1.5 }}>
              Bu alan satış temsilcisi hesapları içindir.
            </p>
            <a className="rep-btn rep-btn--primary rep-btn--block" href="/yonetim">
              Yönetim paneline git
            </a>
          </div>
        </div>
      </div>
    );
  }

  const active = NAV.find((item) => item.match(pathname));
  const initial = (user.name || "T").slice(0, 1).toUpperCase();

  return (
    <div className="rep-shell">
      <aside className="rep-side" aria-label="Temsilci menüsü">
        <Link className="rep-brand" to="/temsilci">
          <span className="rep-brand__mark" aria-hidden="true">
            <MapPin size={18} strokeWidth={2.2} />
          </span>
          <span className="rep-brand__text">
            <strong>Firma Rehberi</strong>
            <span>Temsilci paneli</span>
          </span>
        </Link>

        <nav className="rep-nav">
          {NAV.map(({ to, icon: Icon, label, match }) => (
            <NavLink
              key={to}
              to={to}
              className={`rep-navlink ${match(pathname) ? "is-active" : ""}`}
            >
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="rep-side__foot">
          <div className="rep-who">
            <span className="rep-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="rep-who__text">
              <strong>{user.name}</strong>
              <span>Satış temsilcisi</span>
            </span>
          </div>
          <button
            type="button"
            className="rep-btn rep-btn--ghost rep-btn--sm rep-btn--block"
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
          >
            <LogOut size={15} strokeWidth={2} aria-hidden="true" />
            Çıkış yap
          </button>
        </div>
      </aside>

      <div className="rep-body">
        <header className="rep-topbar">
          <Link className="rep-topbar__brand" to="/temsilci">
            <span className="rep-topbar__mark" aria-hidden="true">
              <MapPin size={16} strokeWidth={2.2} />
            </span>
            <span className="rep-topbar__title">
              <strong>{active?.label ?? "Panel"}</strong>
              <span>Firma Rehberi · Temsilci</span>
            </span>
          </Link>
          <div className="rep-topbar__actions">
            <button
              type="button"
              className="rep-iconbtn"
              aria-label="Çıkış yap"
              onClick={() => {
                logout();
                navigate("/", { replace: true });
              }}
            >
              <LogOut size={18} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="rep-main">
          <SyncBanner />
          <Outlet />
        </main>

        <nav className="rep-tabbar" aria-label="Alt menü">
          {NAV.map(({ to, icon: Icon, label, match }) => (
            <Link
              key={to}
              to={to}
              className={`rep-tab ${match(pathname) ? "is-active" : ""}`}
              aria-current={match(pathname) ? "page" : undefined}
            >
              <Icon size={21} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
