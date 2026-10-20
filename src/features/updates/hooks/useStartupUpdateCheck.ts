import { useEffect } from "react";
import { useUpdateStore } from "../store/updateStore";

export function useStartupUpdateCheck() {
  useEffect(() => {
    const state = () => useUpdateStore.getState();
    void state().bootstrap();
    const periodic = () => {
      if (state().startupComplete && navigator.onLine) void state().check("periodic");
    };
    const online = () => {
      if (state().startupComplete) void state().check("reconnect");
    };
    const timer = window.setInterval(periodic, 15 * 60 * 1000);
    window.addEventListener("online", online);
    window.addEventListener("focus", periodic);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", periodic);
    };
  }, []);
}

export function resetStartupUpdateCheck() {
  useUpdateStore.getState().reset();
}
