#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VER=$(node -p "require('./package.json').version")
EV=33.2.1
ZIP=~/.cache/electron/electron-v$EV-win32-x64.zip
[ -f "$ZIP" ] || curl -sSL -o "$ZIP" "https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-win32-x64.zip"
node test/run-tests.js
rm -rf build/app && mkdir -p build/app
cp -r src build/app/
node -e "
const p = require('./package.json');
require('fs').writeFileSync('build/app/package.json', JSON.stringify({ name: p.name, productName: p.productName, version: p.version, description: p.description, main: p.main, dependencies: p.dependencies }, null, 2));"
(cd build/app && npm install --omit=dev --no-audit --no-fund --loglevel=error && rm -f package-lock.json)
ISO=$(mktemp -d /tmp/tm-iso-XXXX); cp -r build/app "$ISO/app"
(cd "$ISO/app" && NODE_PATH= node -e "
for (const m of ['./src/main/appsheet.js','./src/main/importer.js','./src/main/firebase.js','./src/main/sync.js','./src/main/db.js','./src/shared/stats.js','exceljs','sql.js']) require(m);
const ExcelJS = require('exceljs'); new ExcelJS.Workbook(); console.log('moduli OK (izolovano)');")
rm -rf ~/.config/pracenje-sudjenja ~/.config/"Praćenje suđenja"
if command -v xvfb-run >/dev/null; then (TM_APP="$ISO/app" xvfb-run -a node test/smoke-electron.js); fi
rm -rf ~/.config/pracenje-sudjenja ~/.config/"Praćenje suđenja" "$ISO"
OUT=dist/portable/"Praćenje suđenja"; rm -rf dist/portable && mkdir -p "$OUT"
unzip -q "$ZIP" -d "$OUT"
mv "$OUT/electron.exe" "$OUT/Praćenje suđenja.exe"
[ -d build/tools/node_modules/resedit ] || (cd build/tools && npm install resedit@2 --no-audit --no-fund --loglevel=error)
node build/set-icon.js "$OUT/Praćenje suđenja.exe" build/icon.ico "$VER"
rm -f "$OUT/resources/default_app.asar"
cp -r build/app "$OUT/resources/app"
cp config.json "$OUT/resources/config.json"
cat > "$OUT/PROCITAJ.txt" <<'TXT'
1. Raspakujte cijeli folder "Praćenje suđenja", npr. u Dokumente.
2. Pokrenite "Praćenje suđenja.exe".
   Ako Windows prikaže "Windows protected your PC": More info -> Run anyway.
3. Nove verzije aplikacija nudi sama.
TXT
rm -f "dist/Pracenje-sudjenja-$VER.zip"
python3 - "dist/Pracenje-sudjenja-$VER.zip" <<'PY'
import os, sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk('dist/portable'):
        for f in files:
            full = os.path.join(root, f); z.write(full, os.path.relpath(full, 'dist/portable'))
PY
ls -la "dist/Pracenje-sudjenja-$VER.zip"
