"""Portable Yaz0 codec used to patch locally supplied GameCube data."""
from collections import deque
import struct


def decode(data):
    if data[:4] != b'Yaz0':
        raise ValueError('Not a Yaz0 stream')
    size = struct.unpack_from('>I', data, 4)[0]
    if size > 64 * 1024 * 1024:
        raise ValueError('Unexpected decompressed module size')
    output, position = bytearray(), 16
    while len(output) < size:
        code = data[position]
        position += 1
        for bit in range(7, -1, -1):
            if len(output) >= size:
                break
            if code & (1 << bit):
                output.append(data[position])
                position += 1
            else:
                first, second = data[position:position+2]
                position += 2
                length = first >> 4
                distance = ((first & 15) << 8 | second) + 1
                if not length:
                    length = data[position] + 18
                    position += 1
                else:
                    length += 2
                if distance > len(output) or len(output) + length > size:
                    raise ValueError('Invalid Yaz0 backreference')
                for _ in range(length):
                    output.append(output[-distance])
    return bytes(output)


def encode(data):
    output = bytearray(b'Yaz0' + struct.pack('>I', len(data)) + bytes(8))
    index = {}
    position = 0

    def remember(start, end):
        for value in range(start, end):
            if value >= 4096:
                old = data[value-4096:value-4093]
                queue = index.get(old)
                if queue:
                    queue.popleft()
                    if not queue:
                        del index[old]
            if value+3 <= len(data):
                index.setdefault(data[value:value+3], deque()).append(value)

    while position < len(data):
        control_offset = len(output)
        output.append(0)
        code = 0
        for bit in range(7, -1, -1):
            if position >= len(data):
                break
            best, previous = 0, 0
            maximum = min(273, len(data) - position)
            candidates = index.get(data[position:position+3], ())
            for count, candidate in enumerate(reversed(candidates)):
                if count >= 12:
                    break
                if data[candidate:candidate+maximum] == data[position:position+maximum]:
                    best, previous = maximum, candidate
                    break
                low, high = 3, maximum
                while low < high:
                    middle = (low + high + 1) // 2
                    if data[candidate:candidate+middle] == data[position:position+middle]:
                        low = middle
                    else:
                        high = middle - 1
                if low > best:
                    best, previous = low, candidate
            if best >= 3:
                distance = position - previous - 1
                if best >= 18:
                    output.extend((distance >> 8, distance & 255, best - 18))
                else:
                    output.extend((((best - 2) << 4) | (distance >> 8), distance & 255))
                remember(position, position+best)
                position += best
            else:
                code |= 1 << bit
                output.append(data[position])
                remember(position, position+1)
                position += 1
        output[control_offset] = code
    return bytes(output)
