const net = require("net");
let payloadSize = null;
let chunks = [];
process.stdin.on("readable", () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (payloadSize === null && buffer.length >= 4) {
    payloadSize = buffer.readUInt32LE(0);
  }
  if (payloadSize !== null && buffer.length >= payloadSize + 4) {
    const content = buffer.slice(4, payloadSize + 4).toString("utf8");
    chunks = [buffer.slice(payloadSize + 4)];
    payloadSize = null;
    try {
      const message = JSON.parse(content);
      forwardToApp(message);
    } catch (e) {
      sendMessage({ error: "Failed to parse JSON" });
    }
  }
});
function sendMessage(message) {
  const json = JSON.stringify(message);
  const buffer = Buffer.from(json, "utf8");
  const size = Buffer.alloc(4);
  size.writeUInt32LE(buffer.length, 0);
  process.stdout.write(size);
  process.stdout.write(buffer);
}
function forwardToApp(message) {
  const client = net.createConnection({ port: 12845 }, () => {
    client.write(JSON.stringify(message));
    client.end();
  });
  client.on("data", (data) => {
    try {
      const response = JSON.parse(data.toString());
      sendMessage(response);
    } catch {
      sendMessage({ success: true });
    }
  });
  client.on("error", () => {
    sendMessage({ error: "App not running on port 12845" });
  });
}
