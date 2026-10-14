#!/bin/bash
# test-battle.sh <apk> — install Showdown Thor, start it in test mode against the private server on the Mac
# (adb reverse tcp:8000), sign in as ThorTester, challenge ThorBot, and capture both screens to
# scripts/thor-tools/out/{top,bot}_s.png. Needs the local Showdown server + bot running (see NOTES).
set -uo pipefail
ADB="${ADB_BIN:-$HOME/tools/android-sdk/platform-tools/adb} -s ${THOR:?set THOR to the device adb address, e.g. <device-ip>:5555}"; t(){ timeout 30 $ADB shell "$@" < /dev/null; }
T="$(cd "$(dirname "$0")" && pwd)"   # cdp.mjs lives next to this script
[ -n "${1:-}" ] && timeout 120 $ADB install -r "$1" < /dev/null | tail -1
timeout 15 $ADB reverse tcp:8000 tcp:8000 < /dev/null > /dev/null
t "am force-stop com.mleo2003.showdownthor"; t "am start -W --display 0 -n com.mleo2003.showdownthor/.MainActivity --es testServer localhost:8000" | grep Status
for i in $(seq 1 30); do PID=$(t pidof com.mleo2003.showdownthor | tr -d '\r'); [ -n "$PID" ] && break; sleep 1; done
timeout 15 $ADB forward tcp:9333 localabstract:webview_devtools_remote_$PID < /dev/null > /dev/null
for i in $(seq 1 30); do sleep 2; r=$(cd $T && CDP_TARGET=http://localhost timeout 10 node cdp.mjs '!!(window.app && app.socket && app.socket.readyState === 1)' 2>/dev/null); [ "$r" = "true" ] && break; done
cd $T && CDP_TARGET=http://localhost timeout 40 node cdp.mjs '(function(){ app.send("/trn ThorTester,0,"); return new Promise(function(r){ setTimeout(function(){ try { app.closePopup(); } catch(e){} app.send("/challenge ThorBot, gen9randombattle"); setTimeout(function(){ try { app.closePopup(); } catch(e){} r(JSON.stringify({room: app.curRoom && app.curRoom.id, width: innerWidth})); }, 7000); }, 2500); }); })()'
O=$T/out; for f in top:4630946441858561667 bot:4630946482288158084; do n=${f%%:*}; d=${f#*:}; timeout 20 $ADB exec-out screencap -p -d $d > $O/$n.png < /dev/null && sips -Z 900 $O/$n.png --out $O/${n}_s.png > /dev/null; done; echo "screens captured"
