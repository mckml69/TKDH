import React from "react";
import { createRoot } from "react-dom/client";
import { installStorageAdapter } from "./lib/storage";
import App from "./App";

installStorageAdapter();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
