// src/dashboard.js
import express from "express";
import path from "path";
import { existsSync, readFileSync } from "fs";
import { botStatus } from "./botManager.js";

const router = express.Router();
const PUBLIC = path.join(process.cwd(), "public");

router.get("/", (req, res) => {
  let pairingCode = "";
  const pairingFile = path.join(PUBLIC, "pairing.txt");
  if (existsSync(pairingFile)) pairingCode = readFileSync(pairingFile, "utf8").trim();

  const color = {
    connected: "green",
    connecting: "orange",
    qr: "gold",
    disconnected: "red",
    idle: "gray",
    reconnecting: "gold",
    error: "red"
  }[botStatus.connection] || "gray";

  const emoji = {
    connected: "🟢",
    reconnecting: "🟡",
    connecting: "🟠",
    disconnected: "🔴",
    qr: "🟡",
    idle: "⚪",
    error: "❌"
  }[botStatus.connection] || "⚪";

  res.send(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>DansDan Dashboard</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;text-align:center;padding:28px;background:#f7f8fb}
          .card{display:inline-block;background:#fff;padding:18px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.06);max-width:420px;width:90%;}
          img{border-radius:8px;border:1px solid #ddd}
          .pairing{font-weight:bold;color:green;font-size:18px}
        </style>
      </head>
      <body>
        <h1>🤖 DansDan WhatsApp Bot</h1>
        <div class="card">
          <p>Status: <span style="color:${color}">${emoji} ${botStatus.connection.toUpperCase()}</span></p>
          <p>Last Update: ${new Date(botStatus.lastUpdate).toLocaleString()}</p>
          <hr/>
          <h3>Pairing Code</h3>
          <p class="pairing">${pairingCode || '⌛ Waiting for code...'}</p>
          <h3>QR Code</h3>
          <img src="/qr.png" width="250" id="qr" alt="QR (if available)" />
          <form method="POST" action="/generate" style="margin-top:12px;">
            <input name="phone" placeholder="e.g. 254712345678" style="padding:8px;width:70%" required />
            <button type="submit" style="padding:8px 12px;margin-left:6px">Generate</button>
          </form>
        </div>
        <script>
          setInterval(()=> {
            const img = document.getElementById('qr');
            img.src = '/qr.png?cache='+Date.now();
            fetch('/status').catch(()=>{});
          }, 8000);
        </script>
      </body>
    </html>
  `);
});

// generate pairing code route (handled by botManager via startSession)
router.post("/generate", (req, res) => {
  const body = [];
  req.on("data", chunk => body.push(chunk));
  req.on("end", () => {
    const parsed = new URLSearchParams(Buffer.concat(body).toString());
    const phone = parsed.get("phone")?.trim();
    if (!phone) return res.send("<p>Provide phone</p><a href='/'>Back</a>");
    import("./botManager.js").then(mod => {
      mod.startSession(process.env.SESSION_ID || "main", phone).catch(err => console.error(err));
    });
    res.redirect("/");
  });
});

router.get("/status", (req, res) => {
  res.json(botStatus);
});

router.get("/health", (req, res) => res.json({ status: "ok" }));

export { router as dashboardRouter };
export const dashboard = dashboardRouter; // backwards compat if needed