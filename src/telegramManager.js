// src/telegramManager.js
import { Telegraf } from "telegraf";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let bot = null;
let enabled = false;

export async function initTelegramBot() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("⚠️ Telegram not configured (TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing).");
    enabled = false;
    return;
  }
  bot = new Telegraf(TELEGRAM_TOKEN);
  enabled = true;

  // simple commands for control
  bot.start(async (ctx) => {
    await ctx.reply("🤖 DansDan Telegram bridge active. You will receive QR/pairing notifications here.");
  });

  bot.command("status", async (ctx) => {
    await ctx.reply("📡 Status command received. Use the web dashboard for details.");
  });

  // Launch bot (long polling)
  try {
    await bot.launch({ dropPendingUpdates: true });
    console.log("📨 Telegram bot started (Telegraf).");
  } catch (e) {
    console.warn("⚠️ Telegram bot launch error:", e?.message || e);
  }

  // graceful shutdown
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

export async function sendTelegramMessage(text) {
  if (!enabled || !bot) return;
  try {
    await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: "HTML" });
  } catch (err) {
    console.error("❌ Telegram sendMessage error:", err?.message || err);
  }
}

export async function sendTelegramPhoto(filePath, caption = "") {
  if (!enabled || !bot) return;
  try {
    if (!fs.existsSync(filePath)) {
      console.warn("sendTelegramPhoto: file not found:", filePath);
      return;
    }
    await bot.telegram.sendPhoto(TELEGRAM_CHAT_ID, { source: fs.createReadStream(filePath) }, { caption });
  } catch (err) {
    console.error("❌ Telegram sendPhoto error:", err?.message || err);
  }
}