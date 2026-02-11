#!/usr/bin/env node
/**
 * Start script: ensure DATABASE_URL has sslmode=require for Railway, retry migrate, then next start.
 */
const { execSync } = require("child_process");

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

const url = process.env.DATABASE_URL;
if (url && /\.(proxy\.rlwy\.net|railway\.internal)/.test(url) && !url.includes("sslmode=")) {
  try {
    const u = new URL(url);
    u.searchParams.set("sslmode", "require");
    process.env.DATABASE_URL = u.toString();
    console.log("[start] DATABASE_URL: added sslmode=require for Railway");
  } catch (_) {
    process.env.DATABASE_URL = url + (url.includes("?") ? "&" : "?") + "sslmode=require";
    console.log("[start] DATABASE_URL: appended sslmode=require");
  }
}

const maxAttempts = 3;
const delayMs = 5000;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    console.log("[start] prisma migrate deploy (attempt " + attempt + "/" + maxAttempts + ")");
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
    break;
  } catch (e) {
    if (attempt === maxAttempts) {
      console.error("[start] migrate failed after " + maxAttempts + " attempts");
      process.exit(1);
    }
    console.warn("[start] migrate failed, retrying in " + delayMs / 1000 + " s...");
    sleep(delayMs);
  }
}

console.log("[start] starting Next.js");
execSync("next start", { stdio: "inherit", env: process.env });
