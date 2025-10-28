#!/usr/bin/env node
/**
 * Placeholder build script.
 *
 * The extension is authored directly in plain JavaScript so that it can run
 * without an extra bundling step. This script exists so `npm run build`
 * succeeds and documents how to produce a production build in the future.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = resolve(__dirname, "..");

if (!existsSync(distDir)) {
  console.error("Extension workspace missing. Expected to find project root.");
  process.exit(1);
}

console.log(
  [
    "LinkMinder build pipeline",
    "========================",
    "The project currently runs without bundling.",
    "When you are ready to add a bundler (e.g. Vite, esbuild),",
    "replace this script with the actual build entry point."
  ].join("\n")
);
