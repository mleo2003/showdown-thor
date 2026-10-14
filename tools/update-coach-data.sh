#!/bin/bash
# update-coach-data.sh — refresh the coach's data in assets/panel/coach/:
#   calc-data.js + calc.js  = @smogon/calc browser bundles (MIT, pinned version below)
#   randbats.js             = pkmn's random-battle sets (https://pkmn.github.io/randbats/, generated from Showdown's data)
# Run by build.sh; when offline it keeps the copies already there.
set -uo pipefail
CALC_VERSION=0.12.0
D="$(cd "$(dirname "$0")/.." && pwd)/app/src/main/assets/panel/coach"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
if curl -sfL --max-time 60 -o "$T/calc.tgz" "https://registry.npmjs.org/@smogon/calc/-/calc-$CALC_VERSION.tgz" && tar xzf "$T/calc.tgz" -C "$T"; then
  cp "$T/package/dist/data/production.min.js" "$D/calc-data.js"
  cp "$T/package/dist/production.min.js" "$D/calc.js"
  cp "$T/package/LICENSE" "$D/LICENSE-smogon-calc" 2>/dev/null || true
  echo "   coach: @smogon/calc $CALC_VERSION"
else
  echo "   coach: @smogon/calc download failed, keeping the bundled copy"
fi
ok=1
for f in gen9randombattle gen9randomdoublesbattle; do
  curl -sfL --max-time 60 -o "$T/$f.json" "https://pkmn.github.io/randbats/data/$f.json" && python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$T/$f.json" || ok=0
done
if [ $ok = 1 ]; then
  python3 - "$T" "$D/randbats.js" <<'PY'
import json, sys, datetime
t, out = sys.argv[1], sys.argv[2]
data = {"gen9": json.load(open(t + "/gen9randombattle.json")), "gen9doubles": json.load(open(t + "/gen9randomdoublesbattle.json"))}
with open(out, "w") as f:
    f.write("// pkmn random-battle sets (https://pkmn.github.io/randbats/), fetched %s by tools/update-coach-data.sh\n" % datetime.date.today())
    f.write("window.THOR_RANDBATS = " + json.dumps(data, separators=(",", ":")) + ";\n")
print("   coach: random-battle sets", {k: len(v) for k, v in data.items()})
PY
else
  echo "   coach: random-battle sets download failed, keeping the bundled copy"
fi
