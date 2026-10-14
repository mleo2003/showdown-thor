# Testing Showdown Thor against a private server (no strangers involved)

1. Showdown server on the Mac (the version castdrian/showdown-ds CI pins works):
   `git clone https://github.com/smogon/pokemon-showdown && cd pokemon-showdown && git checkout b8f23c9 && npm ci`
   `config/config.js`: `exports.bindaddress = '127.0.0.1'; exports.noguestsecurity = true; exports.port = 8000; exports.subprocesses = 0;`
   For a test server only, server/users.ts validateToken: `if (!token && Config.noguestsecurity)` -> `if (Config.noguestsecurity)`
   (accept any name token). Start: `node pokemon-showdown 8000` (Node 24; the REPL socket error on macOS is harmless).
2. Opponent: `node bot.mjs` (ThorBot: accepts challenges, answers every request instantly with /choose default).
3. `./test-battle.sh <apk>`: installs, `adb reverse tcp:8000 tcp:8000`, launches with `--es testServer localhost:8000`,
   names the player ThorTester, challenges ThorBot, captures both screens.
Test mode (MainActivity.testServer) serves the official page at http://localhost:8000/thor-test with
`Config.testclient = true` and a defaultserver override, so Chromium lets it reach localhost; http Showdown assets are
fetched over https. Without the extra, the app only ever loads https://play.pokemonshowdown.com/.
Drive it: CDP (`test/cdp.mjs`, CDP_TARGET=http://localhost for the page, file:// for the panel),
`adb shell input keyevent KEYCODE_BUTTON_A` etc. for the controller, `input -d 4 tap/swipe` for the bottom screen.
