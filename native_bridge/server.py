"""Serve private local game media and route browser controller snapshots."""
import argparse
import json
import math
import os
from pathlib import Path
import stat
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BUTTONS = ('A', 'B', 'X', 'Y', 'Z', 'L', 'R', 'START',
           'D_UP', 'D_DOWN', 'D_LEFT', 'D_RIGHT')
GAMES = ('animal-crossing', 'kirby64-vc')
STATIC = Path(__file__).parent / 'static'


class Bridge:
    def __init__(self, pipes, timeout=0.75, virtual_games=()):
        self.lock = threading.RLock()
        self.fds = {}
        self.active = GAMES[0]
        self.owner = None
        self.last_input = 0
        self.timeout = timeout
        self.error = None
        self.previous = {}
        self.revision = 0
        try:
            for game in GAMES:
                if game in virtual_games:
                    self.fds[game] = None
                    continue
                path = Path(pipes[game])
                if not stat.S_ISFIFO(path.stat().st_mode):
                    raise ValueError(f'{game}: expected an existing FIFO')
                # A reader must already exist: a missing Dolphin instance fails startup.
                self.fds[game] = os.open(path, os.O_WRONLY | os.O_NONBLOCK)
            self.neutralize()
        except Exception:
            self.close()
            raise

    def write(self, game, commands):
        if self.fds[game] is None:
            return
        data = commands.encode('ascii')
        try:
            if os.write(self.fds[game], data) != len(data):
                raise OSError('Incomplete controller write')
        except OSError:
            self.error = 'Controller pipe unavailable; restart the bridge after checking Dolphin.'
            raise

    def neutralize(self):
        with self.lock:
            failures = []
            for game in self.fds:
                try:
                    self.write(game, ''.join(f'RELEASE {b}\n' for b in BUTTONS)
                               + 'SET MAIN 0.5 0.5\nSET C 0.5 0.5\nSET L -1\nSET R -1\n')
                    self.previous.pop(game, None)
                except OSError as error:
                    failures.append(error)
            if failures:
                raise failures[0]

    def update(self, message):
        client = message.get('client')
        game = message.get('game')
        buttons = message.get('buttons', [])
        stick = message.get('stick', [0, 0])
        cstick = message.get('cstick', [0, 0])
        enabled = message.get('enabled', True)
        if not isinstance(enabled, bool):
            raise ValueError('Invalid controls state')
        if not isinstance(client, str) or not 1 <= len(client) <= 100:
            raise ValueError('Invalid client')
        if game not in GAMES or not isinstance(buttons, list) or len(buttons) > len(BUTTONS):
            raise ValueError('Invalid game or buttons')
        if any(b not in BUTTONS for b in buttons):
            raise ValueError('Unknown button')
        for axis in (stick, cstick):
            if not isinstance(axis, list) or len(axis) != 2 or any(
                type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 1 for v in axis
            ):
                raise ValueError('Invalid stick')
        with self.lock:
            now = time.monotonic()
            if not enabled:
                if self.owner == client:
                    self.neutralize()
                    self.owner = None
                return
            if self.owner not in (None, client) and now - self.last_input < self.timeout:
                raise PermissionError('Another browser controls this bridge')
            if self.error:
                raise OSError(self.error)
            revision = message.get('revision')
            if revision is not None and revision != self.revision:
                return  # A portal changed games; discard this stale input snapshot.
            if self.owner != client or game != self.active:
                self.neutralize()
            if game != self.active:
                self.revision += 1
            self.owner, self.active, self.last_input = client, game, now
            held = set(buttons)
            commands = ''.join(('PRESS ' if b in held else 'RELEASE ') + b + '\n' for b in BUTTONS)
            commands += f'SET MAIN {(stick[0]+1)/2} {(stick[1]+1)/2}\n'
            commands += f'SET C {(cstick[0]+1)/2} {(cstick[1]+1)/2}\n'
            try:
                if self.previous.get(game) != commands:
                    self.write(game, commands)
                    self.previous[game] = commands
            except OSError:
                self.expire(force=True)
                raise

    def expire(self, force=False):
        with self.lock:
            if self.owner and (force or time.monotonic() - self.last_input >= self.timeout):
                try:
                    self.neutralize()
                finally:
                    self.owner = None

    def status(self):
        with self.lock:
            return {'active': self.active, 'connected': self.owner is not None, 'error': self.error, 'revision': self.revision}

    def switch_game(self, game):
        if game not in GAMES:
            raise ValueError('Unknown game')
        with self.lock:
            if game != self.active:
                self.neutralize()
                self.active = game
                self.revision += 1

    def close(self):
        with self.lock:
            try:
                self.neutralize()
            except OSError:
                pass
            for fd in self.fds.values():
                if fd is not None:
                    os.close(fd)
            self.fds.clear()


