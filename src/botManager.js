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
    await sendTelegramMessage("📲 <b>New WhatsApp QR code generated!</b>");
    await sendTelegramPhoto(qrPath, "Scan this QR to link WhatsApp.");
  } catch (e) {
    console.error("Failed to save QR:", e);
  }
}

function savePairing(code) {
  try {
    const f = path.join(PUBLIC_DIR, "pairing.txt");
    fs.writeFileSync(f, code, "utf8");
    log("Pairing code saved to " + f, "info");
    sendTelegramMessage(`<b>🔗 New WhatsApp Pairing Code</b>\n<code>${code}</code>`).catch(()=>{});
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
  await sendTelegramMessage(`🟠 Starting WhatsApp session <b>${sessionId}</b>...`);

  try {
    const sessionDir = path.join(AUTH_ROOT, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] }));

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
        }

        if (connection === "open") {
          setStatus("connected");
          log("WhatsApp connected", "success");
          await sendTelegramMessage("🟢 <b>WhatsApp connected successfully!</b>");
          const pairingFile = path.join(PUBLIC_DIR, "pairing.txt");
          if (fs.existsSync(pairingFile)) fs.unlinkSync(pairingFile);
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : lastDisconnect?.error?.statusCode || "unknown";

          log("Connection closed. code=" + statusCode, "warn");
          setStatus("disconnected", { lastError: statusCode });
          await sendTelegramMessage(`🔴 WhatsApp disconnected (code: ${statusCode})`);

          if (statusCode === DisconnectReason.loggedOut) {
            await sendTelegramMessage("⚠️ Session logged out — manual re-link required.");
            currentSock = null;
            return;
          }

          reconnectTimer = setTimeout(() => {
            log("Attempting reconnect...", "info");
            setStatus("reconnecting");
            sendTelegramMessage("🟡 Reconnecting WhatsApp...").catch(()=>{});
            startSession(sessionId, phoneNumber);
          }, 3000);
        }
      } catch (e) {
        console.error("connection.update handler error:", e);
        setStatus("error", { lastError: String(e) });
        sendTelegramMessage(`❌ connection.update error: ${e.message || e}`).catch(()=>{});
      }
    });

    if (phoneNumber) {
      try {
        const pairingFile = path.join(PUBLIC_DIR, "pairing.txt");
        if (fs.existsSync(pairingFile)) fs.unlinkSync(pairingFile);
        const code = await sock.requestPairingCode(phoneNumber);
        savePairing(code);
        setStatus("qr");
      } catch (err) {
        console.error("Pairing request failed:", err);
        setStatus("error", { lastError: String(err) });
        sendTelegramMessage(`❌ Pairing code error: ${err.message || err}`).catch(()=>{});
      }
    }

    return sock;
  } catch (err) {
    console.error("startSession fatal error:", err);
    setStatus("error", { lastError: String(err) });
    sendTelegramMessage(`❌ startSession error: ${err.message || err}`).catch(()=>{});
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
      await sendTelegramMessage("🛑 WhatsApp session stopped manually.");
    }
  } catch (e) {
    console.warn("stopSession error:", e);
  }
}