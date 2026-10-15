# SPDX-License-Identifier: GPL-2.0-or-later
# N64 checksum procedure: Parasyte (2005), based on Andreas Sterbenz;
# repair utility additions by spinout (2010). See COPYING.
"""Header checksum support for the supported CIC-6103 original."""
import struct
import zlib


def calculate(data):
    if zlib.crc32(data[0x40:0x1000]) != 0x0B050EE0:
        raise ValueError("Expected the supported CIC-6103 boot code")
    t1 = t2 = t3 = t4 = t5 = t6 = 0xA3886759
    mask = 0xFFFFFFFF
    for (word,) in struct.iter_unpack(">I", data[0x1000:0x101000]):
        total = t6 + word
        if total > mask:
            t4 = (t4 + 1) & mask
        t6 = total & mask
        t3 ^= word
        shift = word & 31
        rotated = ((word << shift) | (word >> ((32 - shift) & 31))) & mask
        t5 = (t5 + rotated) & mask
        t2 ^= rotated if t2 > word else t6 ^ word
        t1 = (t1 + (t5 ^ word)) & mask
    return ((t6 ^ t4) + t3) & mask, ((t5 ^ t2) + t1) & mask


def repair(data):
    struct.pack_into(">II", data, 0x10, *calculate(data))
