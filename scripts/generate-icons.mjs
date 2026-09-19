import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const svgPath = join(__dirname, "..", "public", "logos", "logo-premium-1.svg");
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath, "utf8");

const sizes = [1024, 512, 192];

for (const size of sizes) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: size,
    },
  });
  const pngData = resvg.render().asPng();
  const outPath = join(outDir, `icon-${size}.png`);
  writeFileSync(outPath, pngData);
}

console.log("Icons generated:", sizes.map((s) => `icon-${s}.png`).join(", "));
