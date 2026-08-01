import { Route, Request, Response, Page } from "playwright-core";
import { BrowserManager } from "./browserManager";
interface InterceptedDownload {
  url: string;
  filename?: string;
  mimeType?: string;
  headers: Record<string, string>;
}
export interface CaptureOptions {
  clickSelector?: string;
  waitTimeout?: number;
  challengeTimeout?: number;
}
export class HumanVerificationRequiredError extends Error {
  constructor(readonly pageUrl: string) {
    super("The site is behind a human-verification check");
    this.name = "HumanVerificationRequiredError";
  }
}
const APK_MIME_TYPES = [
  "application/vnd.android.package-archive",
  "application/octet-stream",
  "application/x-zip",
  "application/zip",
];
const APK_EXTENSIONS = [".apk", ".xapk", ".apks"];
const CHALLENGE_TITLES = [
  /just a moment/i,
  /checking your browser/i,
  /attention required/i,
];
const CHALLENGE_SELECTORS = [
  "#challenge-form",
  "#cf-challenge-running",
  ".cf-browser-verification",
  '[data-translate="checking_browser"]',
];
export class NetworkInterceptor {
  private browserManager: BrowserManager;
  private interceptedDownloads: InterceptedDownload[] = [];
  constructor(browserManager: BrowserManager) {
    this.browserManager = browserManager;
  }
  async captureDownloadUrl(
    pageUrl: string,
    options: CaptureOptions = {},
  ): Promise<InterceptedDownload | null> {
    this.interceptedDownloads = [];
    const context = await this.browserManager.getContext();
    const page = await context.newPage();
    try {
      page.on("download", (download) => {
        this.interceptedDownloads.unshift({
          url: download.url(),
          filename:
            download.suggestedFilename() ||
            this.extractFilename(download.url()),
          headers: {},
        });
        void download.cancel().catch(() => undefined);
      });
      page.on("response", (response: Response) => {
        const headers = response.headers();
        const contentType = (headers["content-type"] || "").toLowerCase();
        const disposition = headers["content-disposition"] || "";
        const looksLikeApk =
          APK_MIME_TYPES.some((mime) => contentType.startsWith(mime)) &&
          /\.(apk|xapk|apks)/i.test(disposition);
        if (looksLikeApk) {
          this.interceptedDownloads.push({
            url: response.url(),
            filename:
              disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
              this.extractFilename(response.url()),
            mimeType: contentType,
            headers: {},
          });
        }
      });
      await page.route("**/*", async (route: Route, request: Request) => {
        const url = request.url();
        const resourceType = request.resourceType();
        if (this.isApkUrl(url)) {
          const headers = await request.allHeaders();
          this.interceptedDownloads.push({
            url,
            filename: this.extractFilename(url),
            headers,
          });
          await route.abort();
          return;
        }
        if (
          resourceType === "image" ||
          resourceType === "media" ||
          resourceType === "font"
        ) {
          await route.abort();
          return;
        }
        await route.continue();
      });
      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.waitTimeout ?? 30000,
      });
      await this.waitOutChallenge(page, options.challengeTimeout ?? 12000);
      if (this.interceptedDownloads.length > 0)
        return this.interceptedDownloads[0];
      if (options.clickSelector) {
        try {
          await page.click(options.clickSelector, { timeout: 5000 });
          await page.waitForTimeout(3000);
          if (this.interceptedDownloads.length > 0)
            return this.interceptedDownloads[0];
        } catch {}
      }
      const downloadButtons = await page.$$(
        'a[href*=".apk"], a[href*=".xapk"], a[href*="download"], button:has-text("Download")',
      );
      for (const button of downloadButtons.slice(0, 6)) {
        try {
          await button.click({ timeout: 3000 });
          await page.waitForTimeout(2000);
          if (this.interceptedDownloads.length > 0)
            return this.interceptedDownloads[0];
        } catch {}
      }
      return this.interceptedDownloads[0] ?? null;
    } finally {
      await page.close().catch(() => undefined);
    }
  }
  private async waitOutChallenge(page: Page, timeout: number): Promise<void> {
    if (!(await this.isChallengePage(page))) return;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1000);
      if (!(await this.isChallengePage(page))) return;
    }
    throw new HumanVerificationRequiredError(page.url());
  }
  private async isChallengePage(page: Page): Promise<boolean> {
    try {
      const title = await page.title();
      if (CHALLENGE_TITLES.some((pattern) => pattern.test(title))) return true;
      for (const selector of CHALLENGE_SELECTORS) {
        if ((await page.$(selector)) !== null) return true;
      }
    } catch {}
    return false;
  }
  private isApkUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return APK_EXTENSIONS.some((ext) => lower.includes(ext));
  }
  private extractFilename(url: string): string | undefined {
    try {
      const segments = new URL(url).pathname.split("/");
      const last = segments[segments.length - 1];
      if (last && last.includes(".")) return decodeURIComponent(last);
    } catch {}
    return undefined;
  }
}
