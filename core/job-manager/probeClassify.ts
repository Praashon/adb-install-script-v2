const APK_EXTENSIONS = [".apk", ".xapk", ".apks"];
const APK_MIME_TYPES = [
  "application/vnd.android.package-archive",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "binary/octet-stream",
];

export interface ProbeInput {
  mimeType: string;
  candidateName: string | null;
  pathname: string;
  hasDisposition: boolean;
}

export function classifyApkResponse(input: ProbeInput): {
  isApk: boolean;
  isHtml: boolean;
} {
  const mime = input.mimeType.toLowerCase();
  const isHtml =
    mime.includes("text/html") || mime.includes("application/xhtml");
  if (isHtml) return { isApk: false, isHtml: true };

  const name = (input.candidateName ?? "").toLowerCase();
  const hasApkExtension = APK_EXTENSIONS.some((ext) => name.endsWith(ext));
  const pathIsApk = APK_EXTENSIONS.some((ext) =>
    input.pathname.toLowerCase().endsWith(ext),
  );
  const mimeLooksBinary = APK_MIME_TYPES.some((m) => mime.startsWith(m));

  const hasForeignExtension = Boolean(
    name && /\.[a-z0-9]{1,6}$/.test(name) && !hasApkExtension,
  );

  const isApk =
    hasApkExtension ||
    pathIsApk ||
    (mimeLooksBinary && input.hasDisposition && !hasForeignExtension);

  return { isApk, isHtml: false };
}
