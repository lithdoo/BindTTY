#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readFixture,
  requiredFixtureNames,
  validateFixture
} from "./windows-input-fixture.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultFixtureDirectory = path.resolve(
  scriptDirectory,
  "..",
  "fixtures",
  "windows-input"
);
const requestedTargets = process.argv.slice(2);
const targets = requestedTargets.length > 0
  ? requestedTargets
  : requiredFixtureNames.map((name) => path.join(defaultFixtureDirectory, name));

{
  let failed = false;

  for (const target of targets) {
    let records;
    try {
      records = readFixture(target);
    } catch (error) {
      failed = true;
      console.error(`${target}: ${error.message}`);
      continue;
    }
    const errors = validateFixture(records, target);
    if (errors.length > 0) {
      failed = true;
      for (const error of errors) {
        console.error(error);
      }
      continue;
    }

    console.log(`${target}: valid (${records.length} records)`);
  }

  if (failed) {
    process.exitCode = 1;
  }
}
