import { useEffect } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar } from "@/components/TitleBar";
import { Toasts } from "@/components/Toasts";
import { useEventBridge } from "@/hooks/useEventBridge";
import { useEnterAnimation } from "@/hooks/useEnterAnimation";
import { useAppStore } from "@/stores/appStore";
import { applyTheme, readStoredTheme } from "@/lib/theme";
import { settingsService } from "@/services";
import { HomePage } from "@/pages/HomePage";
import { SourcesPage } from "@/pages/SourcesPage";
import { AddSourceWizard } from "@/pages/AddSourceWizard";
import { DevicesPage } from "@/pages/DevicesPage";
import { DebloatPage } from "@/pages/DebloatPage";
import { DownloadsPage } from "@/pages/DownloadsPage";
import { SettingsPage } from "@/pages/SettingsPage";

function Shell() {
  const location = useLocation();
  // Re-runs the entrance timeline whenever the route changes.
  const scope = useEnterAnimation<HTMLElement>([location.pathname]);

  return (
    <main ref={scope} className="flex-1 overflow-y-auto">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/sources/add" element={<AddSourceWizard />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/debloat" element={<DebloatPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </main>
  );
}

export function App() {
  useEventBridge();
  const setTheme = useAppStore((s) => s.setTheme);

  useEffect(() => {
    // Paint from the local copy first, then reconcile with the stored setting
    // so the choice follows the app rather than the machine.
    const local = readStoredTheme();
    applyTheme(local);
    setTheme(local);

    void settingsService
      .get("ui.theme")
      .then((stored) => {
        if (stored === "light" || stored === "dark") {
          applyTheme(stored);
          setTheme(stored);
        }
      })
      .catch(() => undefined);
  }, [setTheme]);

  return (
    <HashRouter>
      <div className="flex flex-col h-screen overflow-hidden bg-canvas">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <Shell />
        </div>
        <Toasts />
      </div>
    </HashRouter>
  );
}
