import { readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = path.join(root, "packages");
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
]);
const importPattern =
  /(?:from\s*|import\s*\(\s*|require\(\s*)["']([^"'./][^"']*)["']/g;

function sourceFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory)) {
    const absolute = path.join(directory, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      result.push(...sourceFiles(absolute));
    } else if (/\.[cm]?[jt]sx?$/.test(entry)) {
      result.push(absolute);
    }
  }
  return result;
}

function packageName(specifier) {
  if (specifier.startsWith("@")) {
    return specifier.split("/").slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

const failures = [];
for (const entry of readdirSync(packagesRoot)) {
  const directory = path.join(packagesRoot, entry);
  const manifestPath = path.join(directory, "package.json");
  const sourceRoot = path.join(directory, "src");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    continue;
  }
  try {
    if (!statSync(sourceRoot).isDirectory()) continue;
  } catch {
    continue;
  }

  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {})
  ]);

  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const dependency = packageName(match[1]);
      if (builtins.has(dependency) || builtins.has(match[1])) continue;
      if (!declared.has(dependency)) {
        failures.push(
          `${path.relative(root, file)} imports ${dependency}, but ${manifest.name} does not declare it`
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Package dependency check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Package dependency check passed.");
