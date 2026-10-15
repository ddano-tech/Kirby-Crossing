"""Prepare the draft from locally supplied originals; never distribute game data."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import zipfile

from mods.animal_crossing import delta, yaz0
from mods.animal_crossing.pack_disc import pack
from mods.kirby64.crossover import transfer_ground
from mods.kirby64.stage import add_nook

ROM_SHA1 = '6cea2d46b929a3bb347b060a77fccc83526fb855'


def unpack_input(source, directory, extensions):
    if source.suffix.lower() != '.zip':
        return source
    with zipfile.ZipFile(source) as archive:
        candidates = [i for i in archive.infolist() if Path(i.filename).suffix.lower() in extensions
                      and not i.filename.startswith('__MACOSX/')]
        if len(candidates) != 1:
            raise ValueError('Choose an archive containing exactly one supported game file')
        info = candidates[0]
        if info.file_size > 1500 * 1024 * 1024:
            raise ValueError('Game archive is unexpectedly large')
        target = directory / ('input' + Path(info.filename).suffix.lower())
        with archive.open(info) as source_file, target.open('wb') as output:
            shutil.copyfileobj(source_file, output)
        return target


def extract_iso(image, destination):
    system = destination / 'sys'
    files = destination / 'files'
    system.mkdir(parents=True, exist_ok=True)
    files.mkdir(parents=True, exist_ok=True)
    with image.open('rb') as source:
        def read(offset, size):
            source.seek(offset)
            data = source.read(size)
            if len(data) != size:
                raise ValueError('Truncated GameCube disc')
            return data
        boot = read(0, 0x440)
        if boot[:6] != b'GAFE01' or boot[7] != 0:
            raise ValueError('This draft requires Animal Crossing USA, revision 0')
        (system / 'boot.bin').write_bytes(boot)
        (system / 'bi2.bin').write_bytes(read(0x440, 0x2000))
        loader = read(0x2440, 0x20)
        length, trailer = struct.unpack_from('>II', loader, 0x14)
        (system / 'apploader.img').write_bytes(read(0x2440, 0x20 + length + trailer))
        dol_offset, fst_offset, fst_size = struct.unpack_from('>III', boot, 0x420)
        header = read(dol_offset, 0x100)
        offsets = struct.unpack_from('>18I', header, 0)
        sizes = struct.unpack_from('>18I', header, 0x90)
        dol_size = max(offset+size for offset, size in zip(offsets, sizes))
        (system / 'main.dol').write_bytes(read(dol_offset, dol_size))
        if not 12 <= fst_size <= 16 * 1024 * 1024:
            raise ValueError('Invalid disc file table')
        fst = read(fst_offset, fst_size)
        count = struct.unpack_from('>I', fst, 8)[0]
        if not 0 < count * 12 <= len(fst):
            raise ValueError('Invalid disc file count')
        strings = fst[count*12:]
        stack = [(count, files)]
        for index in range(1, count):
            while index >= stack[-1][0]:
                stack.pop()
            field, offset, size = struct.unpack_from('>III', fst, index*12)
            name_offset = field & 0xffffff
            name = strings[name_offset:].split(b'\0', 1)[0].decode('ascii')
            if not name or name in ('.', '..') or '/' in name or '\\' in name:
                raise ValueError('Invalid disc filename')
            path = stack[-1][1] / name
            if field >> 24:
                if not index < size <= count:
                    raise ValueError('Invalid disc directory')
                path.mkdir(exist_ok=True)
                stack.append((size, path))
            else:
                path.write_bytes(read(offset, size))


def extract_kirby(source):
    if source.suffix.lower() == '.wad':
        from libWiiPy.title import Title
        from libWiiPy.archive import U8Archive
        title = Title()
        title.load_wad(source.read_bytes())
        romc = None
        for index in range(len(title.tmd.content_records)):
            content = title.get_content_by_index(index)  # Verify every original content hash.
            try:
                archive = U8Archive()
                archive.load(content)
            except (TypeError, ValueError):
                continue
            for name, data in zip(archive.file_name_list, archive.file_data_list):
                if Path(name).name == 'romc':
                    romc = data
        if not romc or romc[3] & 3 != 1:
            raise ValueError('Expected Kirby 64 USA Virtual Console ROMC type 1')
        size = romc[0] * 4194304
        if size != 33554432:
            raise ValueError('Unexpected Kirby ROM size')
        output, position = bytearray(), 4
        while len(output) < size:
            flags = romc[position]
            position += 1
            for bit in range(7, -1, -1):
                if flags & (1 << bit):
                    token = int.from_bytes(romc[position:position+2], 'big')
                    position += 2
                    length, distance = (token >> 12) + 3, (token & 4095) + 1
                    if distance > len(output):
                        raise ValueError('Invalid original ROMC data')
                    for _ in range(min(length, size-len(output))):
                        output.append(output[-distance])
                else:
                    output.append(romc[position])
                    position += 1
                if len(output) == size:
                    break
        rom = bytes(output)
    else:
        rom = source.read_bytes()
    if hashlib.sha1(rom).hexdigest() != ROM_SHA1:
        raise ValueError('Kirby ROM does not match the supported USA original')
    return rom


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--animal-crossing', required=True, type=Path)
    parser.add_argument('--kirby', required=True, type=Path)
    parser.add_argument('--dolphin-tool', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = args.output.resolve()
    root.mkdir(parents=True, exist_ok=True)
    ac_dir, kirby_dir = root / 'ac-input', root / 'kirby-input'
    ac_dir.mkdir(exist_ok=True)
    kirby_dir.mkdir(exist_ok=True)
    ac = unpack_input(args.animal_crossing, ac_dir, {'.iso', '.gcm', '.rvz'})
    kirby = unpack_input(args.kirby, kirby_dir, {'.wad', '.z64'})
    temporary_iso = None
    if ac.suffix.lower() == '.rvz':
        if not args.dolphin_tool:
            raise ValueError('DolphinTool is required to convert your RVZ')
        temporary_iso = ac_dir / 'converted.iso'
        if temporary_iso.exists():
            temporary_iso.unlink()
        print('Converting your original Animal Crossing disc…', flush=True)
        subprocess.run([str(args.dolphin_tool), 'convert', '-i', str(ac), '-o', str(temporary_iso), '-f', 'iso'], check=True)
        ac = temporary_iso
    extracted = root / 'extracted'
    print('Reading original disc and applying the verified character/portal patch…', flush=True)
    extract_iso(ac, extracted)
    original = yaz0.decode((extracted / 'files' / 'foresta.rel.szs').read_bytes())
    patch = Path(__file__).resolve().parent.parent / 'mods/animal_crossing/draft.kcd'
    modified = delta.apply(original, patch.read_bytes())
    compressed = root / 'crossover.rel.szs'
    compressed.write_bytes(yaz0.encode(modified))
    disc = root / 'Kirby-Crossing-draft.iso'
    if disc.exists():
        disc.unlink()
    pack(extracted, extracted / 'sys/main.dol', compressed, disc)
    print('Verifying and extracting your original Kirby 64 ROM…', flush=True)
    rom = root / 'Kirby64.z64'
    print('Transferring original Animal Crossing grass and the Tom Nook scenery cameo…', flush=True)
    rom.write_bytes(add_nook(transfer_ground(extract_kirby(kirby), original), original))
    manifest = {'animal_crossing': str(disc), 'kirby_rom': str(rom), 'recipe_version': 2,
                'patch_sha256': hashlib.sha256(patch.read_bytes()).hexdigest()}
    temporary_manifest = root / 'games.pending.json'
    temporary_manifest.write_text(json.dumps(manifest, indent=2))
    temporary_manifest.replace(root / 'games.json')
    if temporary_iso:
        temporary_iso.unlink()
    print('Private game files prepared. Your originals are unchanged.', flush=True)


if __name__ == '__main__':
    main()
