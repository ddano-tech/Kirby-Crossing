/* Original N64 engine adapter: input is supplied only by the parent bridge. */
(() => {
  let input = {buttons: [], stick: [0, 0], cstick: [0, 0]}, last = 0, active = false, sound = false;
  const order = ['D_UP','D_DOWN','D_LEFT','D_RIGHT','A','B','START','Z','L','R'];
  window.kirbyBridge = {
    input(value) { input = value; last = performance.now(); },
    active(value, audible) {
      active = value; sound = audible;
      if (window.myApp?.gainNode) myApp.gainNode.gain.value = active && sound ? .5 : 0;
      window.myApp?.audioContext?.resume().catch(() => {});
    }
  };
  navigator.getGamepads = () => [];
  const start = setInterval(async () => {
    if (!window.myApp || myApp.rivetsData.moduleInitializing) return;
    clearInterval(start);
    try {
      const app = myApp;
      app.rom_name = 'Kirby64.z64';
      app.rivetsData.settingMobile = 'ForceMobile';
      app.rivetsData.disableAudioSync = true;
      app.rivetsData.showFPS = false;
      const controller = app.rivetsData.inputController;
      controller.processGamepad = () => {};
      controller.updateMobileControls = () => {
        const current = active && performance.now() - last < 750 ? input : {buttons: [], stick: [0, 0], cstick: [0, 0]};
        let bits = order.map(b => current.buttons.includes(b) ? '1' : '0').join('');
        bits += [current.cstick[1] > .4, current.cstick[1] < -.4, current.cstick[0] < -.4, current.cstick[0] > .4].map(v => v ? '1' : '0').join('');
        app.sendMobileControls?.(bits, String(current.stick[0]), String(current.stick[1]));
      };
      document.onkeydown = document.onkeyup = null;
      const response = await fetch('/api/kirby-rom');
      if (!response.ok) throw new Error('Original Kirby ROM unavailable');
      await app.LoadEmulator(new Uint8Array(await response.arrayBuffer()));
      window.kirbyBridge.active(active, sound);
      window.kirbyReady = true;
      parent.postMessage({type: 'kirby-ready'}, location.origin);
    } catch (error) {
      parent.postMessage({type: 'kirby-error', message: error.message}, location.origin);
    }
  }, 100);
})();
