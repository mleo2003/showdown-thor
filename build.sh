#!/bin/bash
# build.sh <BUILD_NUM> — Showdown Thor (official Showdown client on the top screen + bottom-screen panel).
# Output out/showdown-thor-0.1.<n>.apk, versionCode <n>, signed with keys/showdown-thor.jks.
set -euo pipefail
B="$(cd "$(dirname "$0")" && pwd)"; cd "$B"
# JDK 21 on purpose (a JAVA_HOME left over from another project may be older): SHOWDOWN_THOR_JDK overrides it
export JAVA_HOME="${SHOWDOWN_THOR_JDK:-$HOME/tools/jdk-21/Contents/Home}" ANDROID_HOME="${ANDROID_HOME:-$HOME/tools/android-sdk}"
N="${1:?build number}"
echo "sdk.dir=$ANDROID_HOME" > local.properties
export THOR_KEYSTORE="$B/keys/showdown-thor.jks" THOR_KEYSTORE_PASSWORD="$(cat "$B/keys/pass")"
export THOR_VERSION_CODE="$N" THOR_VERSION_NAME="0.1.$N"
tools/update-coach-data.sh
node --check app/src/main/assets/inject/thor-inject.js && node --check app/src/main/assets/panel/panel.js && node --check app/src/main/assets/panel/coach/coach.js
./gradlew --no-daemon --console=plain assembleRelease 2>&1 | grep -E "BUILD|FAIL|^e: |error:|warning:.*\.kt" | tail -20
OUT="$B/out/showdown-thor-0.1.$N.apk"; mkdir -p "$B/out"
cp app/build/outputs/apk/release/app-release.apk "$OUT" && shasum -a 256 "$OUT"
