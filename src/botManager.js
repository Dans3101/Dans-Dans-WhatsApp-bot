// src/botManager.js
// Robust Baileys v7+ connection with QR & pairing delivery to Telegram.
// Features:
//  - persistent multi-file auth state under ./auth/<sessionId>
//  - saves QR to ./public/qr.png
//  - saves pairing code to ./public/pairing.txt
//  - sends QR and pairing to Telegram via telegramManager
//  - simple command handling (.ping, .alive, .status, .menu, .broadcast, .block, .unblock, .toggle, .shutdown)

import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { sendTelegramMessage, sendTelegramPhoto } from './telegramManager.js';

dotenv.config();

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const AUTH_ROOT = path.join(process.cwd(), 'auth');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(AUTH_ROOT)) fs.mkdirSync(AUTH_ROOT, { recursive: true });

// global botStatus exported for index/dashboard
export let botStatus = {
  connection: 'idle', // idle | connecting | qr | connected | disconnected | reconnecting | error
  lastUpdate: new Date().toISOString(),
  connectionEmoji: '⚪',
  connectionColor: 'gray',
  lastError: null,
  phoneNumber: null
};

function setStatus(s, extra = {}) {
  botStatus = {
    ...botStatus,
    connection: s,
    lastUpdate: new Date().toISOString(),
    ...(extra || {})
  };

  // map emoji and color keys for dashboard
  const map = {
    idle: ['⚪', 'gray'],
    connecting: ['🟠', 'orange'],
    qr: ['🟡', 'gold'],
    connected: ['🟢', 'green'],
    disconnected: ['🔴', 'red'],
    reconnecting: ['🟡', 'gold'],
    error: ['❌', 'red']
  };
  const pair = map[botStatus.connection] || ['⚪', 'gray'];
  botStatus.connectionEmoji = pair[0];
  botStatus.connectionColor = pair[1];
}

// simple in-memory blocklist & features (persist to file later if wanted)
const BLOCKLIST_FILE = path.join(process.cwd(), 'blocklist.json');
const FEATURES_FILE = path.join(process.cwd(), 'features.json');

let blocklist = [];
let features = { autoview: true, faketyping: true };

// load persisted small files if available
if (fs.existsSync(BLOCKLIST_FILE)) {
  try { blocklist = JSON.parse(fs.readFileSync(BLOCKLIST_FILE)); } catch(e){ blocklist = []; }
}
if (fs.existsSync(FEATURES_FILE)) {
  try { features = JSON.parse(fs.readFileSync(FEATURES_FILE)); } catch(e){ features = { autoview: true, faketyping: true }; }
}

// helper to save pairing or qr
async function saveQrFile(qr) {
  const qrPath = path.join(PUBLIC_DIR, 'qr.png');
  try {
    await QRCode.toFile(qrPath, qr, { errorCorrectionLevel: 'H', margin: 1, width: 700 });
    console.log('✅ QR saved to', qrPath);
    // send to telegram if set
    sendTelegramPhoto(qrPath, '📲 New WhatsApp QR — scan to link the bot');
  } catch (e) {
    console.error('❌ Failed to save qr file:', e);
  }
}

function savePairingCode(code) {
  const f = path.join(PUBLIC_DIR, 'pairing.txt');
  try {
    fs.writeFileSync(f, code, 'utf8');
    console.log('🔗 Pairing code saved to', f);
    sendTelegramMessage(`🔗 Pairing code:\n<code>${code}</code>`).catch(()=>{});
  } catch (e) {
    console.error('❌ Failed to save pairing code:', e);
  }
}

let currentSock = null;
let reconnectTimer = null;

/**
 * startSession(sessionId, phoneNumber)
 * - sessionId: string (folder under ./auth)
 * - phoneNumber: optional (e.g., 254712345678) to generate pairing code
 */
