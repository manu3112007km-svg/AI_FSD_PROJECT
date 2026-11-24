import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

let wssInstance: WebSocketServer | null = null;

export function attachWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'system:connected',
        payload: { message: 'Connected to ResQNet real-time channel' },
        timestamp: new Date().toISOString(),
      })
    );
  });

  wssInstance = wss;
  return wss;
}

export function broadcastRealtimeEvent(type: string, payload: unknown): void {
  if (!wssInstance) return;
  const message = JSON.stringify({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const client of wssInstance.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
