const net = require("net");
const { readFileSync } = require("fs");
const { join } = require("path");
const MAX_BYTES = 8192;
let buffer = Buffer.alloc(0);
let forwarded = false;
let replied = false;
const deadline = setTimeout(() => { sendMessage({ error: "Request timed out" }); process.exitCode = 1; process.stdin.destroy(); }, 120000);
deadline.unref();
process.stdin.on("data", (chunk) => {
  if (forwarded) return;
  if (buffer.length + chunk.length > MAX_BYTES + 4) return fail("Message too large");
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length < 4) return;
  const size = buffer.readUInt32LE(0);
  if (size === 0 || size > MAX_BYTES) return fail("Invalid message size");
  if (buffer.length < size + 4) return;
  if (buffer.length !== size + 4) return fail("One request per host required");
  forwarded = true;
  try {
    const message = JSON.parse(buffer.subarray(4).toString("utf8"));
    if (!message || message.action !== "install" || typeof message.url !== "string") return fail("Invalid operation");
    const token = readFileSync(join(process.env.APPDATA, "adb-apk-installer-pro", "extension-token"), "utf8").trim();
    if (!/^[a-f0-9]{64}$/.test(token)) return fail("App authentication unavailable");
    forwardToApp({ action: "install", url: message.url, token });
  } catch { fail("App unavailable or invalid request"); }
});
function fail(error) {
  forwarded = true;
  sendMessage({ error });
  process.stdin.destroy();
}
function sendMessage(message) {
  if (replied) return;
  replied = true;
  clearTimeout(deadline);
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length);
  process.stdout.write(Buffer.concat([size, payload]));
}
function forwardToApp(message) {
  const client = net.createConnection({ host: "127.0.0.1", port: 12845 }, () => {
    client.write(JSON.stringify(message) + "\n");
  });
  let response = Buffer.alloc(0);
  client.setTimeout(115000, () => client.destroy(new Error("timeout")));
  client.on("data", (chunk) => {
    if (response.length + chunk.length > MAX_BYTES) { client.destroy(); return sendMessage({ error: "Invalid app response" }); }
    response = Buffer.concat([response, chunk]);
    const delimiter = response.indexOf(10);
    if (delimiter < 0) return;
    try { sendMessage(JSON.parse(response.subarray(0, delimiter).toString("utf8"))); }
    catch { sendMessage({ error: "Invalid app response" }); }
    client.end();
  });
  client.on("error", () => sendMessage({ error: "App connection failed" }));
  client.on("close", () => { if (!replied) sendMessage({ error: "App closed without a response" }); process.stdin.destroy(); });
}
