// -----------------------------------------------------------------------------
// 📊 DASHBOARD.JS — Live Web Dashboard for DansBot WhatsApp Connection
// -----------------------------------------------------------------------------

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { botStatus, startSession } from "./botManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const publicPath = path.join(process.cwd(), "public");

// ensure public directory exists
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);

// ----------------------------------------------------------------------------
// ROUTE: Main Dashboard (Status + QR + Pairing Code)
// ----------------------------------------------------------------------------
router.get("/", (req, res) => {
  let pairingCode = "";
  const pairingFile = path.join(publicPath, "pairing.txt");
  if (fs.existsSync(pairingFile)) pairingCode = fs.readFileSync(pairingFile, "utf8").trim();

  const statusColors = {
    connected: "green",
    connecting: "orange",
    reconnecting: "gold",
    disconnected: "red",
    idle: "gray",
  };

  const color = statusColors[botStatus.connection] || "gray";
  const emoji =
    botStatus.connection === "connected"
      ? "🟢"
      : botStatus.connection === "reconnecting"
      ? "🟡"
      : botStatus.connection === "connecting"
      ? "🟠"
      : botStatus.connection === "disconnected"
      ? "🔴"
      : "⚪";

  res.send(`
    <html>
      <head>
        <title>DansBot Dashboard</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 40px;
            background: #fafafa;
          }
          h1 { color: #222; }
          h2 { color: ${color}; }
          .card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin: 20px auto;
            max-width: 450px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          }
          .pairing {
            font-size: 22px;
            color: green;
            font-weight: bold;
          }
          input, button {
            padding: 8px;
            font-size: 14px;
          }
          button {
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          }
          button:hover {
            background: #0056b3;
          }
        </style>
      </head>
      <body>
        <h1>DansBot WhatsApp Dashboard</h1>
        <div class="card">
          <h2>Status: ${emoji} ${botStatus.connection.toUpperCase()}</h2>
          <p>Last update: ${new Date(botStatus.lastUpdate).toLocaleString()}</p>
        </div>

        <div class="card">
          <h3>Pairing Code</h3>
          <p class="pairing">${pairingCode || "⌛ Waiting for code..."}</p>
        </div>

        <div class="card">
          <h3>QR Code Login</h3>
          <img src="/qr.png" width="250" style="border:1px solid #ccc; border-radius:8px;">
        </div>

        <div class="card">
          <h3>Generate Pairing Code</h3>
          <form method="POST" action="/generate">
            <input type="text" name="phone" placeholder="e.g. 254712345678" required>
            <button type="submit">Generate</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

// ----------------------------------------------------------------------------
// ROUTE: Generate Pairing Code
// ----------------------------------------------------------------------------
router.post("/generate", (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.send("<p>❌ Please provide a phone number.</p><a href='/'>Go back</a>");
  }
  startSession("main", phone.trim());
  res.redirect("/");
});

// ----------------------------------------------------------------------------
// ROUTE: Status API (JSON)
// ----------------------------------------------------------------------------
router.get("/status", (req, res) => {
  res.json(botStatus);
});

// ----------------------------------------------------------------------------
// ROUTE: Health Check (for Render uptime monitor)
// ----------------------------------------------------------------------------
router.get("/health", (req, res) => res.json({ status: "ok" }));

// ----------------------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------------------
export const dashboard = router;
export default router;