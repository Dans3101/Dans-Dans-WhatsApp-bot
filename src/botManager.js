// src/botManager.js
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import dotenv from "dotenv";
import { sendTelegramMessage, sendTelegramPhoto } from "./telegramManager.js";
import { log, ensureDir } from "./utils.js";

dotenv.config();

const PUBLIC_DIR = path.join(process.cwd(), "public");
const AUTH_ROOT = path.join(process.cwd(), "auth");
ensureDir(PUBLIC_DIR);
ensureDir(AUTH_ROOT);

// exported status used by dashboard
export let botStatus = {
  connection: "idle",
  lastUpdate: new Date().toISOString(),
  lastError: null,
  connectionEmoji: "⚪",
  connectionColor: "gray"
};

function setStatus(status, extra = {}) {
  botStatus = {
    ...botStatus,
    connection: status,
    lastUpdate: new Date().toISOString(),
    ...extra
  };
  const map = {
    idle: ["⚪", "gray"],
    connecting: ["🟠", "orange"],
    qr: ["🟡", "gold"],
    connected: ["🟢", "green"],
    disconnected: ["🔴", "red"],
    reconnecting: ["🟡", "gold"],
    error: ["❌", "red"]
  };
  const pair = map[botStatus.connection] || ["⚪", "gray"];
  botStatus.connectionEmoji = pair[0];
  botStatus.connectionColor = pair[1];
}

async function saveQr(qr) {
  try {
    const qrPath = path.join(PUBLIC_DIR, "qr.png");
    await QRCode.toFile(qrPath, qr, { errorCorrectionLevel: "H", margin: 1, width: 700 });
    log("Saved QR to " + qrPath, "info");
    // send to telegram
    sendTelegramPhoto(qrPath, "📲 New QR — scan to link WhatsApp").catch(()=>{});
  } catch (e) {
    console.error("Failed to save QR:", e);
  }
}

function savePairing(code) {
  try {
    const f = path.join(PUBLIC_DIR, "pairing.txt");
    fs.writeFileSync(f, code, "utf8");
    log("Pairing code saved to " + f, "info");
    sendTelegramMessage(`<b>🔗 Pairing code</b>\n<code>${code}</code>`).catch(()=>{});
  } catch (e) {
    console.error("Failed to save pairing:", e);
  }
}

let currentSock = null;
let reconnectTimer = null;

export async function startSession(sessionId = "main", phoneNumber = null) {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  setStatus("connecting");
  log(`Starting session "${sessionId}" phone: ${phoneNumber || "none"}`, "info");

  try {
    const sessionDir = path.join(AUTH_ROOT, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const { version } = await fetchLatestBaileysVersion().catch(e => {
      console.warn("fetchLatestBaileysVersion failed, using fallback", e?.message || e);
      return { version: [2, 3000, 0] };
    });

    log("Using Baileys v" + version.join("."), "info");

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["DansBot", "Chrome", "122"]
    });

    currentSock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      try {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
          setStatus("qr");
          await saveQr(qr);
        }

        if (connection === "connecting") {
          setStatus("connecting");
          log("Connecting websocket...", "info");
        }

        if (connection === "open") {
          setStatus("connected");
          log("WhatsApp connected", "success");
          sendTelegramMessage("🟢 WhatsApp connected").catch(()=>{});
          // cleanup pairing.txt if exists
          const pairingFile = path.join(PUBLIC_DIR, "pairing.txt");
          if (fs.existsSync(pairingFile)) try { fs.unlinkSync(pairingFile); } catch(e){}
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : lastDisconnect?.error?.statusCode || "unknown";
          log("Connection closed. code=" + statusCode, "warn");
          setStatus("disconnected", { lastError: statusCode });
          sendTelegramMessage(`🔴 WhatsApp disconnected (code: ${statusCode})`).catch(()=>{});

          // don't auto-reconnect if logged out
          if (statusCode === DisconnectReason.loggedOut) {
            log("Session logged out. Manual re-link required.", "error");
            currentSock = null;
            return;
          }

          // reconnect with backoff
          reconnectTimer = setTimeout(() => {
            log("Attempting reconnect...", "info");
            setStatus("reconnecting");
            startSession(sessionId, phoneNumber);
          }, 3000);
        }
      } catch (e) {
        console.error("connection.update handler error:", e);
        setStatus("error", { lastError: String(e) });
      }
    });

    // handle pairing code request
    if (phoneNumber) {
      try {
        const pairingFile = path.join(PUBLIC_DIR, "pairing.txt");
        if (fs.existsSync(pairingFile)) try { fs.unlinkSync(pairingFile); } catch(e){}
        log("Requesting pairing code for " + phoneNumber, "info");
        const code = await sock.requestPairingCode(phoneNumber);
        savePairing(code);
        setStatus("qr");
      } catch (err) {
        console.error("Pairing request failed:", err);
        setStatus("error", { lastError: String(err) });
        sendTelegramMessage(`❌ Pairing code error: ${err?.message || err}`).catch(()=>{});
      }
    }

    // messages
    sock.ev.on("messages.upsert", async (m) => {
      try {
        const messages = m.messages || [];
        for (const msg of messages) {
          if (!msg.message) continue;
          if (msg.key?.fromMe) continue;

          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            "";

          if (!text) continue;
          const from = msg.key.remoteJid;
          const lc = text.trim().toLowerCase();

          // simple built-in commands
          if (lc === ".ping") {
            await sock.sendMessage(from, { text: "🏓 Pong!" }, { quoted: msg }).catch(()=>{});
            continue;
          }
          if (lc === ".alive") {
            await sock.sendMessage(from, { text: "✅ DansBot is alive!" }, { quoted: msg }).catch(()=>{});
            continue;
          }
          if (lc === ".status") {
            const st = `📊 Status:
• connection: ${botStatus.connection}
• last update: ${botStatus.lastUpdate}`;
            await sock.sendMessage(from, { text: st }, { quoted: msg }).catch(()=>{});
            continue;
          }
          if (lc === ".menu") {
            const menu = `📜 Menu:
• .ping
• .alive
• .status
• .menu`;
            await sock.sendMessage(from, { text: menu }, { quoted: msg }).catch(()=>{});
            continue;
          }
        }
      } catch (e) {
        console.error("messages.upsert handler error:", e);
      }
    });

    return sock;
  } catch (err) {
    console.error("startSession fatal error:", err);
    setStatus("error", { lastError: String(err) });
    sendTelegramMessage(`❌ startSession error: ${err?.message || err}`).catch(()=>{});
    // schedule retry
    reconnectTimer = setTimeout(() => startSession(sessionId, phoneNumber), 5000);
    throw err;
  }
}

export async function stopSession() {
  try {
    if (currentSock) {
      await currentSock.logout().catch(()=>{});
      currentSock = null;
      setStatus("idle");
    }
  } catch (e) {
    console.warn("stopSession error:", e);
  }
}