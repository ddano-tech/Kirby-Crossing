"""Generate original replacement geometry for the crossover character and portal."""
import math
from pathlib import Path


def ellipsoid(center, radius, color, rows=6, columns=10):
    def point(row, col):
        lat = -math.pi / 2 + math.pi * row / rows
        lon = 2 * math.pi * col / columns
        normal = (math.cos(lat) * math.sin(lon), math.sin(lat), math.cos(lat) * math.cos(lon))
        shade = .65 + .35 * max(0, -.35 * normal[0] + .8 * normal[1] + .45 * normal[2])
        return (*[round(center[i] + radius[i] * normal[i]) for i in range(3)],
                *[round(v * shade) for v in color], 255)
    return [[point(r, c), point(r, c+1), point(r+1, c+1), point(r+1, c)]
            for r in range(rows) for c in range(columns)]


def emit(name, quads):
    vertices = ',\n'.join('    {%d, %d, %d, 0, 0, 0, %d, %d, %d, %d}' % v for q in quads for v in q)
    commands = ['gsDPPipeSync()', 'gsSPTexture(0, 0, 0, 0, G_OFF)',
                'gsDPSetCycleType(G_CYC_1CYCLE)', 'gsDPSetTextureLUT(G_TT_NONE)',
                'gsDPSetCombineMode(G_CC_SHADE, G_CC_SHADE)',
                'gsDPSetRenderMode(G_RM_AA_ZB_OPA_SURF, G_RM_AA_ZB_OPA_SURF2)',
                'gsSPLoadGeometryMode(G_ZBUFFER | G_SHADE | G_SHADING_SMOOTH)']
    for i in range(len(quads)):
        commands += [f'gsSPVertex({name}_vertices + {i*4}, 4, 0)',
                     'gsSP2Triangles(0, 1, 2, 0, 0, 2, 3, 0)']
    commands.append('gsSPEndDisplayList()')
    return f'static Vtx {name}_vertices[] = {{\n{vertices}\n}};\nstatic Gfx {name}[] = {{\n    ' + ',\n    '.join(commands) + '\n};\n'


def generate(destination):
    parts = [((0, 1750, 0), (1450, 1400, 1300), (255, 154, 197)),
             ((-1450, 1600, 0), (570, 600, 700), (255, 154, 197)),
             ((1450, 1600, 0), (570, 600, 700), (255, 154, 197)),
             ((-660, 350, 450), (780, 350, 1050), (219, 35, 78)),
             ((660, 350, 450), (780, 350, 1050), (219, 35, 78)),
             ((-460, 2290, 1190), (180, 440, 120), (22, 24, 62)),
             ((460, 2290, 1190), (180, 440, 120), (22, 24, 62)),
             ((-460, 2450, 1290), (78, 150, 38), (255, 255, 255)),
             ((460, 2450, 1290), (78, 150, 38), (255, 255, 255)),
             ((-900, 1800, 1050), (240, 140, 80), (255, 80, 131)),
             ((900, 1800, 1050), (240, 140, 80), (255, 80, 131)),
             ((0, 1640, 1280), (190, 125, 60), (113, 27, 64))]
    body = [q for p in parts for q in ellipsoid(*p)]
    ring = []
    for i in range(20):
        for j in range(6):
            quad = []
            for a, b in ((i,j),(i+1,j),(i+1,j+1),(i,j+1)):
                theta, phi = a*math.tau/20, b*math.tau/6
                radius = 2400 + 330*math.cos(phi)
                quad.append((round(radius*math.cos(theta)), round(2800+radius*math.sin(theta)),
                             round(330*math.sin(phi)), 120, 220, 255, 255))
            ring.append(quad)
    for i in range(10):
        a, b = (math.pi/2 + i*math.pi/5), (math.pi/2 + (i+1)*math.pi/5)
        r1, r2 = (1500 if i%2==0 else 650), (1500 if (i+1)%2==0 else 650)
        center = (0,2800,200,255,219,60,255)
        ring.append([center, (round(r1*math.cos(a)),round(2800+r1*math.sin(a)),200,255,219,60,255),
                     (round(r2*math.cos(b)),round(2800+r2*math.sin(b)),200,255,219,60,255), center])
    Path(destination).write_text('/* Generated original crossover geometry; no extracted game assets. */\n'
                                 + emit('kc_kirby_model', body) + emit('kc_portal_model', ring))


if __name__ == '__main__':
    import sys
    generate(sys.argv[1])
