# Browser N64 emulator provenance

Frontend and prebuilt emulator: [nbarkhina/N64Wasm](https://github.com/nbarkhina/N64Wasm), commit `bfac222f8a27287022844b47000328531834e9c1`.

`core-source.tar.gz` contains the corresponding upstream `code` directory, including the ParaLLEl/RetroArch emulator source and its build files. Build instructions are preserved in `licenses/UPSTREAM-README.md`; they use Emscripten 2.0.7 and `make`. The prebuilt `n64wasm.js`, `n64wasm.wasm`, and `assets.zip` are upstream outputs. The emulator core is covered by its included GPL notices; the frontend's MIT notice is also retained.

Local frontend modifications replace CDN dependencies with local copies, disable the external cloud-save endpoint, hide the standalone menu, size the canvas to its parent frame, and load `/n64-bridge.js`. That adapter is maintained separately in `native_bridge/static/`; it loads only the privately supplied original ROM and gates input/audio according to the selected game. The emulator core has not been modified.

Local web dependencies include jQuery 3.3.1, Rivets 0.9.6, Bootstrap 4.0.0, Popper 1.12.9, Toastr 2.1.4, FileSaver 2.0.2, and nipplejs 0.10.0. Notices are included in the vendor files or `licenses/`. No commercial ROM or extracted commercial game assets are included.
