import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import OverviewPage from "./pages/OverviewPage";
import CampaignsPage from "./pages/CampaignsPage";
import SearchTermsPage from "./pages/SearchTermsPage";
import ProductsPage from "./pages/ProductsPage";
import NegativesPage from "./pages/NegativesPage";
import OpportunitiesPage from "./pages/OpportunitiesPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import DashboardLayout from "./layouts/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login"           element={<Login />} />
      <Route path="/signup"          element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />

      <Route path="/dashboard" element={
        <ProtectedRoute><DashboardLayout /></ProtectedRoute>
      }>
        <Route index               element={<OverviewPage />} />
        <Route path="campaigns"     element={<CampaignsPage />} />
        <Route path="search-terms"  element={<SearchTermsPage />} />
        <Route path="products"      element={<ProductsPage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="negatives"     element={<NegativesPage />} />
        <Route path="settings"      element={<PlaceholderPage title="Settings" description="Configure your product profile: include/exclude keywords, competitor brands, target ACoS." />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
