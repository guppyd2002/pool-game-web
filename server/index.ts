/**
 * WebSocket echo server — room-based message relay for pool game.
 * Port: 8080. Max 2 clients per room.
 */

import { WebSocketServer, WebSocket } from 'ws';

const PORT = parseInt(process.env['PORT'] || '8080', 10);
const MAX_ROOM_SIZE = 2;

// Room state
const rooms = new Map<string, Set<WebSocket>>();

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  let currentRoom: string | null = null;

  ws.on('message', (raw) => {
    let msg: { type: string; room?: string; data?: unknown };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return; // invalid JSON → ignore
    }

    const room = msg.room;
    if (!room) return;

    switch (msg.type) {
      case 'join': {
        // Leave current room if any
        if (currentRoom) leaveRoom(ws, currentRoom);

        // Check room capacity
        const members = rooms.get(room);
        if (members && members.size >= MAX_ROOM_SIZE) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
          return;
        }

        // Join room
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room)!.add(ws);
        currentRoom = room;
        ws.send(JSON.stringify({ type: 'joined', room }));
        break;
      }

      case 'shot':
      case 'state': {
        // Broadcast to other clients in the same room
        if (!currentRoom || currentRoom !== room) return;
        const members = rooms.get(currentRoom);
        if (!members) return;
        const payload = JSON.stringify(msg);
        for (const client of members) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        }
        break;
      }

      case 'leave': {
        if (currentRoom) {
          leaveRoom(ws, currentRoom);
          currentRoom = null;
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom) leaveRoom(ws, currentRoom);
  });
});

function leaveRoom(ws: WebSocket, room: string) {
  const members = rooms.get(room);
  if (members) {
    members.delete(ws);
    if (members.size === 0) rooms.delete(room);
  }
}

console.log(`WebSocket server on :${PORT}`);
