import * as esbuild from "esbuild";
import { collectPlugins } from "./collect-plugins.mjs";
import { copyStatic } from "./copy-static.mjs";
import { existsSync, readdirSync } from "fs";

export function collectPlugins() {
  const entries = readdirSync("plugins", {
    withFileTypes: true,
  });
  const plugins = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      plugins.push({
        in: `plugins/${entry.name}`,
        out: entry.name.replace(/\.ts$/, ""),
      });
    } else if (entry.isDirectory()) {
      if (existsSync(`plugins/${entry.name}/index.ts`)) {
        plugins.push({
          in: `plugins/${entry.name}/index.ts`,
          out: entry.name,
        });
      }
    }
  }
  return plugins;
}

const plugins = collectPlugins();
const shared = { bundle: true, format: "iife" };

await Promise.all([
  esbuild.build({ ...shared, entryPoints: plugins, outdir: "dist/plugins" }),
  esbuild.build({ ...shared, entryPoints: ["content.ts"], outfile: "dist/content.js" }),
  esbuild.build({ ...shared, entryPoints: ["popup.ts"], outfile: "dist/popup.js" }),
  esbuild.build({ ...shared, entryPoints: ["importer.ts"], outfile: "dist/importer.js" }),
  esbuild.build({ ...shared, entryPoints: ["onboarding.ts"], outfile: "dist/onboarding.js" }),
  esbuild.build({ ...shared, entryPoints: ["background.ts"], outfile: "dist/background.js" }),
]);

copyStatic();
console.log("[Exterstellar | Build] Done.");