def make_server(bridge, port=5211, frames=None, audio=None, kirby_rom=None, n64_assets=None):
    class Handler(BaseHTTPRequestHandler):
        def send_json(self, status, data):
            payload = json.dumps(data).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def valid_host(self):
            return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

        def do_GET(self):
            if not self.valid_host():
                self.send_json(403, {'error': 'Invalid host'})
                return
            url = urlparse(self.path)
            if url.path == '/api/kirby-rom' and kirby_rom:
                data = Path(kirby_rom).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if url.path.startswith('/n64/') and n64_assets:
                name = url.path.removeprefix('/n64/') or 'index.html'
                root = Path(n64_assets).resolve()
                path = (root / name).resolve()
                if not path.is_relative_to(root) or not path.is_file():
                    self.send_json(404, {'error': 'Not found'})
                    return
                types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm'}
                data = path.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', types.get(path.suffix, 'application/octet-stream'))
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if url.path == '/api/audio':
                query = parse_qs(url.query)
                game = query.get('game', [bridge.active])[0]
                try:
                    if game not in GAMES:
                        raise ValueError('Unknown game')
                    chunk = audio.get(game, query.get('stream', ['dsp'])[0], int(query.get('offset', ['-1'])[0])) if audio else None
                except ValueError as error:
                    self.send_json(400, {'error': str(error)})
                    return
                except OSError:
                    chunk = None
                self.send_json(200 if chunk else 204, chunk)
                return
            if url.path == '/api/frame':
                game = parse_qs(url.query).get('game', [bridge.active])[0]
                if game not in GAMES:
                    self.send_json(400, {'error': 'Unknown game'})
                    return
                data = frames.get(game) if frames else None
                self.send_response(200 if data else 204)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', str(len(data) if data else 0))
                self.end_headers()
                if data:
                    self.wfile.write(data)
                return
            if self.path == '/api/state':
                self.send_json(200, {**bridge.status(), 'browserKirby': bool(kirby_rom)})
                return
            assets = {'/': ('index.html', 'text/html'), '/controls.js': ('controls.js', 'text/javascript'),
                      '/mapping.js': ('mapping.js', 'text/javascript'), '/audio.js': ('audio.js', 'text/javascript'),
                      '/n64-bridge.js': ('n64-bridge.js', 'text/javascript')}
            if self.path not in assets:
                self.send_json(404, {'error': 'Not found'})
                return
            name, content_type = assets[self.path]
            payload = (STATIC / name).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:")
            self.end_headers()
            self.wfile.write(payload)

        def do_POST(self):
            if not self.valid_host() or self.headers.get('Origin') != f'http://127.0.0.1:{self.server.server_port}':
                self.send_json(403, {'error': 'Invalid origin'})
                return
            if self.path != '/api/input':
                self.send_json(404, {'error': 'Not found'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 2048:
                    raise ValueError('Invalid input size')
                message = json.loads(self.rfile.read(length))
                if not isinstance(message, dict):
                    raise ValueError('Expected an input object')
                bridge.update(message)
            except (ValueError, TypeError, UnicodeError) as error:
                self.send_json(400, {'error': str(error)})
                return
            except PermissionError as error:
                self.send_json(409, {'error': str(error)})
                return
            except OSError:
                self.send_json(503, {'error': bridge.error})
                return
            self.send_json(200, bridge.status())

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--animal-crossing-pipe', type=Path, required=True)
    parser.add_argument('--kirby-pipe', type=Path, required=True)
    parser.add_argument('--port', type=int, default=5211)
    args = parser.parse_args()
    bridge = Bridge(dict(zip(GAMES, (args.animal_crossing_pipe, args.kirby_pipe))))
    server = make_server(bridge, args.port)
    stop = threading.Event()

    def watchdog():
        while not stop.wait(.1):
            try:
                bridge.expire()
            except OSError:
                pass

    thread = threading.Thread(target=watchdog, daemon=True)
    thread.start()
    print('Local controller bridge started. Both original games must already be running.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()
        bridge.close()


if __name__ == '__main__':
    main()
