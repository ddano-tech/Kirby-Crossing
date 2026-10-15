# Original-game draft

The draft runs Animal Crossing USA revision 0 in Dolphin and Kirby 64 USA in N64Wasm inside the browser. Both original engines continue running when control switches. The native mod draws Kirby using Animal Crossing's original player actor and retains its movement, collisions, item and tool logic. Full feature regression is still unverified.

The native mod adds a star portal in the northern central village acre and at the north of the original game's island. Approach it and press Z (keyboard C or either controller trigger). The browser switches control to Kirby when the native portal emits its event. Return to island switches back. The northern village portal was playtested: its native event switched to the running Kirby stage, and Return to island restored control at the portal. The separate island placement still needs an in-game visit.

Kirby's first original stage uses Animal Crossing's original triangular grass texture and its original Tom Nook model, converted locally from your disc. Tom Nook is a static scenery cameo here. The original platforming, enemies and collisions remain intact. Later stages retain their original content; this draft does not add interactive Animal Crossing NPC behavior to Kirby's engine.

## Mac launch

Install Dolphin in Applications and Python 3.10 or newer. Download and extract the draft ZIP, then open `Play on Mac.command`. On first launch, select your original Animal Crossing USA ZIP/RVZ/ISO and Kirby 64 USA Virtual Console ZIP/WAD or Z64 when prompted. Keep Terminal open while playing; Control-C stops the launcher. The first run needs Internet access to install the pinned Python dependency.

The launcher creates a private Python environment, installs the pinned WAD-reading dependency, converts your RVZ with DolphinTool, verifies the original module and ROM, and applies the character/portal patch to a copy. The browser opens after the bridge starts. First preparation can take several minutes. Original files are preserved.

Prepared games and dedicated Dolphin save profiles live under `~/Library/Application Support/Kirby-Crossing/`. Unrelated Dolphin profiles are not used. Only one launcher can open a dedicated profile at a time. Temporary audio recordings created during the session are removed on exit; existing saves and recordings are preserved. Mac-specific startup and physical controller operation still need verification on a Mac; this cloud machine cannot operate your computer remotely.

## Browser controls

Click Enable controls, focus the page, and use arrows to move, X for A, Z for B, Enter for Start, C for the GameCube Z trigger, and Tab to switch games. A/S map Y/X and Q/E map L/R. I/J/K/L provide D-pad up/left/down/right for menus. Enable sound permits browser audio; only the selected game is audible.

Connect a PS5 controller through USB or Bluetooth and press a button. Standard browser mappings use the left stick for movement, Circle for A, Cross for B, Options for Start, Create to switch games, and either trigger for the portal. Square/Triangle map Y/X, L1/R1 map L/R, and the right stick maps the C stick. Automated tests simulate this layout; physical DualSense hardware is untested.

Switching releases the old game's inputs. Pausing, hiding the page, disconnecting a controller, or losing the input heartbeat neutralizes controls. Use one enabled page at a time. Paused pages do not claim control ownership. Both games keep running, so leave Kirby somewhere safe before switching.

## Developer launch

Prepare private copies using Python and DolphinTool:

```sh
python -m native_bridge.prepare \
  --animal-crossing '/path/to/Animal Crossing.zip' \
  --kirby '/path/to/Kirby 64.zip' \
  --dolphin-tool /path/to/DolphinTool \
  --output /path/to/private-prepared-games
```

WAD extraction requires `libWiiPy==0.6.0`. Preparation verifies every WAD content hash, the supported original ROM checksum, and both sides of the module patch. Generated `games.json` records local paths. Never publish the output directory.

```sh
python -m native_bridge.launch \
  --dolphin /path/to/dolphin-emu \
  --animal-crossing /path/to/private-prepared-games/Kirby-Crossing-draft.iso \
  --kirby-rom /path/to/private-prepared-games/Kirby64.z64 \
  --profiles /path/to/dedicated-profiles
```

The local panel uses port 5211 on the same computer. The cloud onboarding UI does not expose it as a playable preview. For cloud tests, `--headless --video-backend OGL` works with surfaceless EGL. Mesa Vulkan crashed here; SwiftShader Vulkan leaked memory. Normal desktop Dolphin uses its normal backend unless explicitly overridden.

The legacy `--kirby /path/to/game.wad` runs a second Dolphin instance instead of browser N64 emulation. That path suffered crashes in cloud tests; the draft uses `--kirby-rom`.

## Validation and limits

```sh
python -m unittest native_bridge.test_bridge native_bridge.test_media
node --test native_bridge/mapping.test.js native_bridge/browser.test.mjs
```

All 12 Python and 6 browser/mapping tests pass. They cover input routing, portal revisions, stale input, ownership, keyboard/controller switching, neutralization, frame caching, PCM transport and recovery from a failed Kirby boot. Unmodified source builds matched their expected original checksums. Native gameplay exercised Kirby's movement, original NPC dialogue and house entry. Kirby's original first level visibly includes the imported grass and Tom Nook. Preparation from the supplied ZIPs passed again from the extracted release package and produced byte-identical private game copies. A fresh browser loaded Kirby and switched control both ways without script errors. Duplicate-profile protection and shutdown cleanup passed functional checks. The northern village portal gameplay handoff passed with the native event recorded. The separate island placement, save/reload, physical PS5 operation, Mac launcher execution and full Animal Crossing feature regression remain unverified. See `VALIDATION.json` for the release's specific evidence and limits.

Source and the verified delta live in `mods/animal_crossing/`. Browser emulator source and notices live in `vendor/n64/`. User game data belongs outside this repository.
