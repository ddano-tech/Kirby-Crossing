"""Transfer an original Animal Crossing ground texture into original Kirby 64."""

import hashlib

ROM_SHA1 = "6cea2d46b929a3bb347b060a77fccc83526fb855"
REL_SHA1 = "c59d278ad8542bb05d6cbb632f60a0db05bef203"
GRASS_OFFSET = 9921888
GRASS_SHA256 = "85d3f30ff8842702f81355af9b891cf7c663bc152e5f6e0ffc1bf6b8f957cf04"
TARGET_OFFSET = 0x1C3E48A
TARGET_SHA256 = "e83d530c86f0e08812c6430050fb8a18a5a18e6a8d131611f99be8897f03b49b"


def transfer_ground(rom, original_rel):
    if hashlib.sha1(rom).hexdigest() != ROM_SHA1:
        raise ValueError("Expected the supported original Kirby 64 ROM")
    if hashlib.sha1(original_rel).hexdigest() != REL_SHA1:
        raise ValueError("Expected the supported original Animal Crossing module")
    source = original_rel[GRASS_OFFSET : GRASS_OFFSET + 512]
    target = rom[TARGET_OFFSET : TARGET_OFFSET + 512]
    if (
        hashlib.sha256(source).hexdigest() != GRASS_SHA256
        or hashlib.sha256(target).hexdigest() != TARGET_SHA256
    ):
        raise ValueError("Original ground texture verification failed")
    # GameCube CI4 stores 8x8 tiles. Kirby's stage texture is linear I4;
    # preserve the original triangle pattern and use the stage's green tint.
    levels = (5, 7, 9, 13)
    pixels = []
    for y in range(32):
        for x in range(32):
            offset = ((y // 8) * 4 + x // 8) * 32 + (y % 8) * 4 + (x % 8) // 2
            index = (source[offset] >> (0 if x % 2 else 4)) & 15
            if index >= len(levels):
                raise ValueError("Unexpected original grass palette index")
            pixels.append(levels[index])
    replacement = bytes((pixels[i] << 4) | pixels[i + 1] for i in range(0, 1024, 2))
    result = bytearray(rom)
    result[TARGET_OFFSET : TARGET_OFFSET + 512] = replacement
    # The N64 header CRC covers the first MiB only, which is unchanged.
    assert result[:0x101000] == rom[:0x101000]
    return bytes(result)
