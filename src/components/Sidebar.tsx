import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Globe,
  Smartphone,
  ArrowDownToLine,
  Settings2,
  Sun,
  Moon,
} from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { settingsService } from "@/services";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Dashboard", path: "/", icon: LayoutGrid },
  { name: "Sources", path: "/sources", icon: Globe },
  { name: "Devices", path: "/devices", icon: Smartphone },
  { name: "Downloads", path: "/downloads", icon: ArrowDownToLine },
  { name: "Settings", path: "/settings", icon: Settings2 },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const devices = useAppStore((s) => s.devices);
  const jobs = useAppStore((s) => s.jobs);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const onlineDevices = devices.filter((d) => d.status === "online").length;
  const activeJobs = jobs.filter((j) =>
    ["queued", "running", "paused"].includes(j.status),
  ).length;

  const badgeFor = (path: string): number | null => {
    if (path === "/devices" && onlineDevices > 0) return onlineDevices;
    if (path === "/downloads" && activeJobs > 0) return activeJobs;
    return null;
  };

  const toggleTheme = (): void => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    void settingsService.set("ui.theme", next).catch(() => undefined);
  };

  return (
    <aside className="w-60 bg-canvas border-r border-line flex flex-col h-full drag-region">
      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto no-drag">
        <div className="eyebrow px-2.5 mb-3">Bench</div>

        {navItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== "/" && location.pathname.startsWith(item.path));
          const badge = badgeFor(item.path);

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-lg text-sm",
                "transition-colors duration-150",
                isActive
                  ? "text-ink bg-inset"
                  : "text-ink-2 hover:text-ink hover:bg-inset/60",
              )}
            >
              {/* The active marker is a signal tick, not a filled pill. */}
              <span
                className={cn(
                  "w-0.5 h-4 rounded-full transition-colors duration-150",
                  isActive ? "bg-signal" : "bg-transparent",
                )}
              />
              <item.icon
                className={cn("w-4 h-4 shrink-0", isActive && "text-signal")}
              />
              <span className="flex-1 text-left font-medium">{item.name}</span>
              {badge !== null && (
                <span className="font-mono text-eyebrow text-ink-3 tabular-nums">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line no-drag">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-ink-2 hover:text-ink hover:bg-inset transition-colors duration-150"
          aria-label={
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          }
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 shrink-0" />
          ) : (
            <Moon className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1 text-left font-medium">
            {theme === "dark" ? "Light" : "Dark"}
          </span>
          <span className="font-mono text-eyebrow text-ink-3">
            {theme === "dark" ? "DK" : "LT"}
          </span>
        </button>
      </div>
    </aside>
  );
}
