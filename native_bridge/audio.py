"""Read bounded PCM chunks from Dolphin's own audio dump streams."""
import base64
from pathlib import Path
import struct


class Audio:
    def __init__(self, folders):
        self.folders = {game: Path(path) for game, path in folders.items()}

    def get(self, game, stream, offset):
        if stream not in ('dsp', 'dtk') or type(offset) is not int or offset < -1:
            raise ValueError('Invalid audio cursor')
        files = list(self.folders[game].glob(f'*_{stream}dump*.wav'))
        if not files:
            return None
        path = max(files, key=lambda p: p.stat().st_mtime_ns)
        with path.open('rb') as source:
            header = source.read(44)
            if len(header) != 44 or header[:4] != b'RIFF' or header[8:12] != b'WAVE' or header[36:40] != b'data':
                return None
            encoding, channels, rate = struct.unpack_from('<HHI', header, 20)
            bits = struct.unpack_from('<H', header, 34)[0]
            if encoding != 1 or channels != 2 or bits != 16 or not 8000 <= rate <= 192000:
                raise ValueError('Unsupported emulator audio format')
            size = path.stat().st_size
            # Join the live edge, and drop old backlog after a paused/slow browser.
            if offset < 44 or offset > size or size - offset > rate * 4:
                offset = max(44, size - int(rate * 4 * .15))
            offset = 44 + ((offset - 44) // 4) * 4
            source.seek(offset)
            data = source.read(65536)
            data = data[:len(data) // 4 * 4]
        return {'file': path.name, 'rate': rate, 'channels': 2, 'next': offset + len(data),
                'pcm': base64.b64encode(data).decode('ascii')}
