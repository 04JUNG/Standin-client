import { initializeAppSession } from "./shared/lib/appSession";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { Providers } from "./app/providers";
import "./app/styles/index.css";

void initializeAppSession()
  .catch(() => {})
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <Providers>
          <App />
        </Providers>
      </React.StrictMode>,
    );
  });
