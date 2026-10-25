import { createServer, type Server, type Socket } from "net";
import { timingSafeEqual } from "crypto";

export const MAX_MESSAGE_BYTES = 8192;
export function validateExtensionRequest(raw: unknown, token: string): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid message");
  const message = raw as Record<string, unknown>;
  const supplied = typeof message.token === "string" ? Buffer.from(message.token) : Buffer.alloc(0);
  const expected = Buffer.from(token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Unauthorized extension request");
  }
  if (Object.keys(message).some((key) => !["action", "url", "token"].includes(key)) ||
      message.action !== "install" || typeof message.url !== "string" || message.url.length > 4096) {
    throw new Error("Invalid extension operation");
  }
  const url = new URL(message.url);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Only HTTP(S) URLs without credentials are allowed");
  }
  return url.href;
}

// One newline-delimited UTF-8 JSON request per connection. No device operations here.
export function createExtensionBridge(options: {
  token: string;
  onRequest: (url: string) => Promise<Record<string, unknown>>;
  timeoutMs?: number;
  maxRequests?: number;
}): Server {
  const sockets = new Set<Socket>();
  let windowStart = Date.now();
  let requests = 0;
  const server = createServer((socket) => {
    socket.on("error", () => socket.destroy());
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
    if (sockets.size >= 16 || ++requests > (options.maxRequests ?? 10)) {
      socket.end(JSON.stringify({ error: "Extension request limit reached" }) + "\n", () => socket.destroy());
      return;
    }
    sockets.add(socket);
    let buffer = Buffer.alloc(0);
    let handled = false;
    const timer = setTimeout(() => socket.destroy(), options.timeoutMs ?? 10_000);
    timer.unref();
    socket.on("close", () => { clearTimeout(timer); sockets.delete(socket); });
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: Buffer) => {
      if (handled) return;
      if (buffer.length + chunk.length > MAX_MESSAGE_BYTES) {
        handled = true;
        socket.end(JSON.stringify({ error: "Message too large" }) + "\n");
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      const delimiter = buffer.indexOf(10);
      if (delimiter < 0) return;
      handled = true;
      let url: string;
      try {
        if (buffer.subarray(delimiter + 1).toString().trim()) throw new Error("One request per connection required");
        url = validateExtensionRequest(JSON.parse(buffer.subarray(0, delimiter).toString("utf8")), options.token);
      } catch (error) {
        socket.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid message" }) + "\n");
        return;
      }
      // Stop the framing deadline; bound the whole approval separately in the caller.
      clearTimeout(timer);
      void options.onRequest(url).then(
        (result) => socket.end(JSON.stringify(result) + "\n"),
        () => socket.end(JSON.stringify({ error: "Request could not be queued" }) + "\n"),
      );
    });
  });
  server.on("close", () => { for (const socket of sockets) socket.destroy(); });
  return server;
}
