// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

import { dashboardRouter } from "./src/dashboard.js";
import { startSession } from "./src/botManager.js";
import { initTelegramBot, sendTelegramMessage } from "./src/telegramManager.js";
import { log } from "./src/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), "public");

// Ensure public folder exists
if (!existsSync(publicPath)) mkdirSync(publicPath, { recursive: true });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(publicPath));

// mount dashboard routes
app.use("/", dashboardRouter);

// health
app.get("/health", (_, res) => res.json({ status: "ok" }));

// start
app.listen(PORT, async () => {
  log(`🌐 Server running on port ${PORT}`, "success");
  // init Telegram (optional)
  try {
    await initTelegramBot();
  } catch (e) {
    console.warn("Telegram init error:", e?.message || e);
  }

  // start WhatsApp session (auto)
  try {
    await startSession(process.env.SESSION_ID || "main");
    sendTelegramMessage("✅ DansDan bot started (WhatsApp session attempt).").catch(()=>{});
  } catch (e) {
    console.error("Failed to startSession on boot:", e);
    sendTelegramMessage(`❌ Bot failed to start: ${e?.message || e}`).catch(()=>{});
  }
});