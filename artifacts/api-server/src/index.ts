import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { addRealtimeClient, broadcastRealtime } from "./lib/realtime";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

server.on("upgrade", (request, socket) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (!key || Array.isArray(key)) {
    socket.destroy();
    return;
  }
  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));
  addRealtimeClient(socket);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

setInterval(() => {
  broadcastRealtime({ type: "presence.updated", at: new Date().toISOString() });
}, 30_000).unref();
