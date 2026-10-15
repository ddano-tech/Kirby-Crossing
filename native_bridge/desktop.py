"""Mac desktop entry point: choose local originals once, then play in the browser."""
import json
import hashlib
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser


def choose(prompt):
    script = f'POSIX path of (choose file with prompt "{prompt}")'
    return subprocess.check_output(['osascript', '-e', script], text=True).strip()


def main():
    home = Path.home() / 'Library/Application Support/Kirby-Crossing'
    home.mkdir(parents=True, exist_ok=True)
    bundle = Path('/Applications/Dolphin.app/Contents/MacOS')
    dolphin = next((bundle / name for name in ('Dolphin', 'dolphin-emu') if (bundle / name).is_file()), None)
    converter = next((bundle / name for name in ('DolphinTool', 'dolphin-tool') if (bundle / name).is_file()), None)
    if not dolphin:
        raise SystemExit('Install Dolphin in Applications, then run this launcher again.')
    manifest = home / 'games/games.json'
    patch = Path(__file__).resolve().parent.parent / 'mods/animal_crossing/draft.kcd'
    try:
        games = json.loads(manifest.read_text())
        prepared = (games.get('recipe_version') == 2 and
                    games.get('patch_sha256') == hashlib.sha256(patch.read_bytes()).hexdigest() and
                    all(Path(games[key]).is_file() for key in ('animal_crossing', 'kirby_rom')))
    except (OSError, ValueError, KeyError, TypeError):
        prepared = False
    if not prepared:
        ac = choose('Choose your Animal Crossing USA RVZ, ISO, or ZIP')
        kirby = choose('Choose your Kirby 64 USA WAD, Z64, or ZIP')
        command = [sys.executable, '-m', 'native_bridge.prepare', '--animal-crossing', ac,
                   '--kirby', kirby, '--output', str(home / 'games')]
        if converter:
            command += ['--dolphin-tool', str(converter)]
        subprocess.run(command, check=True)
    games = json.loads(manifest.read_text())

    def open_when_ready():
        for _ in range(100):
            try:
                urllib.request.urlopen('http://127.0.0.1:5211/api/state', timeout=1).close()
                webbrowser.open('http://127.0.0.1:5211')
                return
            except OSError:
                time.sleep(.2)

    threading.Thread(target=open_when_ready, daemon=True).start()
    subprocess.run([sys.executable, '-m', 'native_bridge.launch', '--dolphin', str(dolphin),
                    '--animal-crossing', games['animal_crossing'], '--kirby-rom', games['kirby_rom'],
                    '--profiles', str(home / 'profiles')], check=True)


if __name__ == '__main__':
    main()
