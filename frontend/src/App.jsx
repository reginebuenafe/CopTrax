import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";

import Navbar from "./Navbar";
import Footer from "./Footer";
import HomePage from "./HomePage";
import WhatIsCopra from "./WhatIsCopra";
import WhySellToUs from "./WhySellToUs";
import Gallery from "./Gallery";
import Contact from "./Contact";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import PendingApprovalPage from "./pages/auth/PendingApprovalPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import ProtectedRoute from "./components/ProtectedRoute";

import OwnerLayout from "./pages/owner/OwnerLayout";
import OwnerOverview from "./pages/owner/OwnerOverview";
import UserApprovalsPage from "./pages/owner/UserApprovalsPage";
import BOConversationsPage from "./pages/owner/BOConversationsPage";
import BOChatLayout from "./pages/owner/BOChatLayout";
import BOContractsPage from "./pages/owner/BOContractsPage";
import BODeliveriesPage from "./pages/owner/BODeliveriesPage";
import BOQualityPage from "./pages/owner/BOQualityPage";
import PaymentsPage from "./pages/owner/PaymentsPage";
import InventoryPage from "./pages/owner/InventoryPage";
import SupplierRatingsPage from "./pages/owner/SupplierRatingsPage";
import BOReportsPage from "./pages/owner/BOReportsPage";
import AccountSettingsPage from "./pages/shared/AccountSettingsPage";

import SupplierLayout from "./pages/supplier/SupplierLayout";
import SupplierChatLayout from "./pages/supplier/SupplierChatLayout";
import MyRatingPage from "./pages/supplier/MyRatingPage";
import SupplierOverview from "./pages/supplier/SupplierOverview";
import MyContractsPage from "./pages/supplier/MyContractsPage";
import SupplierDeliveriesPage from "./pages/supplier/SupplierDeliveriesPage";
import SupplierPaymentsPage from "./pages/supplier/SupplierPaymentsPage";

import WeigherLayout from "./pages/weigher/WeigherLayout";
import DeliveryChoicePage from "./pages/weigher/DeliveryChoicePage";
import WalkinDeliveryForm from "./pages/weigher/WalkinDeliveryForm";
import ContractualDeliveryForm from "./pages/weigher/ContractualDeliveryForm";
import WeigherHistoryPage from "./pages/weigher/WeigherHistoryPage";

import LabLayout from "./pages/lab/LabLayout";
import InspectionQueuePage from "./pages/lab/InspectionQueuePage";
import LabHistoryPage from "./pages/lab/LabHistoryPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function ComingSoon({ label }) {
  return (
    <div className="bg-white rounded-2xl shadow-card border border-beige-dark/20 p-10 text-center">
      <p className="text-xl font-bold text-brown-dark mb-2">{label}</p>
      <p className="text-brown-light text-sm">Coming soon…</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* Public landing pages */}
        <Route path="/" element={<><Navbar /><main className="min-h-screen"><HomePage /></main><Footer /></>} />
        <Route path="/what-is-copra" element={<><Navbar /><main className="min-h-screen"><WhatIsCopra /></main><Footer /></>} />
        <Route path="/why-sell-to-us" element={<><Navbar /><main className="min-h-screen"><WhySellToUs /></main><Footer /></>} />
        <Route path="/gallery" element={<><Navbar /><main className="min-h-screen"><Gallery /></main><Footer /></>} />
        <Route path="/contact" element={<><Navbar /><main className="min-h-screen"><Contact /></main><Footer /></>} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Business Owner dashboard */}
        <Route path="/dashboard/owner" element={
          <ProtectedRoute allowedRoles={["Business Owner"]}><OwnerLayout /></ProtectedRoute>
        }>
          <Route index element={<OwnerOverview />} />
          <Route path="users" element={<UserApprovalsPage />} />
          <Route path="conversations" element={<BOChatLayout />} />
          <Route path="conversations/:conversationId" element={<BOChatLayout />} />
          <Route path="contracts" element={<BOContractsPage />} />
          <Route path="deliveries" element={<BODeliveriesPage />} />
          <Route path="quality" element={<BOQualityPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="suppliers" element={<SupplierRatingsPage />} />
          <Route path="reports" element={<BOReportsPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>

        {/* Supplier dashboard */}
        <Route path="/dashboard/supplier" element={
          <ProtectedRoute allowedRoles={["Supplier"]}><SupplierLayout /></ProtectedRoute>
        }>
          <Route index element={<SupplierOverview />} />
          <Route path="conversations" element={<SupplierChatLayout />} />
          <Route path="conversations/:conversationId" element={<SupplierChatLayout />} />
          <Route path="contracts" element={<MyContractsPage />} />
          <Route path="deliveries" element={<SupplierDeliveriesPage />} />
          <Route path="payments" element={<SupplierPaymentsPage />} />
          <Route path="rating" element={<MyRatingPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>

        {/* Weigher dashboard */}
        <Route path="/dashboard/weigher" element={
          <ProtectedRoute allowedRoles={["Weigher"]}><WeigherLayout /></ProtectedRoute>
        }>
          <Route index element={<DeliveryChoicePage />} />
          <Route path="walkin" element={<WalkinDeliveryForm />} />
          <Route path="contractual" element={<ContractualDeliveryForm />} />
          <Route path="history" element={<WeigherHistoryPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>
        <Route path="/dashboard/lab" element={
          <ProtectedRoute allowedRoles={["Laboratory Staff"]}><LabLayout /></ProtectedRoute>
        }>
          <Route index element={<InspectionQueuePage />} />
          <Route path="history" element={<LabHistoryPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>

        <Route path="/unauthorized" element={
          <div className="min-h-screen bg-cream flex items-center justify-center">
            <p className="text-brown-dark font-semibold">You don't have access to this page.</p>
          </div>
        } />
        <Route path="*" element={
          <div className="min-h-screen bg-cream flex items-center justify-center">
            <p className="text-brown-dark font-semibold">Page not found.</p>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;