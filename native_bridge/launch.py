"""Launch the original-game browser bridge using a dedicated Dolphin profile."""
import argparse
import fcntl
import json
from pathlib import Path
import os
import signal
import subprocess
import threading
import time

from native_bridge.server import Bridge, GAMES, make_server
from native_bridge.frames import Frames
from native_bridge.audio import Audio


def write_profile(user, classic):
    config = user / 'Config'
    config.mkdir(parents=True, exist_ok=True)
    fifo = user / 'Pipes' / 'bridge'
    fifo.parent.mkdir(exist_ok=True)
    if not fifo.exists():
        os.mkfifo(fifo)
    # These are dedicated bridge profiles; existing player profiles are not used.
    (config / 'Dolphin.ini').write_text('[Core]\nCPUThread = False\nJITFollowBranch = False\n[Input]\nBackgroundInput = True\n[DSP]\nBackend = No Audio Output\n')
    pad = '[GCPad1]\nDevice = Pipe/0/bridge\n'
    for name in ('A', 'B', 'X', 'Y', 'Z', 'L', 'R'):
        pad += f'Buttons/{name} = `Button {name}`\n'
    pad += 'Buttons/Start = `Button START`\n'
    for direction in ('Up', 'Down', 'Left', 'Right'):
        pad += f'D-Pad/{direction} = `Button D_{direction.upper()}`\n'
    for direction, axis in (('Up', 'Y +'), ('Down', 'Y -'), ('Left', 'X -'), ('Right', 'X +')):
        pad += f'Main Stick/{direction} = `Axis MAIN {axis}`\n'
        pad += f'C-Stick/{direction} = `Axis C {axis}`\n'
    (config / 'GCPadNew.ini').write_text(pad)
    if classic:
        remote = '[Wiimote1]\nSource = 1\nDevice = Pipe/0/bridge\nExtension = Classic\nOptions/Always Connected = True\nButtons/A = `Button A`\n'
        for name in ('A', 'B', 'X', 'Y', 'L', 'R'):
            remote += f'Classic/Buttons/{name} = `Button {name}`\n'
        remote += 'Classic/Buttons/+ = `Button START`\nClassic/Buttons/ZL = `Button Z`\n'
        for direction in ('Up', 'Down', 'Left', 'Right'):
            remote += f'Classic/D-Pad/{direction} = `Button D_{direction.upper()}`\n'
        for direction, axis in (('Up', 'Y +'), ('Down', 'Y -'), ('Left', 'X -'), ('Right', 'X +')):
            remote += f'Classic/Left Stick/{direction} = `Axis MAIN {axis}`\n'
            remote += f'Classic/Right Stick/{direction} = `Axis C {axis}`\n'
        (config / 'WiimoteNew.ini').write_text(remote)
    return fifo


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dolphin', required=True, type=Path)
    parser.add_argument('--animal-crossing', required=True, type=Path)
    parser.add_argument('--kirby', type=Path, help='Legacy Kirby Virtual Console WAD')
    parser.add_argument('--kirby-rom', type=Path, help='Original Kirby 64 ROM for the browser runtime')
    parser.add_argument('--n64-assets', type=Path, default=Path(__file__).resolve().parent.parent / 'vendor/n64')
    parser.add_argument('--profiles', required=True, type=Path, help='Dedicated bridge profile directory (reused to preserve saves)')
    parser.add_argument('--port', type=int, default=5211)
    parser.add_argument('--headless', action='store_true')
    parser.add_argument('--video-backend', choices=('OGL', 'Vulkan', 'Software Renderer'))
    parser.add_argument('--diagnostics', action='store_true')
    parser.add_argument('--keep-dumps', action='store_true', help='Retain temporary audio dumps after exit for debugging')
    parser.add_argument('--proot', type=Path, help='Optional local Linux resource-path adapter')
    parser.add_argument('--sys-root', type=Path)
    args = parser.parse_args()
    if bool(args.kirby) == bool(args.kirby_rom):
        parser.error('Choose --kirby-rom (recommended) or --kirby')
    for path in (args.dolphin, args.animal_crossing, args.kirby_rom or args.kirby):
        if not path.is_file():
            parser.error(f'File missing: {path}')
    marker = args.profiles / 'bridge-profile.json'
    if args.profiles.exists():
        try:
            owned = json.loads(marker.read_text()) == {'format': 1}
        except (OSError, ValueError):
            owned = False
        if not owned:
            parser.error('Use a new directory or an existing dedicated bridge profile; existing player profiles are protected.')
    if args.proot and not args.sys_root:
        parser.error('--proot requires --sys-root')
    args.profiles.mkdir(parents=True, exist_ok=True)
    profile_lock = (args.profiles / 'bridge.lock').open('a+')
    try:
        fcntl.flock(profile_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        profile_lock.close()
        parser.error('This dedicated game profile is already running.')
    marker.write_text(json.dumps({'format': 1}) + '\n')
    processes, logs, readers = {}, {}, {}
    prior_audio = {}
    bridge = server = frames = None
    stop = threading.Event()
    for shutdown_signal in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(shutdown_signal, lambda *_: stop.set())
    try:
        paths = {}
        for game, image in zip(GAMES, (args.animal_crossing, args.kirby)):
            if game == GAMES[1] and args.kirby_rom:
                continue
            user = args.profiles / game
            audio_folder = user / 'Dump' / 'Audio'
            prior_audio[game] = {path.name for pattern in ('*_dspdump*.wav', '*_dtkdump*.wav')
                                 for path in audio_folder.glob(pattern)}
            if (user / 'Config' / 'Dolphin.ini').exists():
                paths[game] = user / 'Pipes' / 'bridge'
            else:
                paths[game] = write_profile(user, game == GAMES[1])
            # Keep a startup reader until Dolphin opens its own FIFO; never hide a dead process.
            readers[game] = os.open(paths[game], os.O_RDONLY | os.O_NONBLOCK)
            command = [str(args.dolphin), '--user=' + str(user.resolve()), '--exec=' + str(image.resolve())]
            command += ['-C', 'Dolphin.DSP.Backend=No Audio Output']
            if args.headless:
                command += ['--platform=headless', '--video_backend=' + (args.video_backend or 'Vulkan')]
            elif args.video_backend:
                command += ['--video_backend=' + args.video_backend]
            command += ['-C', 'Dolphin.Movie.DumpFrames=True', '-C', 'Dolphin.Movie.DumpFramesSilent=True',
                        '-C', 'Graphics.Settings.DumpFramesAsImages=True', '-C', 'Graphics.Settings.PNGCompressionLevel=1']
            command += ['-C', 'Dolphin.DSP.DumpAudio=True', '-C', 'Dolphin.DSP.DumpAudioSilent=True']
            (user / 'Logs').mkdir(exist_ok=True)
            (user / 'Config' / 'Logger.ini').write_text('[Options]\nWriteToFile = True\nWriteToConsole = True\nVerbosity = 4\n[Logs]\nOSREPORT = True\n')
            if args.diagnostics:
                (user / 'Logs').mkdir(exist_ok=True)
                (user / 'Config' / 'Logger.ini').write_text('[Options]\nWriteToFile = True\nWriteToConsole = True\nVerbosity = 5\n[Logs]\nCORE = True\nBOOT = True\nCOMMON = True\nVIDEO = True\nOSREPORT = True\n')
            if args.proot:
                command = [str(args.proot), '-b', str(args.sys_root) + ':/usr/share/games/dolphin-emu/sys'] + command
            logs[game] = (user / 'console.log').open('w')
            processes[game] = subprocess.Popen(command, stdout=logs[game], stderr=subprocess.STDOUT, start_new_session=True)
        bridge = Bridge(paths, virtual_games=(GAMES[1],) if args.kirby_rom else ())
        frames = Frames({game: args.profiles / game / 'Dump' / 'Frames' for game in processes})
        audio = Audio({game: args.profiles / game / 'Dump' / 'Audio' for game in GAMES})
        server = make_server(bridge, args.port, frames, audio, args.kirby_rom, args.n64_assets)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print('Animal Crossing launched; browser game service started.', flush=True)
        log_path = args.profiles / GAMES[0] / 'Logs' / 'dolphin.log'
        log_offset = log_path.stat().st_size if log_path.exists() else 0
        pending_log = ''
        while not stop.wait(.1):
            bridge.expire()
            if log_path.exists():
                with log_path.open('r', errors='replace') as log:
                    if log_path.stat().st_size < log_offset:
                        log_offset = 0
                        pending_log = ''
                    log.seek(log_offset)
                    lines = log.read()
                    log_offset = log.tell()
                lines, _, pending_log = (pending_log + lines).rpartition('\n')
                if 'KIRBY_CROSSING_PORTAL:ENTER' in lines and bridge.active == GAMES[0]:
                    bridge.switch_game(GAMES[1])
                    print('In-game Star Portal activated: control switched to Kirby 64.', flush=True)
            for game, process in processes.items():
                if process.poll() is not None:
                    raise RuntimeError(f'{game} exited ({process.returncode}); inspect {args.profiles / game / "console.log"}')
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        if server:
            server.shutdown()
            server.server_close()
        if frames:
            frames.close()
        if bridge:
            bridge.close()
        for process in processes.values():
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
        for fd in readers.values():
            os.close(fd)
        for log in logs.values():
            log.close()
        if not args.keep_dumps:
            for game, existing in prior_audio.items():
                for pattern in ('*_dspdump*.wav', '*_dtkdump*.wav'):
                    for path in (args.profiles / game / 'Dump' / 'Audio').glob(pattern):
                        if path.name not in existing:
                            path.unlink(missing_ok=True)
        profile_lock.close()


if __name__ == '__main__':
    main()
