import { readFileSync, statSync } from "node:fs";

const bundle = readFileSync("main.js", "utf8");
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const size = statSync("main.js").size;

if (size < 1000) {
  throw new Error("main.js es demasiado pequeño para ser el plugin compilado.");
}

const forbidden = ["/agent/", "/Users/", "C:\\Users", "BEGIN PRIVATE", "API_KEY"];
for (const token of forbidden) {
  if (bundle.includes(token)) {
    throw new Error(`main.js contiene «${token}».`);
  }
}

const required = ["id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"];
for (const key of required) {
  if (manifest[key] === undefined || manifest[key] === "") {
    throw new Error(`manifest.json no incluye ${key}.`);
  }
}

if (!bundle.includes("Copy note") || !bundle.includes("Export note")) {
  throw new Error("main.js no incluye los comandos del plugin.");
}

console.info(`main.js ${(size / 1024).toFixed(1)} KB, manifest ${manifest.version}`);
