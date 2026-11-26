import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? "";
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

if (tag !== manifest.version || pkg.version !== manifest.version) {
  console.error(
    `La etiqueta «${tag}» tiene que ser exactamente ${manifest.version}, igual que manifest.json y package.json, sin prefijo v.`,
  );
  process.exit(1);
}

console.info(`La etiqueta ${tag} coincide con manifest.json y package.json.`);
