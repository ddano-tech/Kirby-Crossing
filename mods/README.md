# Original-game crossover patches

Preparation is automatic through `python -m native_bridge.prepare` or the Mac launcher. Inputs must match Animal Crossing USA revision 0 and Kirby 64 USA. Original input files stay unchanged. No extracted Nintendo assets or game images belong in this source tree.

`animal_crossing/draft.kcd` is a checked delta against the supported original uncompressed `foresta.rel`. It retains the original player simulation and skeleton/attachment calculations, replaces the rendered body with an original procedural Kirby mesh, and adds the northern star portal/event. `delta.py`, `yaz0.py` and `pack_disc.py` verify and pack a private copy.

To change the native hook, make a disposable copy of the matching ac-decomp source, apply `python mods/animal_crossing/apply.py /path/to/copy`, configure its original pinned compiler and build `build/GAFE01_00/static.dol` and `build/GAFE01_00/foresta/foresta.rel.szs`. The original main executable stays byte-identical. Recreate the delta with `delta.py` using the verified original and rebuilt module. Do not run original module SHA checks against an intentionally modified module. Keep a separate matching baseline build for that verification.

`kirby64/crossover.py` converts the original Animal Crossing CI4 grass into the first Kirby stage's I4 ground texture. `animal_assets.py` reads the supported original Tom Nook model and textures from the original module; `stage.py` converts his static posed geometry into N64 display lists attached to the first stage. The original first stage layout, platforming and collision data remain intact. The cameo is static scenery. The output uses verified unused ROM padding and updates the native file table and CIC-6103 header checksum. Preparation performs the conversion locally; no exported model is included here.

The browser N64 emulator is open source under `vendor/n64`, with its corresponding core source and license notices. Its core is unchanged. The two original engines keep running; control switching does not migrate a shared inventory or create interactive NPC behavior across engines.
