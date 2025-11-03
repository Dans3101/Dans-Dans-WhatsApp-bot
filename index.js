import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { startSession, botStatus } from './src/botManager.js';
import { initTelegramBot, sendTelegramLog } from './src/telegramManager.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), 'public');
if (!existsSync(publicPath)) mkdirSync(publicPath);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicPath));

app.get('/', (req, res) => {
  let pairingCode = '';
  const pairingFile = path.join(publicPath, 'pairing.txt');
  if (existsSync(pairingFile)) pairingCode = readFileSync(pairingFile, 'utf8').trim();

  res.send(`
    <html>
      <body style="text-align:center; font-family:Arial; padding:40px;">
        <h1>🤖 DansDan WhatsApp Dashboard</h1>
        <h2>Status: <span style="color:${
          botStatus.connectionColor
        }">${botStatus.connectionEmoji} ${botStatus.connection.toUpperCase()}</span></h2>
        <p>Last Update: ${new Date(botStatus.lastUpdate).toLocaleString()}</p>
        <hr/>
        <h3>Pairing Code</h3>
        <p style="font-size:22px; color:green;">${pairingCode || '⌛ Waiting for code...'}</p>
        <img src="/qr.png" width="250" style="border:1px solid #ccc; margin:20px;">
        <form method="POST" action="/generate">
          <input name="phone" placeholder="e.g. 2547xxxxxxxx" required style="padding:8px;">
          <button type="submit" style="padding:8px 16px;">Generate Code</button>
        </form>
      </body>
    </html>
  `);
});

app.post('/generate', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.send('❌ Please enter a phone number.');
  startSession('main', phone.trim());
  res.redirect('/');
});

app.get('/status', (req, res) => res.json(botStatus));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, async () => {
  console.log(`🌍 Server running on port ${PORT}`);
  await initTelegramBot();
  await startSession('main');
  sendTelegramLog('✅ DansDan bot started successfully.');
});
