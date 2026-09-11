#!/usr/bin/env bash
# Production deploy to Vercel — CLI only, no Git integration. Verified 2026-09-11.
#
# Why this is not just `vercel deploy --prod`:
#  1. Git-author team check: Vercel reads the HEAD commit author of the enclosing repo and silently BLOCKS
#     deploys whose author isn't on the team (the CLI just hangs). We deploy from a throwaway shadow repo in app/
#     whose single empty commit is authored as the Vercel account. (Same recipe as Horsepower docs/SITE_DEPLOY.md.)
#  2. Env vars on this team are sensitive: `vercel pull` returns "[SENSITIVE]" placeholders, which would be baked
#     into NEXT_PUBLIC_* at build time. We patch the pulled file with real values from .env.local first.
#  3. Next's file trace records every `.env*` file in app/, and .vercelignore (rightly) keeps them out of the
#     upload, so functions fail with ENOENT at runtime. .env.local is moved OUT of app/ during the build.
#  4. .vercelignore must not exclude node_modules or .next: prebuilt functions reference them via filePathMap.
#
# Usage: app/scripts/deploy.sh    (needs `vercel login` as the account below)
set -euo pipefail

SCOPE="${VERCEL_SCOPE:-andrew-2d2a}"
TEAM_ID="${VERCEL_TEAM_ID:-team_e9V9xDwZDq0kPCAPjRP2uayN}"
AUTHOR_EMAIL="${VERCEL_AUTHOR_EMAIL:-zhandrewh@gmail.com}"
ALIAS="${VERCEL_ALIAS:-verity-andrew-2d2a.vercel.app}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
HOLD="$(mktemp -d)/env.local"
KEYS=(NEXT_PUBLIC_MARKET_ADDRESS NEXT_PUBLIC_BIDS_ADDRESS NEXT_PUBLIC_DEPLOY_BLOCK NEXT_PUBLIC_RPC_URL NEXT_PUBLIC_CUSTODIAN_PUBKEY CUSTODIAN_SECRET RELAYER_PK X402_FACILITATOR_URL)

cd "$APP"
[ -e .git ] && { echo "app/.git exists — refusing to create a shadow repo over it"; exit 1; }
[ -f .env.local ] || { echo "app/.env.local missing"; exit 1; }

cleanup() {
  cd "$APP"
  [ -f "$HOLD" ] && mv "$HOLD" .env.local
  # Only ever delete the shadow repo we created (single commit named "deploy"); never the real repo's .git.
  if [ -d .git ] && [ "$(git log -1 --format=%s 2>/dev/null)" = "deploy" ]; then rm -rf .git; fi
}
trap cleanup EXIT

echo "→ pulling project settings"
npx -y vercel pull --yes --environment production --scope "$SCOPE" >/dev/null

echo "→ patching redacted env placeholders with real values"
node - "${KEYS[@]}" <<'NODE'
const fs = require("fs");
const parse = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const real = parse(".env.local"), f = ".vercel/.env.production.local", pulled = parse(f);
for (const k of process.argv.slice(2)) { if (!real[k]) throw new Error(`missing ${k} in .env.local`); pulled[k] = real[k]; }
fs.writeFileSync(f, Object.entries(pulled).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n");
NODE

echo "→ building locally (with .env.local moved out of the traced tree)"
mv .env.local "$HOLD"
rm -rf .vercel/output
timeout 290 npx -y vercel build --prod --yes >/dev/null
if grep -rhoE '"\.env[^"]*"' .vercel/output/functions --include=.vc-config.json | grep -qv '.env.example'; then
  echo "build output still traces an .env file — aborting"; exit 1
fi

echo "→ deploying prebuilt output from a shadow repo authored as $AUTHOR_EMAIL"
git init -q . && git -c user.name="Verity Deploy" -c user.email="$AUTHOR_EMAIL" commit -q --allow-empty -m deploy
OUT=$(timeout 290 npx -y vercel deploy --prebuilt --prod --yes --scope "$SCOPE" 2>&1) || true
URL=$(echo "$OUT" | grep -Eo "https://[a-z0-9-]+-${SCOPE}\.vercel\.app" | head -1 || true)
[ -n "$URL" ] || { echo "$OUT" | tail -10; echo "no deployment URL returned"; exit 1; }

# "The command exited 0" is not confirmation. Ask the API.
TOKEN=$(node -p "require(process.env.HOME + '/Library/Application Support/com.vercel.cli/auth.json').token")
STATE=$(curl -s "https://api.vercel.com/v13/deployments/${URL#https://}?teamId=${TEAM_ID}" -H "Authorization: Bearer $TOKEN" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(`${j.readyState} alias=${j.aliasAssigned} ${j.errorMessage||""}`)})')
echo "→ $URL: $STATE"
case "$STATE" in READY\ alias=true*) ;; *) exit 1 ;; esac
echo "→ live: https://$ALIAS  (home HTTP $(curl -s -o /dev/null -w '%{http_code}' -m 60 "https://$ALIAS/"))"
