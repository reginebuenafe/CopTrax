import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import OwnerOverview from "../src/pages/owner/OwnerOverview";
import BOContractsPage from "../src/pages/owner/BOContractsPage";
import "../src/index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><BrowserRouter>
    <nav className="flex gap-4 px-4 pt-2">
      <Link to="/dashboard/owner">Overview</Link>
      <Link to="/dashboard/owner/contracts">Contracts</Link>
    </nav>
    <main className="min-w-0 max-w-7xl mx-auto px-4 pb-6">
      <Routes>
        <Route path="/dashboard/owner" element={<OwnerOverview />} />
        <Route path="/dashboard/owner/contracts" element={<BOContractsPage />} />
        <Route path="/dashboard/owner/users" element={<p>User Management</p>} />
        <Route path="/dashboard/owner/payments" element={<p>Payment Batches</p>} />
      </Routes>
    </main>
  </BrowserRouter></React.StrictMode>,
);
