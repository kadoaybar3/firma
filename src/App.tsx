import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { SiteLayout } from "./components/SiteLayout";
import { ErrorBanner } from "./components/ui";
import HomePage from "./pages/HomePage";
import FirmsPage from "./pages/FirmsPage";
import FirmDetailPage from "./pages/FirmDetailPage";
import { ContactPage, HakkindaPage, KvkkPage, NotFoundPage, TermsPage, LoginPage } from "./pages/StaticPages";
import { AdminLayout } from "./admin/AdminLayout";
import AdminDashboard from "./admin/Dashboard";
import AdminCompanies from "./admin/Companies";
import AdminCategories from "./admin/Categories";
import AdminCities from "./admin/Cities";
import AdminReps from "./admin/Reps";
import AdminLeads from "./admin/Leads";
import AdminSales from "./admin/Sales";
import AdminPayments from "./admin/Payments";
import AdminMemberships from "./admin/Memberships";
import AdminCommissions from "./admin/Commissions";
import AdminReferrals from "./admin/Referrals";
import AdminReports from "./admin/Reports";
import AdminSettings from "./admin/Settings";
import AdminAudit from "./admin/Audit";
import { RepLayout } from "./rep/RepLayout";
import RepDashboard from "./rep/Dashboard";
import RepLeads from "./rep/Leads";
import RepSales from "./rep/Sales";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ===== Halke açık site ===== */}
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            <Route path="firmalar" element={<FirmsPage />} />
            <Route path="firma/:slug" element={<FirmDetailPage />} />
            <Route path="kategori/:catSlug" element={<FirmsPage />} />
            <Route path="sehir/:citySlug" element={<FirmsPage />} />
            <Route path="sehir/:citySlug/:district" element={<FirmsPage />} />
            <Route path="iletisim" element={<ContactPage />} />
            <Route path="hakkimizda" element={<HakkindaPage />} />
            <Route path="kvkk" element={<KvkkPage />} />
            <Route path="kullanim-kosullari" element={<TermsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* ===== Ortak giriş ===== */}
          <Route path="giris" element={<LoginPage />} />

          {/* ===== Yönetim paneli (yalnızca admin rolü) ===== */}
          <Route path="yonetim" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="firmalar" element={<AdminCompanies />} />
            <Route path="kategoriler" element={<AdminCategories />} />
            <Route path="sehirler" element={<AdminCities />} />
            <Route path="temsilciler" element={<AdminReps />} />
            <Route path="adaylar" element={<AdminLeads />} />
            <Route path="satislar" element={<AdminSales />} />
            <Route path="odemeler" element={<AdminPayments />} />
            <Route path="uyelikler" element={<AdminMemberships />} />
            <Route path="komisyonlar" element={<AdminCommissions />} />
            <Route path="referanslar" element={<AdminReferrals />} />
            <Route path="raporlar" element={<AdminReports />} />
            <Route path="ayarlar" element={<AdminSettings />} />
            <Route path="denetim" element={<AdminAudit />} />
          </Route>

          {/* ===== Satış temsilcisi paneli (yalnızca temsilci rolü) ===== */}
          <Route path="temsilci" element={<RepLayout />}>
            <Route index element={<RepDashboard />} />
            <Route path="adaylar" element={<RepLeads />} />
            <Route path="satislar" element={<RepSales />} />
            <Route path="*" element={<Navigate to="/temsilci" replace />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

/** Yetki hatasında gösterilecek ortak görünüm */
export function RoleError({ expected }: { expected: string }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Erişim engellendi</h1>
        <p className="mb-14">Bu bölüm yalnızca <strong>{expected}</strong> rolüne açık.</p>
        <a className="btn btn--primary btn--block" href="/giris">
          Giriş sayfasına dön
        </a>
      </div>
    </div>
  );
}

export function AppError({ message }: { message: string }) {
  return (
    <div className="panel-content">
      <ErrorBanner message={message} />
    </div>
  );
}
