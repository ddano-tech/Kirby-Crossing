"""Cache completed Dolphin PNG dumps; retain at most three transient frames per game."""
from pathlib import Path
import threading
import time


class Frames:
    def __init__(self, folders):
        self.folders = {key: Path(value) for key, value in folders.items()}
        self.started = time.time()
        self.lock = threading.Lock()
        self.cache = {}
        self.stop = threading.Event()
        self.thread = threading.Thread(target=self.watch, daemon=True)
        self.thread.start()

    def watch(self):
        while not self.stop.wait(.08):
            for game, folder in self.folders.items():
                try:
                    files = sorted(((p.stat().st_mtime_ns, p) for p in folder.glob('framedump_*.png')
                                    if p.stat().st_mtime >= self.started), reverse=True)
                    for stamp, path in files[:3]:
                        with self.lock:
                            if self.cache.get(game, (None,))[0] == stamp:
                                break
                        if path.stat().st_size > 16*1024*1024:
                            continue
                        data = path.read_bytes()
                        if data.startswith(b'\x89PNG\r\n\x1a\n') and data[-8:-4] == b'IEND':
                            with self.lock:
                                self.cache[game] = (stamp, data)
                            break
                    for _, path in files[3:]:
                        path.unlink(missing_ok=True)
                except OSError:
                    continue

    def get(self, game):
        with self.lock:
            cached = self.cache.get(game)
            return cached[1] if cached else None

    def close(self):
        self.stop.set()
        self.thread.join(timeout=2)
