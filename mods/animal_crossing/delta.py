"""Small content-defined binary patches: originals remain supplied by the player."""
import hashlib
from pathlib import Path
import struct
import zlib

GEAR = [int.from_bytes(hashlib.sha256(bytes([i])).digest()[:8], 'big') for i in range(256)]


def chunks(data):
    start = 0
    rolling = 0
    for i, byte in enumerate(data):
        rolling = ((rolling << 1) + GEAR[byte]) & 0xffffffffffffffff
        size = i + 1 - start
        if size >= 64 and ((rolling & 1023) == 0 or size >= 8192):
            yield start, data[start:i+1]
            start, rolling = i+1, 0
    if start < len(data):
        yield start, data[start:]


def create(original, target):
    index = {hashlib.sha256(data).digest(): (offset, len(data)) for offset, data in chunks(original)}
    operations = bytearray()
    for _, data in chunks(target):
        match = index.get(hashlib.sha256(data).digest())
        if match:
            operations += b'C' + struct.pack('>QI', *match)
        else:
            operations += b'I' + struct.pack('>I', len(data)) + data
    operations += b'E'
    return (b'KCD1' + hashlib.sha256(original).digest() + hashlib.sha256(target).digest()
            + struct.pack('>Q', len(target)) + zlib.compress(operations, 9))


def apply(original, patch):
    if patch[:4] != b'KCD1' or hashlib.sha256(original).digest() != patch[4:36]:
        raise ValueError('This patch requires the original Animal Crossing USA Rev 0 module')
    length = struct.unpack_from('>Q', patch, 68)[0]
    if length > 64 * 1024 * 1024:
        raise ValueError('Invalid target size')
    decoder = zlib.decompressobj()
    operations = decoder.decompress(patch[76:], length + 8 * 1024 * 1024)
    if not decoder.eof or decoder.unconsumed_tail:
        raise ValueError('Invalid patch data')
    position = 0
    output = bytearray()
    while position < len(operations):
        command = operations[position:position+1]
        position += 1
        if command == b'E':
            break
        if command == b'C':
            offset, size = struct.unpack_from('>QI', operations, position)
            position += 12
            if offset + size > len(original):
                raise ValueError('Invalid copy')
            output += original[offset:offset+size]
        elif command == b'I':
            size = struct.unpack_from('>I', operations, position)[0]
            position += 4
            output += operations[position:position+size]
            position += size
        else:
            raise ValueError('Invalid patch command')
        if len(output) > length:
            raise ValueError('Invalid patch output')
    if len(output) != length or hashlib.sha256(output).digest() != patch[36:68]:
        raise ValueError('Patched module verification failed')
    return bytes(output)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Create and verify a native module delta.')
    parser.add_argument('original', type=Path)
    parser.add_argument('target', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    original, target = args.original.read_bytes(), args.target.read_bytes()
    patch = create(original, target)
    if apply(original, patch) != target:
        raise RuntimeError('Patch roundtrip failed')
    args.output.write_bytes(patch)
    print('Verified module patch:', len(patch), 'bytes; full game data is not included.')
