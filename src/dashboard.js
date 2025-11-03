// src/dashboard.js
// -----------------------------------------------------
// 🌐 Web Dashboard Route
// -----------------------------------------------------

import fs from "fs";
import path from "path";

export function setupDashboard(app) {
  app.get("/health", (_, res) => res.send("OK"));

  app.get("/", (_, res) => {
    const qrExists = fs.existsSync("./public/qr.png");
    res.send(`
      <html>
        <head><title>DansDan Bot</title></head>
        <body style="font-family:sans-serif;text-align:center;margin-top:40px">
          <h2>🤖 DansDan WhatsApp Bot</h2>
          <p>Status: ${qrExists ? "🟡 Awaiting Connection" : "✅ Connected or Waiting"}</p>
          ${qrExists ? `<img src="/qr.png" width="250"/>` : ""}
          <p><small>Last Update: ${new Date().toLocaleString()}</small></p>
        </body>
      </html>
    `);
  });
}