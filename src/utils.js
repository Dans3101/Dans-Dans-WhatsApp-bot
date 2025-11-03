// utils.js
// -----------------------------------------------------------------------------
// 🔹 Utility Functions for DansBot
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import chalk from "chalk";

// --- Timestamped logger ---
export function log(message, type = "info") {
  const time = new Date().toLocaleTimeString();
  const colors = {
    info: chalk.cyan,
    success: chalk.green,
    error: chalk.red,
    warn: chalk.yellow,
  };
  const color = colors[type] || chalk.white;
  console.log(color(`[${time}] ${message}`));
}

// --- Ensure directory exists ---
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- Write safe file ---
export function saveFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data);
}

// --- Read safe file ---
export function readFileSafe(filePath, fallback = "") {
  try {
    return fs.existsSync(filePath)
      ? fs.readFileSync(filePath, "utf8")
      : fallback;
  } catch {
    return fallback;
  }
}

// --- Delay helper ---
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Format uptime ---
export function formatUptime(ms) {
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / (1000 * 60)) % 60;
  const hrs = Math.floor(ms / (1000 * 60 * 60));
  return `${hrs}h ${min}m ${sec}s`;
}