import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

from native_bridge.server import Bridge, GAMES, make_server


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.paths, self.readers = {}, {}
        for game in GAMES:
            path = Path(self.temp.name) / game
            os.mkfifo(path)
            self.paths[game] = path
            self.readers[game] = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
        self.bridge = Bridge(self.paths, timeout=.03)
        for game in GAMES:
            self.drain(game)

    def tearDown(self):
        self.bridge.close()
        for fd in self.readers.values():
            os.close(fd)
        self.temp.cleanup()

    def drain(self, game):
        try:
            return os.read(self.readers[game], 65536).decode()
        except BlockingIOError:
            return ''

    def message(self, **changes):
        return dict(client='test', game=GAMES[0], buttons=['A'], stick=[1, -1], **changes)

    def test_switch_releases_previous_game_and_preserves_isolation(self):
        self.bridge.update(self.message())
        self.assertIn('PRESS A\n', self.drain(GAMES[0]))
        self.assertNotIn('PRESS', self.drain(GAMES[1]))
        message = self.message()
        message.update(game=GAMES[1], buttons=['B'], stick=[0, 0])
        self.bridge.update(message)
        old, new = self.drain(GAMES[0]), self.drain(GAMES[1])
        self.assertIn('RELEASE A\n', old)
        self.assertNotIn('PRESS', old)
        self.assertIn('SET MAIN 0.5 0.5\n', old)
        self.assertIn('PRESS B\n', new)

    def test_stale_client_is_neutralized(self):
        self.bridge.update(self.message())
        self.drain(GAMES[0])
        time.sleep(.04)
        self.bridge.expire()
        self.assertIn('RELEASE A\n', self.drain(GAMES[0]))
        self.assertFalse(self.bridge.status()['connected'])

    def test_heartbeats_do_not_flood_emulator_pipe(self):
        self.bridge.update(self.message())
        self.drain(GAMES[0])
        for _ in range(100):
            self.bridge.update(self.message())
        self.assertEqual(self.drain(GAMES[0]), '')
        self.assertTrue(self.bridge.status()['connected'])

    def test_right_stick_and_invalid_axis(self):
        self.bridge.update(self.message(cstick=[-1, 1]))
        self.assertIn('SET C 0.0 1.0\n', self.drain(GAMES[0]))
        with self.assertRaises(ValueError):
            self.bridge.update(self.message(cstick=[0, 2]))

    def test_portal_switch_discards_stale_browser_snapshot(self):
        message = self.message(revision=0)
        self.bridge.update(message)
        self.drain(GAMES[0])
        self.bridge.switch_game(GAMES[1])
        for game in GAMES:
            self.drain(game)
        self.bridge.update(message)
        self.assertEqual(self.bridge.active, GAMES[1])
        for game in GAMES:
            self.assertEqual(self.drain(game), '')
        message.update(game=GAMES[1], revision=1, buttons=['B'])
        self.bridge.update(message)
        self.assertIn('PRESS B\n', self.drain(GAMES[1]))

    def test_invalid_input_never_reaches_pipe(self):
        for changes in ({'stick': [float('nan'), 0]}, {'buttons': ['INVALID']}, {'game': 'invalid'}, {'stick': [True, 0]}):
            message = self.message()
            message.update(changes)
            with self.assertRaises(ValueError):
                self.bridge.update(message)
            self.assertEqual(self.drain(GAMES[0]), '')

    def test_competing_browser_cannot_take_over_live_controls(self):
        self.bridge.update(self.message())
        message = self.message()
        message['client'] = 'other-browser'
        with self.assertRaises(PermissionError):
            self.bridge.update(message)

    def test_paused_browser_releases_ownership_without_interrupting_another(self):
        self.bridge.update(self.message(enabled=False))
        self.assertFalse(self.bridge.status()['connected'])
        self.bridge.update(self.message())
        self.drain(GAMES[0])
        paused = self.message(enabled=False)
        paused['client'] = 'other-browser'
        self.bridge.update(paused)
        self.assertEqual(self.drain(GAMES[0]), '')
        self.assertEqual(self.bridge.owner, 'test')
        self.bridge.update(self.message(enabled=False))
        self.assertIn('RELEASE A\n', self.drain(GAMES[0]))
        paused.update(enabled=True)
        self.bridge.update(paused)
        self.assertEqual(self.bridge.owner, 'other-browser')

    def test_http_origin_validation_and_missing_rom_routes(self):
        server = make_server(self.bridge, 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            request = urllib.request.Request(base + '/api/input', data=json.dumps(self.message()).encode(), headers={'Origin': 'https://example.com'})
            with self.assertRaises(urllib.error.HTTPError) as result:
                urllib.request.urlopen(request)
            self.assertEqual(result.exception.code, 403)
            request.add_header('Origin', base)
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200)
            with self.assertRaises(urllib.error.HTTPError) as result:
                urllib.request.urlopen(base + '/game.rom')
            self.assertEqual(result.exception.code, 404)
        finally:
            server.shutdown()
            server.server_close()

    def test_disconnected_emulator_fails_closed(self):
        fd = self.readers.pop(GAMES[0])
        os.close(fd)
        with self.assertRaises(OSError):
            self.bridge.update(self.message())
        self.assertIsNotNone(self.bridge.error)
        self.assertFalse(self.bridge.status()['connected'])


if __name__ == '__main__':
    unittest.main()
