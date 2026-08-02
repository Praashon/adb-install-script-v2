export type BloatRisk = "safe" | "caution" | "expert";

export interface BloatEntry {
  id: string;
  label: string;
  vendor: string;
  risk: BloatRisk;
  description: string;
}

export interface BloatMatch extends BloatEntry {
  packageName: string;
}

const CATALOG: BloatEntry[] = [
  {
    id: "com.facebook.",
    label: "Facebook services",
    vendor: "Meta",
    risk: "safe",
    description: "Preinstalled Facebook app and background services.",
  },
  {
    id: "com.samsung.android.app.spage",
    label: "Samsung Free",
    vendor: "Samsung",
    risk: "safe",
    description: "News and content feed on the home screen.",
  },
  {
    id: "com.samsung.android.game.gamehome",
    label: "Game Launcher",
    vendor: "Samsung",
    risk: "safe",
    description: "Collects your games into a separate launcher.",
  },
  {
    id: "com.samsung.android.game.gametools",
    label: "Game Booster",
    vendor: "Samsung",
    risk: "safe",
    description: "In-game overlay and performance tools.",
  },
  {
    id: "com.samsung.android.app.tips",
    label: "Tips",
    vendor: "Samsung",
    risk: "safe",
    description: "Promotional tips and onboarding cards.",
  },
  {
    id: "com.samsung.android.aremoji",
    label: "AR Emoji",
    vendor: "Samsung",
    risk: "safe",
    description: "Augmented reality emoji creator.",
  },
  {
    id: "com.samsung.android.arzone",
    label: "AR Zone",
    vendor: "Samsung",
    risk: "safe",
    description: "Augmented reality camera effects hub.",
  },
  {
    id: "com.samsung.android.livestickers",
    label: "Live Stickers",
    vendor: "Samsung",
    risk: "safe",
    description: "Animated sticker pack for the camera.",
  },
  {
    id: "com.samsung.android.kidsinstaller",
    label: "Samsung Kids Installer",
    vendor: "Samsung",
    risk: "safe",
    description: "Downloads the Samsung Kids environment.",
  },
  {
    id: "com.samsung.android.bixby.agent",
    label: "Bixby Voice",
    vendor: "Samsung",
    risk: "caution",
    description: "Bixby voice assistant. Removing disables Bixby.",
  },
  {
    id: "com.samsung.android.scloud",
    label: "Samsung Cloud",
    vendor: "Samsung",
    risk: "caution",
    description: "Cloud sync and backup. Removing stops cloud backups.",
  },
  {
    id: "com.samsung.android.samsungpass",
    label: "Samsung Pass",
    vendor: "Samsung",
    risk: "caution",
    description: "Biometric password vault.",
  },
  {
    id: "com.miui.analytics",
    label: "MIUI Analytics",
    vendor: "Xiaomi",
    risk: "safe",
    description: "Usage analytics and telemetry.",
  },
  {
    id: "com.miui.msa.global",
    label: "MIUI System Ads (MSA)",
    vendor: "Xiaomi",
    risk: "safe",
    description: "Serves advertisements across MIUI system apps.",
  },
  {
    id: "com.xiaomi.mipicks",
    label: "GetApps",
    vendor: "Xiaomi",
    risk: "safe",
    description: "Xiaomi alternative app store.",
  },
  {
    id: "com.mi.globalbrowser",
    label: "Mi Browser",
    vendor: "Xiaomi",
    risk: "safe",
    description: "Preinstalled Xiaomi web browser.",
  },
  {
    id: "com.miui.bugreport",
    label: "Feedback",
    vendor: "Xiaomi",
    risk: "safe",
    description: "Bug report and feedback collector.",
  },
  {
    id: "com.miui.newhome",
    label: "App Vault",
    vendor: "Xiaomi",
    risk: "safe",
    description: "Feed shown to the left of the home screen.",
  },
  {
    id: "com.miui.cloudservice",
    label: "Mi Cloud",
    vendor: "Xiaomi",
    risk: "caution",
    description: "Cloud sync and backup service.",
  },
  {
    id: "com.miui.player",
    label: "Mi Music",
    vendor: "Xiaomi",
    risk: "caution",
    description: "Default Xiaomi music player.",
  },
  {
    id: "com.vivo.appstore",
    label: "vivo App Store",
    vendor: "vivo",
    risk: "safe",
    description: "vivo alternative app store.",
  },
  {
    id: "com.vivo.game",
    label: "vivo Game Center",
    vendor: "vivo",
    risk: "safe",
    description: "Game recommendations and store.",
  },
  {
    id: "com.vivo.hiboard",
    label: "Jovi Hiboard",
    vendor: "vivo",
    risk: "safe",
    description: "Feed panel beside the home screen.",
  },
  {
    id: "com.vivo.space",
    label: "vivo Space",
    vendor: "vivo",
    risk: "safe",
    description: "vivo community and support app.",
  },
  {
    id: "com.vivo.assistant",
    label: "Jovi Smart Scene",
    vendor: "vivo",
    risk: "safe",
    description: "Contextual assistant cards.",
  },
  {
    id: "com.vivo.browser",
    label: "vivo Browser",
    vendor: "vivo",
    risk: "caution",
    description: "Preinstalled vivo web browser.",
  },
  {
    id: "com.vivo.weather",
    label: "vivo Weather",
    vendor: "vivo",
    risk: "caution",
    description: "Default weather app. Widgets may stop updating.",
  },
  {
    id: "com.iqoo.secure",
    label: "iQOO Security",
    vendor: "vivo",
    risk: "caution",
    description: "Security and cleanup suite.",
  },
  {
    id: "com.heytap.market",
    label: "App Market",
    vendor: "Oppo",
    risk: "safe",
    description: "Oppo and Realme app store.",
  },
  {
    id: "com.heytap.browser",
    label: "Oppo Browser",
    vendor: "Oppo",
    risk: "safe",
    description: "Preinstalled Oppo web browser.",
  },
  {
    id: "com.oppo.quicksearchbox",
    label: "Quick Search",
    vendor: "Oppo",
    risk: "safe",
    description: "Home screen search bar.",
  },
  {
    id: "com.nearme.gamecenter",
    label: "Game Center",
    vendor: "Oppo",
    risk: "safe",
    description: "Game recommendations and store.",
  },
  {
    id: "com.coloros.cloud",
    label: "Heytap Cloud",
    vendor: "Oppo",
    risk: "caution",
    description: "Cloud sync and backup service.",
  },
  {
    id: "com.oneplus.gamespace",
    label: "Game Space",
    vendor: "OnePlus",
    risk: "safe",
    description: "Collects games and adds a gaming overlay.",
  },
  {
    id: "com.oneplus.brickmode",
    label: "Zen Mode",
    vendor: "OnePlus",
    risk: "safe",
    description: "Locks the phone for focus sessions.",
  },
  {
    id: "com.microsoft.skydrive",
    label: "OneDrive",
    vendor: "Microsoft",
    risk: "safe",
    description: "Preinstalled Microsoft cloud storage.",
  },
  {
    id: "com.microsoft.office.officehubrow",
    label: "Microsoft 365",
    vendor: "Microsoft",
    risk: "safe",
    description: "Preinstalled Office hub.",
  },
  {
    id: "com.linkedin.android",
    label: "LinkedIn",
    vendor: "Microsoft",
    risk: "safe",
    description: "Preinstalled LinkedIn app.",
  },
  {
    id: "com.amazon.mShop.android.shopping",
    label: "Amazon Shopping",
    vendor: "Amazon",
    risk: "safe",
    description: "Preinstalled Amazon store app.",
  },
  {
    id: "com.amazon.appmanager",
    label: "Amazon App Manager",
    vendor: "Amazon",
    risk: "safe",
    description: "Installs and updates Amazon apps.",
  },
  {
    id: "com.google.android.apps.tachyon",
    label: "Google Meet",
    vendor: "Google",
    risk: "safe",
    description: "Video calling app formerly known as Duo.",
  },
  {
    id: "com.google.android.videos",
    label: "Google TV",
    vendor: "Google",
    risk: "safe",
    description: "Movies and shows storefront.",
  },
  {
    id: "com.google.android.apps.magazines",
    label: "Google News",
    vendor: "Google",
    risk: "safe",
    description: "News and magazines feed.",
  },
  {
    id: "com.google.android.music",
    label: "Google Play Music",
    vendor: "Google",
    risk: "safe",
    description: "Legacy music player.",
  },
];

interface CompiledEntry extends BloatEntry {
  prefix: boolean;
}

const COMPILED: CompiledEntry[] = CATALOG.map((entry) => ({
  ...entry,
  prefix: entry.id.endsWith("."),
}));

export function catalogSize(): number {
  return CATALOG.length;
}

function findEntry(packageName: string): BloatEntry | undefined {
  for (const entry of COMPILED) {
    if (entry.prefix) {
      if (packageName.startsWith(entry.id)) return entry;
    } else if (packageName === entry.id) {
      return entry;
    }
  }
  return undefined;
}

export function matchBloat(installed: string[]): BloatMatch[] {
  const matches: BloatMatch[] = [];
  const seen = new Set<string>();

  for (const packageName of installed) {
    if (seen.has(packageName)) continue;
    const entry = findEntry(packageName);
    if (!entry) continue;
    seen.add(packageName);
    matches.push({ ...entry, packageName });
  }

  const riskOrder: Record<BloatRisk, number> = {
    safe: 0,
    caution: 1,
    expert: 2,
  };

  return matches.sort(
    (a, b) =>
      a.vendor.localeCompare(b.vendor) ||
      riskOrder[a.risk] - riskOrder[b.risk] ||
      a.label.localeCompare(b.label),
  );
}
