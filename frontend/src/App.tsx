import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import OverviewPage from "./pages/OverviewPage";
import CampaignsPage from "./pages/CampaignsPage";
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
        <Route path="search-terms"  element={<PlaceholderPage title="Search Terms" description="Analyze customer search queries with bucket categorization (Winners, Wasted, Review) and negativity scoring." />} />
        <Route path="products"      element={<PlaceholderPage title="Products" description="Track performance per ASIN. See which products are converting and which are burning budget." />} />
        <Route path="opportunities" element={<PlaceholderPage title="Opportunities" description="AI-powered suggestions: harvest high-performing search terms, add negatives for wasteful ones, upgrade match types." />} />
        <Route path="negatives"     element={<PlaceholderPage title="Negatives" description="View and manage all negative keywords. See historical waste for each one." />} />
        <Route path="settings"      element={<PlaceholderPage title="Settings" description="Configure your product profile: include/exclude keywords, competitor brands, target ACoS." />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
