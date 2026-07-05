import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docDir = path.join(root, "doc");
const distDir = path.join(docDir, ".vitepress", "dist");

const navBlockRe = /::: info 本章导航\n([\s\S]*?)\n:::/g;
const anchorRe = /\]\(#([^)]+)\)/g;

function docPathToHtml(mdPath) {
  const rel = path.relative(docDir, mdPath).replace(/\\/g, "/");
  const base = rel.replace(/\.md$/, "");
  if (base === "index") {
    return path.join(distDir, "index.html");
  }
  return path.join(distDir, `${base}.html`);
}

function extractHeadingIds(html) {
  const ids = new Set();
  const re = /<h[23][^>]*id="([^"]+)"/g;
  let match;

  while ((match = re.exec(html)) !== null) {
    ids.add(match[1]);
  }

  return ids;
}

function collectMarkdownFiles(dir) {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "archive" || entry.name === "redirects") {
      continue;
    }

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(full));
      continue;
    }

    if (entry.name.endsWith(".md")) {
      files.push(full);
    }
  }

  return files;
}

const failures = [];

for (const mdPath of collectMarkdownFiles(docDir)) {
  const md = fs.readFileSync(mdPath, "utf8");
  const blocks = [...md.matchAll(navBlockRe)];

  if (blocks.length === 0) {
    continue;
  }

  const htmlPath = docPathToHtml(mdPath);

  if (!fs.existsSync(htmlPath)) {
    failures.push({ file: mdPath, anchor: null, reason: `missing build output: ${path.relative(root, htmlPath)}` });
    continue;
  }

  const ids = extractHeadingIds(fs.readFileSync(htmlPath, "utf8"));
  const rel = path.relative(docDir, mdPath).replace(/\\/g, "/");

  for (const block of blocks) {
    for (const match of block[1].matchAll(anchorRe)) {
      const anchor = decodeURIComponent(match[1]);

      if (!ids.has(anchor)) {
        failures.push({ file: rel, anchor, reason: "heading id not found in rendered page" });
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Chapter nav anchor check failed:\n");

  for (const { file, anchor, reason } of failures) {
    console.error(`  - ${file}#${anchor ?? ""}: ${reason}`);
  }

  process.exit(1);
}

console.log("Chapter nav anchor check passed.");
