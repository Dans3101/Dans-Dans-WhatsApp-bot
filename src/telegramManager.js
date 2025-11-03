// src/telegramManager.js
// Simple Telegram integration using Telegraf.
// Exposes: initTelegramBot(), sendTelegramMessage(), sendTelegramPhoto()

import { Telegraf } from 'telegraf';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // numeric or string chat id

let bot = null;
let enabled = false;

export function initTelegramBot() {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('⚠️ Telegram not configured (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Telegram features disabled.');
    enabled = false;
    return;
  }

  bot = new Telegraf(TELEGRAM_TOKEN);
  enabled = true;

  // simple command handlers (you can extend)
  bot.command('start', async (ctx) => {
    await ctx.reply('🤖 DansDan Telegram bridge is active. You will receive QR/pairing notifications here.');
  });

  bot.command('status', async (ctx) => {
    await ctx.reply('📡 Status request received. Check the web dashboard or /status endpoint for live info.');
  });

  // do NOT use polling in Render; use bot.launch() but stop webhook/polling issues:
  // Telegraf will try to use long polling which is OK for many hosts. If you prefer no polling, set polling:false
  try {
    bot.launch({ dropPendingUpdates: true }).then(() => {
      console.log('📨 Telegram bot launched (Telegraf).');
    }).catch((e) => {
      console.warn('⚠️ Telegram launch warning:', e?.message || e);
    });
  } catch (e) {
    console.warn('⚠️ Telegram launch failed:', e?.message || e);
  }

  // graceful stop on exit
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

export async function sendTelegramMessage(text) {
  if (!enabled || !bot) return;
  try {
    await bot.telegram.sendMessage(TELEGRAM_CHAT_ID, text, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('❌ Failed to send Telegram message:', err?.message || err);
  }
}

export async function sendTelegramPhoto(filePath, caption = '') {
  if (!enabled || !bot) return;
  try {
    if (!fs.existsSync(filePath)) {
      console.warn('⚠️ sendTelegramPhoto: file does not exist:', filePath);
      return;
    }
    await bot.telegram.sendPhoto(TELEGRAM_CHAT_ID, { source: fs.createReadStream(filePath) }, { caption });
  } catch (err) {
    console.error('❌ Failed to send Telegram photo:', err?.message || err);
  }
}

export async function sendTelegramFile(filePath, caption = '') {
  if (!enabled || !bot) return;
  try {
    if (!fs.existsSync(filePath)) {
      console.warn('⚠️ sendTelegramFile: file does not exist:', filePath);
      return;
    }
    await bot.telegram.sendDocument(TELEGRAM_CHAT_ID, { source: fs.createReadStream(filePath) }, { caption });
  } catch (err) {
    console.error('❌ Failed to send Telegram file:', err?.message || err);
  }
}
