#!/usr/bin/env node
/**
 * Sync generated layout prop matrix sections in doc/specs/LAYOUT_PROPS.md
 * from packages/layout/dist/layout-props.js (build @bindtty/layout first).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(root, "doc/specs/LAYOUT_PROPS.md");
const layoutPropsUrl = pathToFileURL(
  path.join(root, "packages/layout/dist/layout-props.js")
).href;

const {
  matrixLayoutProps,
  yogaSupportedPropsByTag,
  basicSupportedPropsByTag,
  futureLayoutProps,
  nonLayoutElementTags,
  getLayoutPropMatrixStatus
} = await import(layoutPropsUrl);

const tags = Object.keys(yogaSupportedPropsByTag).filter(
  (tag) => !nonLayoutElementTags.has(tag)
);
const statusSymbol = { supported: "✅", future: "⛔", na: "—" };

function matrixSymbol(tag, prop, engine) {
  if (nonLayoutElementTags.has(tag)) {
    return "🚫";
  }

  return statusSymbol[getLayoutPropMatrixStatus(tag, prop, engine)];
}

function yogaMatrixTable() {
  const header = `| prop | ${tags.join(" | ")} |`;
  const divider = `| --- | ${tags.map(() => "---").join(" | ")} |`;
  const rows = matrixLayoutProps.map(
    (prop) => `| \`${prop}\` | ${tags.map((tag) => matrixSymbol(tag, prop, "yoga")).join(" | ")} |`
  );

  return [header, divider, ...rows].join("\n");
}

function basicMatrixTable() {
  const rows = tags.map((tag) => {
    const supported = basicSupportedPropsByTag[tag];

    if (nonLayoutElementTags.has(tag)) {
      return `| \`${tag}\` | schema 有定义；layout 仍 🚫 |`;
    }

    if (supported.size === 0) {
      return `| \`${tag}\` | （无 layout props） |`;
    }

    const props = [...supported].sort().map((prop) => `\`${prop}\``).join(", ");
    return `| \`${tag}\` | ${props} |`;
  });

  return ["| tag | 已支持 props |", "| --- | --- |", ...rows].join("\n");
}

function futurePropsList() {
  return [...futureLayoutProps]
    .sort()
    .map((prop) => `- \`${prop}\``)
    .join("\n");
}

function replaceBetweenMarkers(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Missing markers in LAYOUT_PROPS.md: ${startMarker} / ${endMarker}`);
  }

  const before = source.slice(0, start + startMarker.length);
  const after = source.slice(end);
  return `${before}\n\n${replacement.trim()}\n\n${after}`;
}

let spec = fs.readFileSync(specPath, "utf8");

spec = replaceBetweenMarkers(
  spec,
  "<!-- layout-props:matrix:yoga:start -->",
  "<!-- layout-props:matrix:yoga:end -->",
  yogaMatrixTable()
);

spec = replaceBetweenMarkers(
  spec,
  "<!-- layout-props:matrix:basic:start -->",
  "<!-- layout-props:matrix:basic:end -->",
  basicMatrixTable()
);

spec = replaceBetweenMarkers(
  spec,
  "<!-- layout-props:future:start -->",
  "<!-- layout-props:future:end -->",
  futurePropsList()
);

fs.writeFileSync(specPath, spec);
console.log(`updated ${path.relative(root, specPath)}`);
