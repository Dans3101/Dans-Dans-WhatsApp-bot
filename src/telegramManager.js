// src/telegramManager.js
// -----------------------------------------------------------------------------
// 🧩 Telegram Manager (Telegraf-based)
// Handles Telegram commands, pairing WhatsApp numbers, and alerts
// -----------------------------------------------------------------------------

import { Telegraf } from "telegraf";
import fs from "fs";
import { log } from "./utils.js";

export let bot = null;
let ADMIN_CHAT_ID = null;

// -----------------------------------------------------------------------------
export async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || null;

  if (!token) throw new Error("❌ TELEGRAM_BOT_TOKEN not set in .env");

  bot = new Telegraf(token);
  ADMIN_CHAT_ID = chatId;

  log("🤖 Telegram bot started successfully (Telegraf)", "success");

  // ───────────────────────────────
  // 🔸 START + HELP COMMANDS
  // ───────────────────────────────
  bot.start((ctx) => {
    ctx.replyWithMarkdown(
      `👋 *Welcome to DansBot Control Panel!*

📋 *Available Commands:*
• /status — Check WhatsApp connection
• /link <phone> — Pair WhatsApp (e.g. /link 254712345678)
• /restart — Restart WhatsApp session
• /stop — Stop WhatsApp session
• /help — Show this help message again`
    );
  });

  bot.help((ctx) => ctx.reply("⚙️ Use /start to see all available commands."));

  // ───────────────────────────────
  // 🔹 STATUS COMMAND
  // ───────────────────────────────
  bot.command("status", async (ctx) => {
    try {
      const { botStatus } = await import("./botManager.js");
      const s = botStatus;
      ctx.replyWithMarkdown(
        `📊 *WhatsApp Status*\n• Connection: ${s.connectionEmoji} ${s.connection}\n• Last Update: ${s.lastUpdate}`
      );
    } catch (err) {
      ctx.reply(`❌ Unable to fetch status: ${err.message}`);
    }
  });

  // ───────────────────────────────
  // 🔹 LINK / PAIR COMMAND
  // ───────────────────────────────
  bot.command("link", async (ctx) => {
    const phone = ctx.message.text.split(" ")[1];
    if (!phone || !/^\d+$/.test(phone)) {
      return ctx.reply("❌ Invalid phone number. Use digits only.");
    }

    ctx.reply(`🔗 Requesting pairing code for ${phone}...`);
    try {
      const { startSession } = await import("./botManager.js");
      await startSession("main", phone);
      ctx.reply("✅ Pairing request sent — QR or code will appear here soon.");
    } catch (err) {
      ctx.reply(`❌ Error linking: ${err.message}`);
    }
  });

  // ───────────────────────────────
  // 🔹 RESTART COMMAND
  // ───────────────────────────────
  bot.command("restart", async (ctx) => {
    ctx.reply("♻️ Restarting WhatsApp session...");
    try {
      const { startSession } = await import("./botManager.js");
      await startSession("main");
      ctx.reply("✅ Restart complete!");
      await sendTelegramAlert("♻️ WhatsApp bot restarted successfully.");
    } catch (err) {
      ctx.reply(`❌ Restart failed: ${err.message}`);
      await sendTelegramAlert(`⚠️ Restart failed: ${err.message}`);
    }
  });

  // ───────────────────────────────
  // 🔹 STOP COMMAND
  // ───────────────────────────────
  bot.command("stop", async (ctx) => {
    ctx.reply("🛑 Stopping WhatsApp session...");
    try {
      const { stopSession } = await import("./botManager.js");
      await stopSession();
      ctx.reply("✅ WhatsApp session stopped.");
      await sendTelegramAlert("🛑 WhatsApp bot has been stopped manually.");
    } catch (err) {
      ctx.reply(`❌ Stop failed: ${err.message}`);
      await sendTelegramAlert(`⚠️ Stop failed: ${err.message}`);
    }
  });

  // ───────────────────────────────
  // 📨 GENERIC MESSAGE HANDLER
  // ───────────────────────────────
  bot.on("message", async (ctx) => {
    if (!ctx.message.text.startsWith("/")) {
      ctx.reply("⚙️ Use /start to see the available commands.");
    }
  });

  // ───────────────────────────────
  // ✅ LAUNCH TELEGRAM BOT
  // ───────────────────────────────
  bot.launch();
  log("✅ Telegram bot is live and polling for updates.", "success");
}

// -----------------------------------------------------------------------------
// 🔔 Global alert helpers
// -----------------------------------------------------------------------------
export async function sendTelegramMessage(message) {
  try {
    if (!bot || !ADMIN_CHAT_ID) return;
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Telegram message error:", err.message);
  }
}

export async function sendTelegramPhoto(filePath, caption = "") {
  try {
    if (!bot || !ADMIN_CHAT_ID || !fs.existsSync(filePath)) return;
    await bot.telegram.sendPhoto(ADMIN_CHAT_ID, { source: filePath }, { caption });
  } catch (err) {
    console.error("Telegram photo send error:", err.message);
  }
}

export async function sendTelegramAlert(message) {
  await sendTelegramMessage(`📢 <b>ALERT</b>\n${message}`);
}