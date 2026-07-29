#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataUrl = pathToFileURL(
  path.join(root, "packages/vnode/dist/template/element-metadata.js")
).href;
const { layoutPropMetadata } = await import(metadataUrl);
const jsxSource = fs.readFileSync(
  path.join(root, "packages/jsx-runtime/src/jsx-runtime.ts"),
  "utf8"
);
const missing = [];

for (const metadata of Object.values(layoutPropMetadata)) {
  if (metadata.future === true) {
    continue;
  }
  for (const name of [metadata.canonical, ...(metadata.aliases ?? [])]) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const propertyPattern = new RegExp(
      `(?:^|\\n)\\s*(?:["']${escaped}["']|${escaped})\\??\\s*:`,
      "m"
    );
    if (!propertyPattern.test(jsxSource)) {
      missing.push(name);
    }
  }
}

if (missing.length > 0) {
  throw new Error(
    `JSX intrinsic layout props missing metadata keys: ${missing.join(", ")}`
  );
}

console.log("Element metadata and JSX intrinsic prop keys are consistent.");
