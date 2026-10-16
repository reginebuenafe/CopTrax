import React from "react";
import { createRoot } from "react-dom/client";
import SupplierPaymentsPage from "../src/pages/supplier/SupplierPaymentsPage";
import "../src/index.css";

createRoot(document.getElementById("root")).render(
  <main className="max-w-5xl mx-auto px-4 pb-6"><SupplierPaymentsPage /></main>,
);
