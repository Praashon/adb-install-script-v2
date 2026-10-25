import { lookup } from "dns";
import { isIP, type LookupFunction } from "net";
import { Agent } from "undici";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Accept global unicast only; mapped IPv4, loopback, link-local, ULA and transition ranges fail closed.
  const value = isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase() : address.toLowerCase();
  return isIP(value) === 6 && /^[23]/.test(value) && !/^2001:(?:0*:|db8:|0?2:|1[0-9a-f]:)/.test(value) && !value.startsWith("2002:");
}
export function publicHttpUrl(input: string): URL {
  if (typeof input !== "string" || input.length > 8192) throw new Error("Invalid network URL");
  const url = new URL(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      (isIP(host) && !isPublicAddress(host)) ||
      /(^|\.)(localhost|local|internal|home|lan)\.?$/i.test(host) || !host.includes(".") && !isIP(host)) {
    throw new Error("Only public HTTP(S) destinations without credentials are allowed");
  }
  return url;
}
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, family: options.family }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
      return callback(new Error("Destination resolves to a non-public address"), "", 0);
    }
    // Return the exact checked addresses to the connection; there is no second DNS lookup.
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};
const publicAgent = new Agent({ connect: { lookup: publicLookup, timeout: 15000 }, connections: 4 });

export async function safeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let url = publicHttpUrl(input);
  const headers = new Headers(init.headers);
  const signal = AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(10 * 60_000)]);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(url, { ...init, headers, signal, redirect: "manual", dispatcher: publicAgent } as RequestInit);
    if (![301, 302, 303, 307, 308].includes(response.status) || init.redirect === "manual") return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirects === 5) throw new Error("Invalid or excessive network redirects");
    const next = publicHttpUrl(new URL(location, url).href);
    if (url.protocol === "https:" && next.protocol !== "https:") throw new Error("HTTPS downgrade redirect refused");
    if (next.origin !== url.origin) {
      for (const key of [...headers.keys()]) {
        if (!["accept", "accept-language", "user-agent", "range"].includes(key)) headers.delete(key);
      }
    }
    url = next;
  }
  throw new Error("Too many redirects");
}

export async function limitedText(response: Response, maxBytes = 8 * 1024 ** 2): Promise<string> {
  if (!response.body) return "";
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel(); throw new Error("Page exceeds size limit");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error("Page exceeds size limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
