// src/telegramManager.js
import TelegramBot from "node-telegram-bot-api";
import { log } from "./utils.js";
import fs from "fs";

export let bot = null;
export let ADMIN_CHAT_ID = null;

export async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const envChatId = process.env.TELEGRAM_CHAT_ID || null;

  if (!token) throw new Error("❌ TELEGRAM_BOT_TOKEN not set in .env");

  bot = new TelegramBot(token, { polling: true });
  ADMIN_CHAT_ID = envChatId;

  log("🤖 Telegram bot started with polling", "success");

  // --- /start ---
  bot.onText(/^\/start$/, async (msg) => {
    if (!ADMIN_CHAT_ID) {
      ADMIN_CHAT_ID = msg.chat.id;
      log(`💬 Detected new admin chat ID: ${ADMIN_CHAT_ID}`, "info");
      await bot.sendMessage(
        ADMIN_CHAT_ID,
        "✅ Admin chat linked automatically.\nI'll send all alerts here."
      );
    }

    const helpText = `👋 *Welcome to DansBot Control Panel!*

Use the commands below to control your WhatsApp bot:

📋 *Commands available:*
• /status — Check WhatsApp connection
• /link <phone> — Generate WhatsApp pairing code (e.g. /link 254712345678)
• /restart — Restart WhatsApp session
• /stop — Stop current session
• /help — Show this help again`;

    await bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
  });

  // --- /help ---
  bot.onText(/^\/help$/, async (msg) => {
    bot.emit("text", { chat: msg.chat });
  });

  // --- /status ---
  bot.onText(/^\/status$/, async (msg) => {
    const { botStatus } = await import("./botManager.js");
    const s = botStatus;
    const text = `📊 *WhatsApp Status*
• Connection: ${s.connectionEmoji} ${s.connection}
• Last Update: ${s.lastUpdate}`;
    await bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  });

  // --- /link ---
  bot.onText(/^\/link (.+)$/, async (msg, match) => {
    const phone = match[1].trim();
    if (!/^\d+$/.test(phone)) {
      return bot.sendMessage(msg.chat.id, "❌ Invalid phone number. Use digits only.");
    }
    await bot.sendMessage(msg.chat.id, `🔗 Requesting pairing code for ${phone}...`);
    try {
      const { startSession } = await import("./botManager.js");
      await startSession("main", phone);
      await bot.sendMessage(msg.chat.id, "✅ Pairing request sent — check here for QR or code soon.");
      sendTelegramMessage(`📞 Pairing initiated for: ${phone}`);
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
      sendTelegramMessage(`❌ Pairing failed: ${err.message}`);
    }
  });

  // --- /restart ---
  bot.onText(/^\/restart$/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "♻️ Restarting WhatsApp session...");
    try {
      const { startSession } = await import("./botManager.js");
      await startSession("main");
      await bot.sendMessage(msg.chat.id, "✅ Restart complete!");
      sendTelegramMessage("🔁 WhatsApp session restarted successfully.");
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Restart failed: ${err.message}`);
      sendTelegramMessage(`❌ Restart failed: ${err.message}`);
    }
  });

  // --- /stop ---
  bot.onText(/^\/stop$/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "🛑 Stopping WhatsApp session...");
    try {
      const { stopSession } = await import("./botManager.js");
      await stopSession();
      await bot.sendMessage(msg.chat.id, "✅ Session stopped.");
      sendTelegramMessage("🛑 WhatsApp session stopped manually.");
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Stop failed: ${err.message}`);
      sendTelegramMessage(`❌ Stop failed: ${err.message}`);
    }
  });

  // --- Catch-all ---
  bot.on("message", async (msg) => {
    if (!msg.text.startsWith("/")) {
      await bot.sendMessage(msg.chat.id, "⚙️ Use /start to see available commands.");
    }
  });

  return bot;
}

// --- Global send helpers ---
export async function sendTelegramMessage(message) {
  try {
    if (!bot || !ADMIN_CHAT_ID) return;
    await bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Telegram send error:", err.message);
  }
}

export async function sendTelegramPhoto(filePath, caption = "") {
  try {
    if (!bot || !ADMIN_CHAT_ID) return;
    if (!fs.existsSync(filePath)) return;
    await bot.sendPhoto(ADMIN_CHAT_ID, filePath, { caption });
  } catch (err) {
    console.error("Telegram photo send error:", err.message);
  }
}