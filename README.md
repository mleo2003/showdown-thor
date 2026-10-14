# Showdown Thor

[Pokémon Showdown](https://play.pokemonshowdown.com/) as an Android app for the **AYN Thor** (two screens): the
official Showdown client on the top screen, and a battle panel on the bottom screen.

The top screen is the real site (`https://play.pokemonshowdown.com/`), not a re-implementation, so it plays and looks
exactly like Showdown and keeps up with it. The app adds a small script to that page and draws its own panel next to it.

## The bottom screen

- **Coach** for Random Battles: damage ranges and KO chances for your moves (via `@smogon/calc`, with what each foe
  can carry from pkmn's random-battle sets), who moves first (stats, boosts, paralysis, Tailwind, Trick Room, weather
  abilities, a possible Choice Scarf), threats and a ★ pick. Quiz mode lets you choose first and then shows what it
  would have done; or switch it off.
- **Teambuilder:** search results, set details and stats, and a team overview.
- **Lobby:** format and team picker, challenges, Watch a battle, Friends, and Forfeit with a confirm step.
- An on-panel keyboard for any text box on the top screen, a clock with the battery level, and it follows Showdown's
  own light/dark theme.

Showdown's ads show as they do on the site. **Ads: shown / hidden** in the lobby's toolbar turns them off on your
device (saved; the top screen reloads so it applies from the start).

## Install

Builds are published as [GitHub Releases](../../releases), so [Obtainium](https://obtainium.imranr.dev/) can install
and update it (source: GitHub, this repository). Package: `com.mleo2003.showdownthor`.

## Build

Needs JDK 21, the Android SDK, Node.js (for a syntax check) and a signing keystore of your own:

```sh
# keys/showdown-thor.jks + keys/pass (its password), both ignored by git
SHOWDOWN_THOR_JDK=/path/to/jdk-21 ANDROID_HOME=/path/to/android-sdk ./build.sh 46   # -> out/showdown-thor-0.1.46.apk
```

`build.sh` refreshes the coach data first (`tools/update-coach-data.sh`; offline it keeps the bundled copy).
`test/` has a private-server test setup (a local Showdown server, a bot opponent and a CDP helper), so testing never
involves other players.

## Credits and licences

- [Pokémon Showdown client](https://github.com/smogon/pokemon-showdown-client) (AGPL-3.0): the page the app shows;
  the type and move-category icons in the panel are Showdown's.
- [@smogon/calc](https://github.com/smogon/damage-calc) (MIT) and [pkmn/randbats](https://github.com/pkmn/randbats)
  data (MIT, generated from Pokémon Showdown): bundled in `app/src/main/assets/panel/coach/` (see `NOTICE.txt`).
- This app's own code: [AGPL-3.0](LICENSE).

Not affiliated with Smogon, Pokémon Showdown, Nintendo, Game Freak or The Pokémon Company. Pokémon and Pokémon
character names are trademarks of Nintendo.
