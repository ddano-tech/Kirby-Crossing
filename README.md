# Kirby Crossing

The original-game draft is in development. It runs the original Animal Crossing in Dolphin and the original Kirby 64 in a browser emulator. Both engines keep running while the browser switches control and sound. A native Animal Crossing mod draws Kirby using the original player actor, retaining its movement and action logic. Browser video, audio transport, keyboard input, and standard controller mappings are implemented.

The first original Kirby stage now uses Animal Crossing's original grass texture and a static Tom Nook scenery cameo. The northern portal's complete gameplay round trip is still being tested. Physical PS5 hardware and full Animal Crossing feature regression remain unverified. This is a working draft in development, not the completed crossover.

See [original-game draft instructions](native_bridge/README.md). The Mac launcher prepares private copies from your own game ZIPs and requires Dolphin and Python 3. No game images are included in this repository. The older downloadable HTML below is the separate canvas prototype.

## Earlier browser prototype: Dreamside

The remaining instructions describe the earlier standalone canvas prototype.

A playable, browser-based fan crossover prototype: Kirby explores a cozy island, makes friends, gathers and sells items, and visits three platforming trails through the clearly labeled **Starfall Portal in the northern grove**.

This is an original browser implementation with procedural canvas art. It is not a port of the uploaded decompilations, does not use their game assets, and does not require a game disc. It implements a small selection of Animal Crossing style systems, not every feature of Animal Crossing or the original Kirby levels.

## Play

The production build is a **single standalone HTML file**, including fonts, artwork, code, and styles. On GitHub, choose **Code → Download ZIP**, unzip it, and open **`play/Kirby-Crossing.html`** in a current desktop Chrome, Edge, Firefox, or Safari browser. No installation or account is required. Save data is stored locally in the current browser; moving the HTML file, switching browsers, private browsing, or clearing site data can affect saves. Hosted play over HTTPS provides the most consistent controller and storage support.

For development (Node.js 20.19+ or 22.12+):

```sh
npm ci
npm run dev
```

Open the address Vite prints in your own development environment. `npm run build` produces `dist/index.html` and refreshes the downloadable copy at `play/Kirby-Crossing.html`; any static HTTPS host can serve that file. `npm run preview` serves the production build locally.

## Controls

| Action | Keyboard | PS5 DualSense (standard Gamepad mapping) |
| --- | --- | --- |
| Move / menu navigation | WASD / arrows | Left stick / D-pad |
| Interact / confirm / reel fish | E / Enter | Cross (×) |
| Jump; tap again to puff upward; hold to float | Space | Square (□) |
| Inhale nearby enemy; then fire a star | X | R2 |
| Pockets | B | Triangle (△) / Options |
| Close menu / pause trail | Escape | Circle (○) |

Pair the DualSense using Bluetooth or USB, focus the game tab, and press a controller button. A connected-controller indicator appears in the page header. Controller support uses the standard browser Gamepad API. Automated tests exercise a simulated standard controller; a physical DualSense has not been tested here. Browser/OS mappings can differ. Touch controls are provided on devices with a coarse pointer.

## Island life

- Shake peach trees, gather fallen wood, and collect beach shells. Rest until tomorrow to refresh daily resources.
- Fish at the shore. Press interact to cast, wait for **A BITE!**, and interact within 1.5 seconds to reel it in. Walking away cancels fishing.
- Visit Nook’s Market to sell gathered items, buy seeds and benches, and upgrade your home (two upgrades).
- Plant seeds and place garden benches from your pockets. Crops mature in one real minute and regrow after harvesting.
- Talk with Maple, Rosie, and Isabelle; fulfill their requests to earn friendship and bells.
- Donate a fish and a shell to the museum; rest at home to restore hearts.
- Your inventory, garden, decorations, house, friendships, museum, completed trails, and currency save automatically in this browser. Player position resets to the plaza on reload.

## Dream trails

Walk north along the central path to the marked portal and interact. Choose Peachwood Skyway, Moonlit Market, or Cloudtop Garden. All three use island-inspired floating platforms, peach trees, crates, and Isabelle at the finish. Collect stars, inhale enemies, shoot stored stars, and reach the ending portal. You earn bells for collected stars plus a one-time completion bonus per trail. Falling or losing your hearts restarts the trail without deleting collected stars. Escape/Circle lets you return to the island early (unbanked trail stars are lost).

These are short original trails using a shared platforming system; they are not recreations of Nintendo’s commercial levels. Enemy variety, sound, interior decorating, crafting, bug catching, multiplayer, terraforming, seasonal events, full museum collections, and the full Animal Crossing simulation are not implemented.

## Validation

```sh
npm test
npm run test:browser
npm run build
```

Playwright defaults to `/usr/bin/chromium` in the prepared cloud environment. Elsewhere, install Chromium via Playwright and set `CHROMIUM_PATH` to its executable, or change `launchOptions.executablePath` in `playwright.config.js`. Tests use real keyboard controls to walk, gather, trade, plant, decorate, use the portal, float, and save/reload; controller tests simulate Gamepad API input. Unit tests cover purchases, selling, harvest timing, save recovery, and completion rewards.

The original uploaded decompilation archives are preserved separately under `/workspace/reference-projects` in the onboarding machine. They are not required for this browser project.

The cloud browser blocks `file:` navigation by administrator policy. The standalone build is therefore validated through the production HTTP server with external resource requests blocked, and then with networking disabled during play. Opening a downloaded HTML file on your own device depends on that browser’s local-file policy; serving it over HTTPS is the alternative.

Embedded fonts retain their SIL Open Font License notices in the HTML file and in `THIRD_PARTY_NOTICES.md`.

## Publish to GitHub Pages

A deployment workflow is prepared in `.github/workflows/pages.yml`. Upload this project to the `main` branch of `ddano-tech/Kirby-Crossing`. In the repository's **Settings → Pages**, choose **GitHub Actions** as the build and deployment source. Run **Publish browser game** from the Actions tab (or push a new commit to `main`). The successful deployment job provides the playable website URL. Publishing the Codex cloud environment saves the development workspace; it does not push Git commits or deploy this website.
