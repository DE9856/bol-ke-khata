import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PayPage from "./components/PayPage.jsx";
import { registerServiceWorker } from "./lib/install.js";
import "./index.css";

registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/+$/, "") === "/pay" ? <PayPage /> : <App />}
  </React.StrictMode>,
);
