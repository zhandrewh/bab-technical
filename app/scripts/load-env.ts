// Side-effect module: must be the first import of every script. Imports are hoisted above statements, so loading
// env inline in env.ts would run after lib/chain.ts had already read process.env.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env.agents"), quiet: true });
config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });
