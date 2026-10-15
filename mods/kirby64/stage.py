"""Add a static original Tom Nook cameo to Kirby's first original stage."""

import hashlib
import math
import struct

from .animal_assets import extract_nook, relocate, u32
from .checksum import repair
from .crossover import REL_SHA1


def add_nook(rom, original_rel):
    if hashlib.sha1(original_rel).hexdigest() != REL_SHA1:
        raise ValueError("Expected the supported original Animal Crossing module")
    linked, base = relocate(original_rel)
    output = bytearray(rom)
    start, end = struct.unpack_from(">II", output, 0x76498)
    if (start, end) != (0x128E770, 0x12B4420):
        raise ValueError("Expected the original first-stage geometry table entry")
    geometry = bytearray(output[start:end])
    triangles = extract_nook(original_rel)
    palette = []
    for value in struct.unpack_from(">16H", linked, base + 0x38C980):
        if value & 0x8000:
            color = [((value >> shift) & 31) * 255 // 31 for shift in (10, 5, 0)] + [
                255
            ]
        else:
            color = [((value >> shift) & 15) * 17 for shift in (8, 4, 0)] + [
                ((value >> 12) & 7) * 255 // 7
            ]
        palette.append(color)

    def append(data):
        geometry.extend(bytes((-len(geometry)) % 8))
        address = 0x04000000 | len(geometry)
        geometry.extend(data)
        return address

    materials = {}
    for triangle in triangles:
        material = tuple(triangle[0][3])
        if material in materials:
            continue
        segment, offset, width, height = material
        if segment not in (8, 11):
            raise ValueError("Unexpected original NPC texture segment")
        atlas = base + {8: 0x38C9A0, 11: 0x38D1A0}[segment] + offset
        pixels = bytearray()
        for y in range(height):
            for x in range(width):
                index = (
                    ((y // 8) * ((width + 7) // 8) + x // 8) * 32
                    + (y % 8) * 4
                    + (x % 8) // 2
                )
                color_index = (linked[atlas + index] >> (0 if x % 2 else 4)) & 15
                red, green, blue, alpha = palette[color_index]
                pixels.extend(
                    struct.pack(
                        ">H",
                        ((red >> 3) << 11)
                        | ((green >> 3) << 6)
                        | ((blue >> 3) << 1)
                        | (alpha >= 128),
                    )
                )
        materials[material] = append(pixels)

    vertices = bytearray()
    for triangle in triangles:
        for position, color, uv, material in triangle:
            x, y, z = position
            # A scenery cameo behind the original route; original collisions and
            # enemies remain intact. This is not an interactive NPC actor.
            position = (round(x * 0.02 - 2780), round(y * 0.02), round(z * 0.02 - 70))
            vertices.extend(
                struct.pack(">3hH2h4B", *position, 0, *uv, 255, 255, 255, 255)
            )
    vertex_address = append(vertices)
    commands = []

    def emit(word0, word1):
        commands.append(struct.pack(">II", word0, word1))

    # Standard F3DEX2 state: unlit textured vertices, depth and alpha testing.
    for command in (
        (0xE7000000, 0),
        (0xD9F1FBFF, 0),
        (0xD9FFFFFF, 0x200005),
        (0xE3000A01, 0),
        (0xFC121824, 0xFF33FFFF),
        (0xE200001C, 0x553078),
        (0xD7000002, 0xFFFFFFFF),
    ):
        emit(*command)
    previous = None
    for index, triangle in enumerate(triangles):
        material = tuple(triangle[0][3])
        segment, offset, width, height = material
        if material != previous:
            emit(0xE7000000, 0)
            emit(0xFD100000, materials[material])
            tile = (
                (1 << 18)
                | (round(math.log2(height)) << 14)
                | (1 << 8)
                | (round(math.log2(width)) << 4)
            )
            emit(0xF5100000, 0x07000000 | tile)
            emit(0xE6000000, 0)
            line = (width * 2 + 7) // 8
            emit(
                0xF3000000,
                0x07000000 | ((width * height - 1) << 12) | ((2048 + line - 1) // line),
            )
            emit(0xE7000000, 0)
            emit(0xF5100000 | (line << 9), tile)
            emit(0xF2000000, ((width - 1) * 4 << 12) | ((height - 1) * 4))
            previous = material
        emit(0x01003006, vertex_address + index * 48)
        emit(0x05000204, 0)
    emit(0xDF000000, 0)
    display_list = append(b"".join(commands))
    entry = append(struct.pack(">4I", 0, display_list, 4, 0))
    layout = u32(geometry, 0) & 0xFFFFFF
    if u32(geometry, layout + 4) != 0:
        raise ValueError("Expected an empty original root display list")
    struct.pack_into(">I", geometry, layout + 4, entry)
    new_start = 0x1F00000
    new_end = new_start + ((len(geometry) + 15) & ~15)
    if new_end > len(output) or any(
        value != 255 for value in output[new_start:new_end]
    ):
        raise ValueError("Expected unused original ROM padding")
    output[new_start : new_start + len(geometry)] = geometry
    struct.pack_into(">II", output, 0x76498, new_start, new_end)
    repair(output)
    return bytes(output)
