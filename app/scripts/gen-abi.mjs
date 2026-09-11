// Regenerates lib/abi.ts from Foundry artifacts (run `forge build` in contracts/ first). `npm run abi`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "../../contracts/out");
const abi = (name) => JSON.parse(fs.readFileSync(path.join(out, `${name}.sol/${name}.json`), "utf8")).abi;
const target = path.join(here, "../lib/abi.ts");
const erc20 = fs.readFileSync(target, "utf8").split("\n").find((l) => l.startsWith("export const erc20Abi"));

fs.writeFileSync(
  target,
  [
    "// Generated from contracts/out by `npm run abi`. Do not edit.",
    `export const marketAbi = ${JSON.stringify(abi("VerityMarket"), null, 1)} as const;`,
    "",
    `export const bidsAbi = ${JSON.stringify(abi("StandingBids"), null, 1)} as const;`,
    "",
    erc20,
    "",
  ].join("\n"),
);
console.log(`wrote ${target}`);
