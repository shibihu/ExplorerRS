import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 8080;
const webClients = new Set<WebSocket>();

// คิวสำหรับเก็บคำสั่งอัปเดต Property ที่ส่งมาจาก Web UI
let pendingUpdates: Array<{ id: string; property: string; value: any }> = [];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Endpoint รับ Hierarchy จาก Roblox
  if (req.url === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        webClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
          }
        });

        // ส่งคิวคำสั่งที่ค้างอยู่กลับไปให้ Roblox Studio รัน
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', updates: pendingUpdates }));
        pendingUpdates = []; // ล้างคิวเมื่อส่งแล้ว
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // 2. Endpoint รับคำสั่งแก้ Property จาก Web UI
  if (req.url === '/api/update-property' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body); // { id, property, value }
        pendingUpdates.push(payload);
        console.log('[Bridge] Queued property update:', payload);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'queued' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[Bridge] New Web Client Connected');
  webClients.add(ws);

  ws.on('close', () => {
    webClients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[Bridge Server] Running on http://localhost:${PORT}`);
});