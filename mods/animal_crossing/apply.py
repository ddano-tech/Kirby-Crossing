"""Apply the crossover hooks to a DISPOSABLE copy of the uploaded AC source."""
import argparse
from pathlib import Path
import shutil
from generate_mesh import generate


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('Source revision/patch state differs: ' + old[:70])
    return text.replace(old, new, 1)


def apply(root):
    source = root / 'src/game/m_player.c'
    draw = root / 'src/game/m_player_draw.c_inc'
    if 'crossover.c_inc' in source.read_text():
        raise RuntimeError('Crossover already applied; use the existing build or a fresh copy.')
    original = source.read_text()
    original_draw = draw.read_text()
    changed = replace_once(original, '#include "../src/game/m_player_draw.c_inc"',
                           '#include "../src/game/crossover.c_inc"\n#include "../src/game/m_player_draw.c_inc"')
    changed = replace_once(changed, '    Player_actor_move_other_func2(actorx, game); //',
                           '    Player_actor_move_other_func2(actorx, game); //\n    kc_player_tick(actorx, game);')
    before, separator, after = original_draw.partition('static void Player_actor_draw_After_Culc_FootMarkPos')
    if not separator:
        raise RuntimeError('Expected skeleton callback boundary missing')
    changed_draw = replace_once(before, '    return TRUE;\n}',
                                '    *gfx_pp = NULL; /* Keep skeleton/attachment calculations, replace body only. */\n    return TRUE;\n}') + separator + after
    # There are multiple return sites; the first belongs to the before callback.
    changed_draw = replace_once(changed_draw,
        '    cKF_Si3_draw_R_SV(game, kf, mtx, &Player_actor_draw_Before, &Player_actor_draw_After, player);',
        '    kc_draw_character(actorx, game);\n    cKF_Si3_draw_R_SV(game, kf, mtx, &Player_actor_draw_Before, &Player_actor_draw_After, player);\n    kc_draw_portal(actorx, game);')
    source.write_text(changed)
    draw.write_text(changed_draw)
    shutil.copyfile(Path(__file__).with_name('crossover.c_inc'), source.with_name('crossover.c_inc'))
    generate(source.with_name('crossover_mesh.c_inc'))
    print('Crossover source hooks applied to', root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('build_copy', type=Path)
    apply(parser.parse_args().build_copy)
