#!/usr/bin/env node
/**
 * Start script: ensure DATABASE_URL has sslmode for Railway, wait for DB, retry migrate, then next start.
 */
const { execSync } = require("child_process");

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

let url = process.env.DATABASE_URL;
if (url && /\.(proxy\.rlwy\.net|railway\.internal)/.test(url)) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
    if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "30");
    process.env.DATABASE_URL = u.toString();
    console.log("[start] DATABASE_URL: sslmode=require, connect_timeout=30");
  } catch (_) {
    const extra = (url.includes("?") ? "&" : "?") + "sslmode=require&connect_timeout=30";
    process.env.DATABASE_URL = url + extra;
    console.log("[start] DATABASE_URL: appended sslmode + connect_timeout");
  }
}

// Wait for DB container / DNS to be ready (Railway may start app and DB in parallel)
const initialWait = 20;
console.log("[start] waiting " + initialWait + "s for DB to be ready...");
sleep(initialWait * 1000);

const maxAttempts = 5;
const delayMs = 10000;

let migrateOk = false;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    console.log("[start] prisma migrate deploy (attempt " + attempt + "/" + maxAttempts + ")");
    execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
    migrateOk = true;
    break;
  } catch (e) {
    if (attempt === maxAttempts) {
      console.error("[start] migrate failed after " + maxAttempts + " attempts");
      if (process.env.RAILWAY_SKIP_MIGRATE_ON_FAIL === "1") {
        console.warn("[start] RAILWAY_SKIP_MIGRATE_ON_FAIL=1: starting app anyway (DB may be unreachable)");
        break;
      }
      process.exit(1);
    }
    console.warn("[start] migrate failed, retrying in " + delayMs / 1000 + " s...");
    sleep(delayMs);
  }
}

console.log("[start] starting Next.js");
execSync("next start", { stdio: "inherit", env: process.env });
