#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT = Number(process.env.SMOKE_PORT ?? 3100);
const BASE_URL = `http://${HOST}:${PORT}`;
const STARTUP_TIMEOUT_MS = 45000;
const REQUEST_TIMEOUT_MS = 15000;
const SHUTDOWN_TIMEOUT_MS = 5000;
const MAX_LOG_CHARS = 12000;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const fatalOutputPatterns = [
  /can't resolve/i,
  /module not found/i,
  /failed to compile/i,
  /eaddrinuse/i,
  /address already in use/i,
];
const bodyErrorPatterns = [
  /application error/i,
  /internal server error/i,
  /can't resolve/i,
  /module not found/i,
];

let combinedOutput = "";
let shuttingDown = false;

const child = spawn(
  npmCommand,
  ["run", "dev", "--", "--hostname", HOST, "--port", String(PORT)],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      HOSTNAME: HOST,
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const childClosed = new Promise((resolve) => {
  child.once("close", (code, signal) => resolve({ code, signal }));
});

child.stdout.on("data", handleOutput);
child.stderr.on("data", handleOutput);

function handleOutput(chunk) {
  const text = chunk.toString();
  combinedOutput = `${combinedOutput}${text}`.slice(-MAX_LOG_CHARS);
  process.stdout.write(text);
}

function hasFatalOutput() {
  return fatalOutputPatterns.some((pattern) => pattern.test(combinedOutput));
}

function getRelevantOutput() {
  return combinedOutput.trim() || "(no process output captured)";
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/html" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function stopChild() {
  shuttingDown = true;

  if (child.exitCode !== null) {
    await childClosed;
    return;
  }

  child.kill("SIGTERM");

  const forceKillTimer = setTimeout(() => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }, SHUTDOWN_TIMEOUT_MS);

  await childClosed;
  clearTimeout(forceKillTimer);
}

async function waitForHomepage() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = new Error("Timed out waiting for next dev to render the homepage.");

  while (Date.now() < deadline) {
    if (hasFatalOutput()) {
      throw new Error(`next dev emitted a fatal error:\n${getRelevantOutput()}`);
    }

    if (child.exitCode !== null && !shuttingDown) {
      throw new Error(
        `next dev exited before the homepage rendered:\n${getRelevantOutput()}`,
      );
    }

    try {
      const response = await fetchWithTimeout(`${BASE_URL}/`);
      const body = await response.text();

      if (hasFatalOutput()) {
        throw new Error(`next dev emitted a fatal error:\n${getRelevantOutput()}`);
      }

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status} from ${BASE_URL}/.`);
      }

      if (bodyErrorPatterns.some((pattern) => pattern.test(body))) {
        throw new Error("Homepage returned an error document instead of the app shell.");
      }

      if (!body.includes("SentientWeb")) {
        throw new Error("Homepage rendered without the expected SentientWeb content.");
      }

      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(500);
    }
  }

  throw lastError;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await stopChild();
    process.exit(1);
  });
}

try {
  await waitForHomepage();
  console.log(`\nDev smoke test passed at ${BASE_URL}/`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nDev smoke test failed: ${message}`);
  process.exitCode = 1;
} finally {
  await stopChild();
}
