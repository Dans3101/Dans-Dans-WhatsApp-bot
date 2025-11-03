// src/botManager.js
// ----------------------------------------------------------
// 🔹 WhatsApp Bot Manager — Stable + Auto-Reconnect Version
// ----------------------------------------------------------

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

// ----------------------------------------------------------
// Paths
// ----------------------------------------------------------
const PUBLIC_DIR = path.join(process.cwd(), "public");
const AUTH_ROOT = path.join(process.cwd(), "sessions"); // persistent disk mount
ensureDir(PUBLIC_DIR);
ensureDir(AUTH_ROOT);

// ----------------------------------------------------------
// Status Tracker
// ----------------------------------------------------------
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
  const colors = {
    idle: ["⚪", "gray"],
    connecting: ["🟠", "orange"],
    qr: ["🟡", "gold"],
    connected: ["🟢", "green"],
    disconnected: ["🔴", "red"],
    reconnecting: ["🟡", "gold"],
    error: ["❌", "red"]
  };
  const [emoji, color] = colors[status] || ["⚪", "gray"];
  botStatus.connectionEmoji = emoji;
  botStatus.connectionColor = color;
}

// ----------------------------------------------------------
// QR + Pairing Helpers
// ----------------------------------------------------------
async function saveQr(qr) {
  try {
    const qrPath = path.join(PUBLIC_DIR, "qr.png");
    await QRCode.toFile(qrPath, qr, { errorCorrectionLevel: "H", margin: 1, width: 600 });
    log("🟡 New QR saved: /public/qr.png", "info");
    sendTelegramPhoto(qrPath, "📲 New QR — scan to link WhatsApp").catch(() => {});
  } catch (e) {
    console.error("Failed to save QR:", e);
  }
}

function savePairing(code) {
  try {
    const f = path.join(PUBLIC_DIR, "pairing.txt");
    fs.writeFileSync(f, code, "utf8");
    log("🔗 Pairing code saved to " + f, "info");
    sendTelegramMessage(`<b>🔗 Pairing Code:</b>\n<code>${code}</code>`).catch(() => {});
  } catch (e) {
    console.error("Failed to save pairing:", e);
  }
}

// ----------------------------------------------------------
// Session Controller
// ----------------------------------------------------------
let currentSock = null;
let reconnectAttempts = 0;

export async function startSession(sessionId = "main", phoneNumber = null) {
  setStatus("connecting");
  log(`🚀 Starting session "${sessionId}" phone: ${phoneNumber || "none"}`, "info");

  try {
    const sessionDir = path.join(AUTH_ROOT, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] }));

    log(`Using Baileys v${version.join(".")}`, "info");

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["DansBot", "Chrome", "122"]
    });
    currentSock = sock;

    sock.ev.on("creds.update", saveCreds);

    // ----------------------------------------------------------
    // Connection Events
    // ----------------------------------------------------------
    sock.ev.on("connection.update", async (update) => {
      const { connection, qr, lastDisconnect } = update;
      try {
        if (qr) {
          setStatus("qr");
          await saveQr(qr);
        }

        if (connection === "connecting") {
          log("🟠 Connecting to WhatsApp...", "info");
          setStatus("connecting");
        }

        if (connection === "open") {
          reconnectAttempts = 0;
          setStatus("connected");
          log("🟢 WhatsApp connected successfully!", "success");
          sendTelegramMessage("✅ WhatsApp connected!").catch(() => {});
          const pairingFile = path.join(PUBLIC_DIR, "pairing.txt");
          if (fs.existsSync(pairingFile)) fs.unlinkSync(pairingFile);
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : lastDisconnect?.error?.statusCode || "unknown";

          log(`Connection closed (code: ${statusCode})`, "warn");
          setStatus("disconnected", { lastError: statusCode });
          sendTelegramMessage(`🔴 WhatsApp disconnected (code: ${statusCode})`).catch(() => {});

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            log("⚠️ Session logged out — needs re-pair.", "error");
            setStatus("error", { lastError: "Logged out" });
            currentSock = null;
            return;
          }

          // Exponential backoff reconnect
          const delay = Math.min(15000, 2000 * ++reconnectAttempts);
          log(`🔁 Attempting reconnect in ${delay / 1000}s...`, "info");
          setStatus("reconnecting");
          setTimeout(() => startSession(sessionId, phoneNumber), delay);
        }
      } catch (e) {
        console.error("connection.update handler error:", e);
        setStatus("error", { lastError: String(e) });
      }
    });

    // ----------------------------------------------------------
    // Pairing Request
    // ----------------------------------------------------------
    if (phoneNumber) {
      try {
        const pairingFile = path.join(PUBLIC_DIR, "pairing.txt");
        if (fs.existsSync(pairingFile)) fs.unlinkSync(pairingFile);
        log(`📞 Requesting pairing code for ${phoneNumber}`, "info");
        const code = await sock.requestPairingCode(phoneNumber);
        savePairing(code);
        setStatus("qr");
      } catch (err) {
        console.error("Pairing request failed:", err);
        setStatus("error", { lastError: String(err) });
        sendTelegramMessage(`❌ Pairing code error: ${err?.message || err}`).catch(() => {});
      }
    }

    // ----------------------------------------------------------
    // Message Listener
    // ----------------------------------------------------------
    sock.ev.on("messages.upsert", async (m) => {
      try {
        const messages = m.messages || [];
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            "";
          if (!text) continue;

          const from = msg.key.remoteJid;
          const lc = text.trim().toLowerCase();

          if (lc === ".ping") {
            await sock.sendMessage(from, { text: "🏓 Pong!" }, { quoted: msg });
          } else if (lc === ".alive") {
            await sock.sendMessage(from, { text: "✅ DansBot is alive!" }, { quoted: msg });
          } else if (lc === ".status") {
            const st = `📊 Status:
• connection: ${botStatus.connection}
• last update: ${botStatus.lastUpdate}`;
            await sock.sendMessage(from, { text: st }, { quoted: msg });
          } else if (lc === ".menu") {
            const menu = `📜 Menu:
• .ping
• .alive
• .status
• .menu`;
            await sock.sendMessage(from, { text: menu }, { quoted: msg });
          }
        }
      } catch (e) {
        console.error("messages.upsert handler error:", e);
      }
    });

    return sock;
  } catch (err) {
    console.error("❌ startSession fatal error:", err);
    setStatus("error", { lastError: String(err) });
    sendTelegramMessage(`❌ startSession error: ${err?.message || err}`).catch(() => {});
    const delay = Math.min(15000, 2000 * ++reconnectAttempts);
    setTimeout(() => startSession(sessionId, phoneNumber), delay);
    throw err;
  }
}

// ----------------------------------------------------------
// Stop Session
// ----------------------------------------------------------
export async function stopSession() {
  try {
    if (currentSock) {
      await currentSock.logout().catch(() => {});
      currentSock = null;
      setStatus("idle");
      log("Session stopped manually.", "info");
    }
  } catch (e) {
    console.warn("stopSession error:", e);
  }
}