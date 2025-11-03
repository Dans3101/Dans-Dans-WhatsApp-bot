// -----------------------------------------------------------------------------
// 🌍 INDEX.JS — Entry Point for DansDan WhatsApp Bot + Dashboard + Telegram Link
// -----------------------------------------------------------------------------

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

import dashboard from "./src/dashboard.js"; // ✅ fixed import (matches dashboard.js)
import { startSession } from "./src/botManager.js";
import { initTelegramBot, sendTelegramMessage } from "./src/telegramManager.js";
import { log } from "./src/utils.js";

// -----------------------------------------------------------------------------
// ENV + PATH SETUP
// -----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), "public");

// ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath, { recursive: true });

// -----------------------------------------------------------------------------
// MIDDLEWARES
// -----------------------------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(publicPath));

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------
app.use("/", dashboard);

// health check
app.get("/health", (_, res) => res.json({ status: "ok" }));

// -----------------------------------------------------------------------------
// START SERVER
// -----------------------------------------------------------------------------
app.listen(PORT, async () => {
  log(`🌐 Server running at http://localhost:${PORT}`, "success");

  // Initialize Telegram (optional)
  try {
    await initTelegramBot();
    log("📨 Telegram Bot initialized successfully.", "info");
  } catch (err) {
    console.warn("⚠️ Telegram initialization failed:", err?.message || err);
  }

  // Start WhatsApp session
  try {
    await startSession(process.env.SESSION_ID || "main");
    await sendTelegramMessage("✅ DansDan bot started — WhatsApp session initialized.");
  } catch (err) {
    console.error("❌ Failed to start WhatsApp session:", err);
    await sendTelegramMessage(`❌ Bot failed to start WhatsApp session:\n${err?.message || err}`);
  }
});