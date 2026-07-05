import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docDir = path.join(root, "doc");

const navBlockRe = /(::: info 本章导航\r?\n)([\s\S]*?)(\r?\n:::)/g;

/** VitePress prefixes numeric h2 slugs with `_`. */
function fixNavAnchors(body) {
  return body.replace(/\]\(#(\d+)-/g, "](#_$1-");
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "archive" || entry.name === "redirects") {
      continue;
    }

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (!entry.name.endsWith(".md")) {
      continue;
    }

    const original = fs.readFileSync(full, "utf8");
    const updated = original.replace(navBlockRe, (_match, open, body, close) => {
      return open + fixNavAnchors(body) + close;
    });

    if (updated !== original) {
      fs.writeFileSync(full, updated);
      console.log("updated", path.relative(root, full));
    }
  }
}

walk(docDir);
