"""Convert the original supplied Tom Nook model into static native stage geometry.

Only format descriptions and source offsets are included; assets come from the
verified original Animal Crossing module at preparation time.
"""

import struct
import math


def u32(b, o):
    return struct.unpack_from(">I", b, o)[0]


def matmul(a, b):
    return [
        [sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)
    ]


def identity():
    return [[int(i == j) for j in range(4)] for i in range(4)]


def transform(m, v):
    return [sum(m[i][j] * v[j] for j in range(3)) + m[i][3] for i in range(3)]


def matrix(t, r):
    m = identity()
    for i in range(3):
        m[i][3] = t[i]
    for axis in (2, 1, 0):
        a = r[axis] * math.pi / 1800
        s, c = math.sin(a), math.cos(a)
        q = identity()
        i, j = ((1, 2), (2, 0), (0, 1))[axis]
        q[i][i] = q[j][j] = c
        q[i][j] = -s
        q[j][i] = s
        m = matmul(m, q)
    return m


def relocate(raw):
    b = bytearray(raw)
    sections = [u32(b, u32(b, 16) + 8 * i) & ~3 for i in range(u32(b, 12))]
    imp = u32(b, 40)
    for x in range(imp, imp + u32(b, 44), 8):
        if u32(b, x) != u32(b, 0):
            continue
        p = u32(b, x + 4)
        where = 0
        while True:
            delta, kind, section, add = struct.unpack_from(">HBBI", b, p)
            p += 8
            if kind == 203:
                break
            if kind == 202:
                where = sections[section]
                continue
            where += delta
            if kind == 1:
                struct.pack_into(">I", b, where, sections[section] + add)
    return b, sections[5]


def extract_nook(raw):
    b, base = relocate(raw)
    flags = b[base + 0x2F8560 : base + 0x2F8560 + 26]
    keys = struct.unpack_from(">23h", b, base + 0x2F857C)
    fixed = struct.unpack_from(">58h", b, base + 0x2F85AC)
    ki = fi = di = 0

    def channel(flag):
        nonlocal ki, fi, di
        if flag:
            value = struct.unpack_from(">h", b, base + 0x2F8620 + di * 6 + 2)[0]
            di += keys[ki]
            ki += 1
        else:
            value = fixed[fi]
            fi += 1
        return value

    trans = [channel(flags[0] & (32 >> i)) for i in range(3)]
    rotations = [[channel(f & (4 >> i)) for i in range(3)] for f in flags]
    joints = [
        struct.unpack_from(">IBB3h", b, base + 0x38C840 + i * 12) for i in range(26)
    ]
    matrices = []
    models = []
    ji = 0

    def visit(parent):
        nonlocal ji
        i = ji
        ji += 1
        ptr, children, flag, *t = joints[i]
        m = matmul(parent, matrix(trans if i == 0 else t, rotations[i]))
        if ptr:
            models.append(ptr)
            matrices.append(m)
        for _ in range(children):
            visit(m)

    visit(identity())
    if (ji, len(models), ki, fi) != (26, 14, 23, 58):
        raise ValueError("Unexpected original NPC skeleton or animation")
    # GX RGB5A3 palette, and the original CI4 material/eye atlas.
    palette = []
    for v in struct.unpack_from(">16H", b, base + 0x38C980):
        if v & 0x8000:
            rgba = [((v >> s) & 31) * 255 // 31 for s in (10, 5, 0)] + [255]
        else:
            rgba = [((v >> s) & 15) * 17 for s in (8, 4, 0)] + [
                ((v >> 12) & 7) * 255 // 7
            ]
        palette.append(rgba)
    # This GameCube engine uses segment 8 for eyes and 11 for body textures.
    atlas = {8: base + 0x38C9A0, 11: base + 0x38D1A0}
    triangles = []
    for mi, ptr in enumerate(models):
        cache = {}
        current = mi
        texture = (4, 0, 16, 8)
        remaining = 0
        for off in range(ptr, ptr + 4096, 8):
            w0, w1 = struct.unpack_from(">II", b, off)
            op = w0 >> 24
            if op == 0xDF:
                break
            if remaining:
                packed = [
                    (w1 >> 4) & 32767,
                    ((w0 & 3) << 13) | ((w1 >> 19) & 8191),
                    (w0 >> 2) & 32767,
                    (w0 >> 17) & 32767,
                ]
            elif op == 0x0A:
                remaining = ((w0 >> 17) & 127) + 1
                packed = [
                    (w1 >> 4) & 32767,
                    ((w0 & 3) << 13) | ((w1 >> 19) & 8191),
                    (w0 >> 2) & 32767,
                ]
            else:
                if op == 0xDA:
                    current = (w1 & 0xFFFFFF) // 64
                elif op == 0xFD:
                    texture = (
                        w1 >> 24,
                        w1 & 0xFFFFFF,
                        (w0 & 1023) + 1,
                        (((w0 >> 10) & 255) + 1) * 4,
                    )
                elif op == 1:
                    count = (w0 >> 12) & 255
                    first = ((w0 >> 1) & 127) - count
                    for k in range(count):
                        v = struct.unpack_from(">3hH2h4B", b, w1 + k * 16)
                        pos = transform(matrices[current], v[:3])
                        seg, texoff, width, height = texture
                        x = max(0, min(width - 1, round(v[4] / 32)))
                        y = max(0, min(height - 1, round(v[5] / 32)))
                        ti = (
                            atlas.get(seg, atlas[11])
                            + texoff
                            + ((y // 8) * ((width + 7) // 8) + x // 8) * 32
                            + (y % 8) * 4
                            + (x % 8) // 2
                        )
                        ci = (b[ti] >> (0 if x % 2 else 4)) & 15
                        rgba = palette[ci]
                        cache[first + k] = (pos, rgba, (v[4], v[5]), texture)
                continue
            for tri in packed[:remaining]:
                idx = [(tri >> s) & 31 for s in (0, 5, 10)]
                if all(k in cache for k in idx):
                    triangles.append([(*cache[k][:3], texture) for k in idx])
            remaining = max(0, remaining - len(packed))
    if len(triangles) != 257:
        raise ValueError("Unexpected original Tom Nook triangle count")
    return triangles
