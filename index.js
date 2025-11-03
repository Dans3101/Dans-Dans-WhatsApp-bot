// index.js
// -----------------------------------------------------------------------------
// 🚀 DansBot Main Entry — Express Dashboard + WhatsApp Bot Controller
// -----------------------------------------------------------------------------

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { dashboardRouter } from "./dashboard.js";
import { startSession } from "./botManager.js";
import { log } from "./utils.js";

// --- Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const publicPath = path.join(process.cwd(), "public");

// --- Ensure public folder exists ---
if (!existsSync(publicPath)) mkdirSync(publicPath, { recursive: true });

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicPath));

// --- Routes ---
app.use("/", dashboardRouter);

// --- Health Check (for Render or UptimeRobot) ---
app.get("/health", (req, res) => res.json({ status: "ok" }));

// --- Start Server ---
app.listen(PORT, () => {
  log(`🌐 Dashboard running at: http://localhost:${PORT}`, "success");
  startSession("main"); // auto-start bot session
});