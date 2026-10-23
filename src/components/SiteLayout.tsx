import { NavLink, Outlet, Link } from "react-router-dom";
import { MapPin, Search } from "lucide-react";
import { useAuth, useActor } from "../lib/auth";

export function SiteLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

/** Ortak marka işareti — üst menü ve alt bilgi aynı işareti kullanır. */
function BrandMark() {
  return (
    <span className="brand__mark" aria-hidden="true">
      <MapPin size={17} strokeWidth={2} />
    </span>
  );
}

function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="brand" to="/" aria-label="Firma Rehberi ana sayfa">
          <BrandMark />
          <span className="brand__name">Firma Rehberi</span>
        </Link>

        {/* Menüde yalnız iki bağlantı: kategoriler ana sayfada keşfedilir. */}
        <nav className="site-header__nav" aria-label="Ana menü">
          <NavLink className="site-header__link" to="/firmalar" end>
            Firmalar
          </NavLink>
          <NavLink className="site-header__link" to="/iletisim">
            İletişim
          </NavLink>
        </nav>

        <div className="site-header__side">
          <Link className="site-header__icon-btn" to="/firmalar" aria-label="Firma arama">
            <Search size={18} strokeWidth={1.9} aria-hidden="true" />
          </Link>
          <Link className="btn btn--secondary btn--sm site-header__auth" to="/giris">
            {user ? "Paneller" : "Giriş"}
          </Link>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <div className="brand brand--static">
            <BrandMark />
            <span className="brand__name">Firma Rehberi</span>
          </div>
          <p className="site-footer__about">
            Yerel işletmelerin internette bulunabilirliğini artıran firma rehberi. Afyonkarahisar'da
            başladık; şehir şehir büyüyoruz.
          </p>
        </div>
        <nav className="site-footer__col" aria-label="Keşfet">
          <div className="site-footer__title">Keşfet</div>
          <div className="site-footer__links">
            <Link to="/firmalar">Tüm firmalar</Link>
            <Link to="/sehir/afyonkarahisar">Afyonkarahisar</Link>
            <Link to="/hakkimizda">Hakkımızda</Link>
            <Link to="/iletisim">İletişim</Link>
          </div>
        </nav>
        <nav className="site-footer__col" aria-label="Kurumsal">
          <div className="site-footer__title">Kurumsal</div>
          <div className="site-footer__links">
            <Link to="/kvkk">KVKK Aydınlatma Metni</Link>
            <Link to="/kullanim-kosullari">Kullanım Koşulları</Link>
            <a href="/yonetim">Yönetim girişi</a>
          </div>
        </nav>
      </div>
      <div className="container site-footer__note">
        <span>© {new Date().getFullYear()} Firma Rehberi</span>
        <span>Afyonkarahisar firma rehberi</span>
      </div>
    </footer>
  );
}

/** Aktör bilgisini doğru türde paylaşmak için yardımcı (panellerde kullanılır) */
export function useSessionActor() {
  return useActor();
}
