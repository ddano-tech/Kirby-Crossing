import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';

test('browser switching releases held keyboard and gamepad controls', async () => {
  const messages = [];
  const assets = {'/': 'index.html', '/controls.js': 'controls.js', '/mapping.js': 'mapping.js', '/audio.js': 'audio.js'};
  const server = http.createServer(async (request, response) => {
    if (request.url === '/api/input') {
      let body = '';
      for await (const part of request) body += part;
      const message = JSON.parse(body);
      messages.push(message);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({active: message.game, connected: true, error: null}));
    } else if (assets[request.url]) {
      response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/html');
      response.end(await readFile(new URL(`./static/${assets[request.url]}`, import.meta.url)));
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.fakePad = null;
    navigator.getGamepads = () => [window.fakePad];
  });
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (predicate()) return;
      await page.waitForTimeout(50);
    }
    assert.ok(predicate(), 'Expected browser input snapshot was not sent');
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', {name: 'Enable controls'}).click();
    await page.locator('h1').click();
    await page.keyboard.down('KeyX');
    await waitFor(() => messages.at(-1)?.buttons.includes('A'));
    await page.keyboard.press('Tab');
    await waitFor(() => messages.at(-1)?.game === 'kirby64-vc');
    assert.deepEqual(messages.at(-1).buttons, []);
    await page.keyboard.up('KeyX');
    await page.keyboard.down('ArrowRight');
    await waitFor(() => messages.at(-1)?.buttons.includes('D_RIGHT'));
    assert.deepEqual(messages.at(-1).stick, [1, 0]);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('KeyI');
    await waitFor(() => messages.at(-1)?.buttons.includes('D_UP'));
    assert.deepEqual(messages.at(-1).stick, [0, 0]);
    await page.keyboard.up('KeyI');
    await page.evaluate(() => {
      window.fakePad = {id: 'Simulated standard DualSense', connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({length: 17}, (_, i) => ({pressed: i === 1}))};
    });
    await waitFor(() => messages.at(-1)?.buttons.includes('A'));
    await page.evaluate(() => { window.fakePad.buttons[8].pressed = true; });
    await waitFor(() => messages.at(-1)?.game === 'animal-crossing');
    assert.deepEqual(messages.at(-1).buttons, []);
    await page.evaluate(() => { window.fakePad.buttons[8].pressed = false; });
    await page.waitForTimeout(250);
    assert.deepEqual(messages.at(-1).buttons, [], 'Held face button leaked into the newly selected game');
    await page.evaluate(() => { window.fakePad.buttons[1].pressed = false; });
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.fakePad.buttons[1].pressed = true; });
    await waitFor(() => messages.at(-1)?.buttons.includes('A'));
    await page.evaluate(() => { window.fakePad = null; window.dispatchEvent(new Event('gamepaddisconnected')); });
    await waitFor(() => messages.at(-1)?.buttons.length === 0);
    assert.deepEqual(messages.at(-1).stick, [0, 0]);
    assert.equal(await page.getByRole('button', {name: 'Enable controls'}).count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test('Kirby boot failure keeps Animal Crossing controls available', async () => {
  const messages = [];
  const assets = {'/': 'index.html', '/controls.js': 'controls.js', '/mapping.js': 'mapping.js', '/audio.js': 'audio.js'};
  const server = http.createServer(async (request, response) => {
    if (request.url === '/api/state') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({browserKirby: true}));
    } else if (request.url === '/api/input') {
      let body = '';
      for await (const part of request) body += part;
      const message = JSON.parse(body);
      messages.push(message);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({active: message.game, revision: 0}));
    } else if (request.url === '/n64/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<script>setTimeout(() => parent.postMessage({type:"kirby-error",message:"Test ROM unavailable"}, location.origin), 300)</script>');
    } else if (assets[request.url]) {
      response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/html');
      response.end(await readFile(new URL(`./static/${assets[request.url]}`, import.meta.url)));
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('Kirby 64 could not load:', {exact: false}).waitFor();
    await page.getByRole('button', {name: 'Enable controls'}).click();
    await page.locator('h1').click();
    await page.keyboard.down('KeyX');
    for (let attempt = 0; attempt < 30 && !messages.at(-1)?.buttons.includes('A'); attempt++) await page.waitForTimeout(50);
    assert.ok(messages.at(-1)?.buttons.includes('A'));
    assert.equal(messages.at(-1).game, 'animal-crossing');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    assert.equal(messages.at(-1).game, 'animal-crossing');
    assert.match(await page.locator('#status').textContent(), /Test ROM unavailable/);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
