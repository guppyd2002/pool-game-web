/**
 * WebSocket client — connects to server for multiplayer shot relay.
 * Turn-based state snapshot + local replay model.
 */

export interface ShotPayload {
  force: number;
  directionX: number;
  directionZ: number;
  ballsState: string; // full physics state snapshot
}

export interface WSClient {
  connect(): Promise<void>;
  sendShot(data: ShotPayload): void;
  onShotReceived(callback: (data: ShotPayload) => void): void;
  disconnect(): void;
}

export function createWSClient(url: string, room: string): WSClient {
  let ws: WebSocket | null = null;
  let shotCallback: ((data: ShotPayload) => void) | null = null;

  return {
    connect() {
      return new Promise<void>((resolve, reject) => {
        try {
          ws = new WebSocket(url);
        } catch (e) {
          console.warn('WebSocket connection failed:', e);
          reject(e);
          return;
        }

        ws.onopen = () => {
          ws!.send(JSON.stringify({ type: 'join', room }));
        };

        ws.onmessage = (event) => {
          let msg: { type: string; room?: string; data?: ShotPayload };
          try {
            msg = JSON.parse(event.data);
          } catch { return; }

          if (msg.type === 'joined') {
            resolve();
          } else if (msg.type === 'shot' && msg.data) {
            shotCallback?.(msg.data);
          } else if (msg.type === 'error') {
            console.warn('Server error:', msg);
          }
        };

        ws.onerror = (e) => {
          console.warn('WebSocket error:', e);
          reject(e);
        };

        ws.onclose = () => {
          console.warn('WebSocket closed');
        };

        // Timeout fallback
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
    },

    sendShot(data: ShotPayload) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'shot', room, data }));
      }
    },

    onShotReceived(callback: (data: ShotPayload) => void) {
      shotCallback = callback;
    },

    disconnect() {
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}
