import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

if (manifest.version !== pkg.version) {
  throw new Error(`manifest.json (${manifest.version}) y package.json (${pkg.version}) no coinciden.`);
}

const bundle = statSync("main.js");
if (bundle.size < 1000) {
  throw new Error("main.js no parece el resultado de npm run build.");
}

mkdirSync("release", { recursive: true });
copyFileSync("main.js", "release/main.js");
copyFileSync("manifest.json", "release/manifest.json");

console.info(`Listos release/main.js y release/manifest.json para la etiqueta ${manifest.version}.`);
console.info("Este plugin no tiene styles.css.");
