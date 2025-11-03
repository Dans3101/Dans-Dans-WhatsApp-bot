// src/utils.js
import fs from "fs";
import path from "path";
import chalk from "chalk";

export function log(message, level = "info") {
  const time = new Date().toLocaleString();
  const map = {
    info: chalk.cyan,
    success: chalk.green,
    warn: chalk.yellow,
    error: chalk.red
  };
  const color = map[level] || chalk.white;
  console.log(color(`[${time}] ${message}`));
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function saveJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function readJSON(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export const delay = ms => new Promise(r => setTimeout(r, ms));