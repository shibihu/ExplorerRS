import { WebSocketServer, WebSocket } from 'ws';

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

let webClient: WebSocket | null = null;
let robloxClient: WebSocket | null = null;

console.log(`[ExplorerRS Bridge] Server running on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  console.log(`[Bridge] New connection established from ${req.socket.remoteAddress}`);

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      
      // ตัวอย่างการทำ Handshake เพื่อแยกฝั่ง Web และ Roblox Studio
      if (data.type === 'connection.hello') {
        if (data.role === 'web') {
          webClient = ws;
          console.log('[Bridge] Registered Web Client');
        } else if (data.role === 'roblox') {
          robloxClient = ws;
          console.log('[Bridge] Registered Roblox Studio Plugin');
        }

        ws.send(JSON.stringify({
          type: 'connection.ready',
          status: 'connected',
          timestamp: Date.now()
        }));
        return;
      }

      // Relay ข้อความจาก Web -> Roblox Studio
      if (ws === webClient && robloxClient && robloxClient.readyState === WebSocket.OPEN) {
        robloxClient.send(message.toString());
      } 
      // Relay ข้อความจาก Roblox Studio -> Web
      else if (ws === robloxClient && webClient && webClient.readyState === WebSocket.OPEN) {
        webClient.send(message.toString());
      }
    } catch (error) {
      console.error('[Bridge] Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    if (ws === webClient) {
      console.log('[Bridge] Web Client disconnected');
      webClient = null;
    } else if (ws === robloxClient) {
      console.log('[Bridge] Roblox Plugin disconnected');
      robloxClient = null;
    }
  });
});
