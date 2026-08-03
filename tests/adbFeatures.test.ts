import { describe, it, expect } from "vitest";
import { parseAppPermissions, parsePerformance } from "@adb-engine/adbManager";
import { matchBloat, catalogSize } from "@adb-engine/bloatCatalog";

const DUMPSYS = `
Packages:
  Package [com.example.app] (abc123):
    userId=10234
    requested permissions:
      android.permission.CAMERA
      android.permission.INTERNET
      android.permission.WRITE_SECURE_SETTINGS
      android.permission.RECORD_AUDIO
    install permissions:
      android.permission.INTERNET: granted=true
    User 0:
      runtime permissions:
        android.permission.CAMERA: granted=true, flags=[ USER_SET ]
        android.permission.RECORD_AUDIO: granted=false, flags=[ ]
`;

describe("parseAppPermissions", () => {
  it("extracts runtime permissions with their granted state", () => {
    const perms = parseAppPermissions(DUMPSYS);
    const camera = perms.find((p) => p.permission.endsWith(".CAMERA"));
    const mic = perms.find((p) => p.permission.endsWith(".RECORD_AUDIO"));

    expect(camera?.granted).toBe(true);
    expect(camera?.special).toBe(false);
    expect(mic?.granted).toBe(false);
  });

  it("surfaces requested special permissions and sorts them first", () => {
    const perms = parseAppPermissions(DUMPSYS);
    const secure = perms.find((p) =>
      p.permission.endsWith(".WRITE_SECURE_SETTINGS"),
    );

    expect(secure).toBeDefined();
    expect(secure?.special).toBe(true);
    expect(perms[0].special).toBe(true);
  });

  it("ignores plain install permissions that cannot be toggled", () => {
    const perms = parseAppPermissions(DUMPSYS);
    expect(perms.some((p) => p.permission.endsWith(".INTERNET"))).toBe(false);
  });

  it("returns nothing for a package with no manageable permissions", () => {
    expect(parseAppPermissions("Package [x]:\n  userId=1\n")).toEqual([]);
  });
});

describe("matchBloat", () => {
  it("matches exact catalog entries with their risk", () => {
    const matches = matchBloat([
      "com.vivo.weather",
      "com.android.systemui",
      "com.miui.analytics",
    ]);

    const weather = matches.find((m) => m.packageName === "com.vivo.weather");
    const analytics = matches.find(
      (m) => m.packageName === "com.miui.analytics",
    );

    expect(weather?.risk).toBe("caution");
    expect(analytics?.risk).toBe("safe");
    expect(matches.some((m) => m.packageName === "com.android.systemui")).toBe(
      false,
    );
  });

  it("matches prefix entries such as the Facebook family", () => {
    const matches = matchBloat([
      "com.facebook.katana",
      "com.facebook.appmanager",
    ]);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.vendor === "Meta")).toBe(true);
  });

  it("exposes a non-empty catalog", () => {
    expect(catalogSize()).toBeGreaterThan(20);
  });
});

describe("parsePerformance", () => {
  it("computes memory usage from meminfo", () => {
    const meminfo = "MemTotal:        8000000 kB\nMemAvailable:    2000000 kB\n";
    const perf = parsePerformance(meminfo, "");
    expect(perf.memTotalMb).toBe(7813);
    expect(perf.memUsedPercent).toBe(75);
  });

  it("reads the total CPU line from dumpsys cpuinfo", () => {
    const cpuinfo = "Load: 1 / 2 / 3\n 12% TOTAL: 5% user + 6% kernel";
    expect(parsePerformance("", cpuinfo).cpuPercent).toBe(12);
  });

  it("returns nulls when the device gives nothing", () => {
    expect(parsePerformance("", "")).toEqual({
      cpuPercent: null,
      memUsedPercent: null,
      memTotalMb: null,
      memUsedMb: null,
    });
  });
});
