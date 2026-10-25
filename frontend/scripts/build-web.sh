#!/bin/bash
# Builds the hosted web version (opened at <app address>/api/web) into backend/web_dist.
set -e
cd "$(dirname "$0")/.."
cp app.json /tmp/app.json.bak
trap 'cp /tmp/app.json.bak app.json' EXIT
node -e 'const f="app.json";const j=require("./"+f);j.expo.experiments.baseUrl="/api/web";require("fs").writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
npx expo export -p web --output-dir ../backend/web_dist --clear
