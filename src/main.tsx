import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";
import { PwaStatus } from "./components/PwaStatus";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PwaStatus />
    <App />
  </React.StrictMode>,
);
