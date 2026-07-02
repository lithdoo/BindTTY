#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function toWslPath(winPath) {
  const normalized = path.resolve(winPath).replace(/\\/g, "/");

  if (/^[A-Za-z]:/.test(normalized)) {
    const drive = normalized[0].toLowerCase();
    return `/mnt/${drive}${normalized.slice(2)}`;
  }

  return normalized;
}

function listWslDistros() {
  const result = spawnSync("wsl", ["-l", "-q"], { encoding: "utf8" });

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/\u0000/g, "").trim())
    .filter((line) => line.length > 0 && !line.toLowerCase().includes("docker"));
}

function orderDistros(distros) {
  const preferred = ["Ubuntu-24.04", "Ubuntu", "Ubuntu-22.04"];
  const ordered = [];

  for (const name of preferred) {
    const match = distros.find((distro) => distro.toLowerCase() === name.toLowerCase());

    if (match) {
      ordered.push(match);
    }
  }

  for (const distro of distros) {
    if (!ordered.includes(distro)) {
      ordered.push(distro);
    }
  }

  return ordered;
}

const wslPackageRoot = toWslPath(packageRoot);
const nvmSetup =
  'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true';
const command = [
  nvmSetup,
  `cd ${JSON.stringify(wslPackageRoot)}`,
  "command -v node >/dev/null 2>&1 || { echo 'Node.js not found in WSL (install via nvm: nvm install 22)'; exit 127; }",
  "npm install",
  "npm test"
].join(" && ");

console.log("BindTTY real-terminal E2E — WSL runner");
console.log(`wslPackageRoot=${wslPackageRoot}`);

const distros = orderDistros(listWslDistros());

if (distros.length === 0) {
  console.error("No non-Docker WSL distribution found.");
  console.error("Install Ubuntu from Microsoft Store, then run inside WSL:");
  console.error("  cd packages/e2e && npm install && npm test");
  process.exit(1);
}

for (const distro of distros) {
  console.log(`tryingDistro=${distro}`);

  const result = spawnSync("wsl", ["-d", distro, "-e", "bash", "-lc", command], {
    stdio: "inherit",
    env: {
      ...process.env,
      BINDTTY_E2E_HOST: "wsl"
    }
  });

  if (result.status === 127) {
    continue;
  }

  process.exit(result.status ?? 1);
}

console.error("No WSL distribution with Node.js was able to run the suite.");
console.error("Install Node.js inside your Linux distro, then rerun:");
console.error("  npm run test:e2e:real:wsl  # from repo root");
process.exit(1);
