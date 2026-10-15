import base64
from pathlib import Path
import tempfile
import time
import unittest
import wave
from native_bridge.audio import Audio
from native_bridge.frames import Frames

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9uoAAAAASUVORK5CYII=')


class MediaTests(unittest.TestCase):
    def test_completed_live_frame_is_cached_and_partial_image_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            frames = Frames({'animal-crossing': directory})
            try:
                path = Path(directory) / 'framedump_1.png'
                path.write_bytes(PNG)
                deadline = time.monotonic() + 2
                while not frames.get('animal-crossing') and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertEqual(frames.get('animal-crossing'), PNG)
                (Path(directory) / 'framedump_2.png').write_bytes(PNG[:24])
                time.sleep(.15)
                self.assertEqual(frames.get('animal-crossing'), PNG)
            finally:
                frames.close()

    def test_pcm_cursor_is_aligned_and_rejects_invalid_stream(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'GAFE01_test_dspdump.wav'
            with wave.open(str(path), 'wb') as output:
                output.setnchannels(2)
                output.setsampwidth(2)
                output.setframerate(32000)
                output.writeframes(b'\x01\x00\x02\x00' * 8000)
            audio = Audio({'animal-crossing': directory})
            chunk = audio.get('animal-crossing', 'dsp', -1)
            self.assertEqual(chunk['rate'], 32000)
            self.assertEqual(len(base64.b64decode(chunk['pcm'])) % 4, 0)
            self.assertGreater(chunk['next'], 44)
            self.assertEqual(audio.get('animal-crossing', 'dsp', chunk['next'])['pcm'], '')
            with self.assertRaises(ValueError):
                audio.get('animal-crossing', '../private', -1)
