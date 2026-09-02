import type { Socket } from "node:net";
import type { Duplex } from "node:stream";

type RealtimeSocket = Socket | Duplex;
const clients = new Set<RealtimeSocket>();

const frameText = (payload: string) => {
  const body = Buffer.from(payload);
  if (body.length < 126) {
    return Buffer.concat([Buffer.from([0x81, body.length]), body]);
  }
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(body.length, 2);
  return Buffer.concat([header, body]);
};

export function addRealtimeClient(socket: RealtimeSocket) {
  clients.add(socket);
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
  socket.write(frameText(JSON.stringify({ type: "connected", at: new Date().toISOString() })));
}

export function broadcastRealtime(event: Record<string, unknown>) {
  const frame = frameText(JSON.stringify(event));
  for (const client of clients) {
    if (!client.destroyed) client.write(frame);
  }
}

export function realtimeClientCount() {
  return clients.size;
}