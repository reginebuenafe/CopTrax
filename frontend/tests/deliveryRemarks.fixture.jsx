import React from "react";
import { createRoot } from "react-dom/client";
import SupplierDeliveriesPage from "../src/pages/supplier/SupplierDeliveriesPage";
import "../src/index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><main className="max-w-7xl mx-auto px-4 pb-6"><SupplierDeliveriesPage /></main></React.StrictMode>,
);
