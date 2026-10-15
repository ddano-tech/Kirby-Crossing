"""Pack a private GameCube image from extracted user data and rebuilt binaries."""
import argparse
from pathlib import Path
import struct


def align(value, boundary=32):
    return (value + boundary - 1) & -boundary


def pack(extracted, dol, rel, output):
    system = extracted / 'sys'
    boot = bytearray((system / 'boot.bin').read_bytes())
    if boot[:6] != b'GAFE01' or len(boot) != 0x440:
        raise ValueError('Expected Animal Crossing USA GameCube header')
    bi2 = (system / 'bi2.bin').read_bytes()
    loader = (system / 'apploader.img').read_bytes()
    if len(bi2) != 0x2000:
        raise ValueError('Unexpected GameCube BI2 size')
    entries, names, contents = [], bytearray(b'\0'), []
    entries.append([0x01000000, 0, 0])

    def walk(folder, parent):
        for path in sorted(folder.iterdir(), key=lambda p: p.name):
            if path.is_symlink():
                raise ValueError('Disc input must not contain symlinks')
            offset = len(names)
            names.extend(path.name.encode('ascii') + b'\0')
            if path.is_dir():
                index = len(entries)
                entries.append([0x01000000 | offset, parent, 0])
                walk(path, index)
                entries[index][2] = len(entries)
            else:
                data = rel.read_bytes() if path.relative_to(extracted / 'files').as_posix() == 'foresta.rel.szs' else path.read_bytes()
                entries.append([offset, 0, len(data)])
                contents.append((len(entries)-1, data))
    walk(extracted / 'files', 0)
    entries[0][2] = len(entries)
    dol_data = dol.read_bytes()
    dol_offset = align(0x2440 + len(loader))
    fst_offset = align(dol_offset + len(dol_data))
    fst_size = len(entries)*12 + len(names)
    cursor = align(fst_offset + fst_size)
    for index, data in contents:
        entries[index][1] = cursor
        cursor = align(cursor + len(data))
    struct.pack_into('>4I', boot, 0x420, dol_offset, fst_offset, fst_size, fst_size)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('xb') as stream:
        stream.write(boot)
        stream.write(bi2)
        stream.write(loader)
        stream.seek(dol_offset)
        stream.write(dol_data)
        stream.seek(fst_offset)
        for entry in entries:
            stream.write(struct.pack('>3I', *entry))
        stream.write(names)
        for index, data in contents:
            stream.seek(entries[index][1])
            stream.write(data)
        stream.truncate(cursor)
    print('Private mod image written:', output, cursor, 'bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extracted', type=Path, required=True)
    parser.add_argument('--dol', type=Path, required=True)
    parser.add_argument('--rel', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    pack(args.extracted, args.dol, args.rel, args.output)