export async function startSession(sessionId = 'main', phoneNumber = null) {
  // clean any previous reconnect attempt
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  setStatus('connecting', { phoneNumber: phoneNumber || null });
  console.log('🔁 Starting session', sessionId, 'phoneNumber:', phoneNumber || 'none');

  try {
    const sessionDir = path.join(AUTH_ROOT, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion().catch(e => {
      console.warn('⚠️ fetchLatestBaileysVersion failed, using fallback version.', e?.message || e);
      return { version: [2, 3000, 0] };
    });

    console.log('📦 Baileys version:', version.join('.'));

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['DansBot', 'Chrome', '122']
    });

    currentSock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      try {
        const { connection, qr, lastDisconnect } = update;
        // write raw update for debugging if needed
        // fs.writeFileSync(path.join(PUBLIC_DIR,'last-connection.json'), JSON.stringify(update, null, 2));

        if (qr) {
          setStatus('qr');
          await saveQrFile(qr);
        }

        if (connection === 'connecting') {
          setStatus('connecting');
          console.log('🔌 connecting...');
        }

        if (connection === 'open') {
          setStatus('connected');
          console.log('✅ Connected to WhatsApp');
          // cleanup pairing file and qr file if present
          const p = path.join(PUBLIC_DIR, 'pairing.txt');
          const q = path.join(PUBLIC_DIR, 'qr.png');
          if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch(e){}
          if (fs.existsSync(q)) try { /* keep qr visible briefly or remove */ } catch(e){}
          // notify Telegram
          sendTelegramMessage('🟢 WhatsApp bot connected').catch(()=>{});
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : lastDisconnect?.error?.statusCode || 'unknown';
          console.log('❌ connection closed. statusCode=', statusCode, 'error=', lastDisconnect?.error);
          setStatus('disconnected', { lastError: statusCode });

          // notify Telegram
          sendTelegramMessage(`🔴 WhatsApp disconnected (code: ${statusCode}).`).catch(()=>{});

          // if logged out, do not try automatic reconnection (must re-link)
          if (statusCode === DisconnectReason.loggedOut) {
            console.log('⛔ Session logged out. Remove auth folder to re-link manually.');
            // DO NOT auto-delete creds automatically (user control)
            currentSock = null;
            return;
          }

          // try reconnect: small backoff
          reconnectTimer = setTimeout(() => {
            console.log('🔁 Attempting to reconnect...');
            setStatus('reconnecting');
            startSession(sessionId, phoneNumber);
          }, 2500);
        }
      } catch (e) {
        console.error('🔥 connection.update handler failed:', e);
        setStatus('error', { lastError: String(e) });
      }
    });

    // pairing code logic: request pairing only if phoneNumber provided
    if (phoneNumber) {
      try {
        const pairingFile = path.join(PUBLIC_DIR, 'pairing.txt');
        if (fs.existsSync(pairingFile)) try { fs.unlinkSync(pairingFile); } catch(e){}
        console.log('📲 requesting pairing code for', phoneNumber);
        const code = await sock.requestPairingCode(phoneNumber);
        savePairingCode(code);
        // mark status as qr (so dashboard shows code)
        setStatus('qr');
      } catch (err) {
        console.error('❌ Pairing code request failed:', err?.message || err);
        setStatus('error', { lastError: String(err) });
        sendTelegramMessage(`❌ Pairing code generation failed: ${err?.message || err}`).catch(()=>{});
      }
    }

    // message handler
    sock.ev.on('messages.upsert', async (m) => {
      try {
        const messages = m.messages || [];
        for (const msg of messages) {
          if (!msg.message) continue;
          if (msg.key?.fromMe) continue;

          // simple text extraction
          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            '';

          if (!text) continue;
          const from = msg.key.remoteJid;

          // blocklist check
          if (blocklist.includes(from)) {
            console.log('⛔ message from blocked sender', from);
            continue;
          }

          const command = text.trim();
          const lc = command.toLowerCase();

          // built-in commands
          if (lc === '.ping') {
            await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: msg }).catch(() => {});
            continue;
          }
          if (lc === '.alive') {
            await sock.sendMessage(from, { text: '✅ DansBot is alive!' }, { quoted: msg }).catch(() => {});
            continue;
          }
          if (lc === '.status') {
            const statusText = `📊 Status:\n• connection: ${botStatus.connection}\n• lastUpdate: ${botStatus.lastUpdate}\n• autoview: ${features.autoview}\n• faketyping: ${features.faketyping}`;
            await sock.sendMessage(from, { text: statusText }, { quoted: msg }).catch(() => {});
            continue;
          }
          if (lc.startsWith('.block ')) {
            const num = command.split(' ')[1];
            if (num) {
              blocklist.push(num + '@s.whatsapp.net');
              fs.writeFileSync(BLOCKLIST_FILE, JSON.stringify(blocklist, null, 2));
              await sock.sendMessage(from, { text: `✅ Blocked ${num}` }, { quoted: msg }).catch(() => {});
            }
            continue;
          }
          if (lc.startsWith('.unblock ')) {
            const num = command.split(' ')[1];
            if (num) {
              const jid = num + '@s.whatsapp.net';
              blocklist = blocklist.filter(x => x !== jid);
              fs.writeFileSync(BLOCKLIST_FILE, JSON.stringify(blocklist, null, 2));
              await sock.sendMessage(from, { text: `✅ Unblocked ${num}` }, { quoted: msg }).catch(() => {});
            }
            continue;
          }
          if (lc.startsWith('.broadcast ')) {
            const payload = command.slice(11).trim();
            if (!payload) {
              await sock.sendMessage(from, { text: '❌ Usage: .broadcast <message>' }, { quoted: msg }).catch(() => {});
            } else {
              // naive broadcast: send to last 50 chat ids saved in auth store isn't accessible; keep simple: reply back
              await sock.sendMessage(from, { text: `✅ Broadcast queued (not implemented full).` }, { quoted: msg }).catch(() => {});
              // optionally send to telegram to handle broadcast
              sendTelegramMessage(`📣 Broadcast requested:\n${payload}`).catch(()=>{});
            }
            continue;
          }
          if (lc.startsWith('.toggle ')) {
            const featureName = command.split(' ')[1];
            if (featureName && Object.prototype.hasOwnProperty.call(features, featureName)) {
              features[featureName] = !features[featureName];
              fs.writeFileSync(FEATURES_FILE, JSON.stringify(features, null, 2));
              await sock.sendMessage(from, { text: `⚙️ ${featureName} => ${features[featureName]}` }, { quoted: msg }).catch(() => {});
            } else {
              await sock.sendMessage(from, { text: `❌ Unknown feature: ${featureName}` }, { quoted: msg }).catch(() => {});
            }
            continue;
          }
          if (lc === '.menu') {
            const menu = `📜 Menu:
• .ping
• .alive
• .status
• .menu
• .block <number>
• .unblock <number>
• .toggle <feature>
• .broadcast <message>`;
            await sock.sendMessage(from, { text: menu }, { quoted: msg }).catch(() => {});
            continue;
          }

          // read messages automatically if autoview enabled
          if (features.autoview) {
            try { await sock.readMessages([msg.key]); } catch(e){}
          }

          // fake typing behavior
          if (features.faketyping) {
            try {
              await sock.sendPresenceUpdate('composing', from);
              await new Promise(r => setTimeout(r, 900));
              await sock.sendPresenceUpdate('paused', from);
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error('Error in messages.upsert handler:', e);
      }
    });

    return sock;
  } catch (err) {
    console.error('❌ startSession error:', err);
    setStatus('error', { lastError: String(err) });
    sendTelegramMessage(`❌ startSession error: ${err?.message || err}`).catch(()=>{});
    // schedule retry after backoff
    reconnectTimer = setTimeout(() => startSession(sessionId, phoneNumber), 5000);
    throw err;
  }
}

// helper to stop current socket if needed
export async function stopSession() {
  try {
    if (currentSock) {
      await currentSock.logout().catch(() => {});
      currentSock = null;
    }
  } catch (e) {
    console.warn('stopSession error', e);
  }
}
