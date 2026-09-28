#!/usr/bin/env python3
"""アプリアイコン・起動画面の画像を作る（二枚葉のアイコン。2026-09-28 に利用者と決定した「C2」）。

葉の形はここに書いた多角形の座標が正本。形を変えるときはこのファイルを直して、
`python3 scripts/generate-icons.py` で assets/images/ の画像を作り直す。

座標は 180×180 の枠（中心が原点）で考える。Obsidian のロゴのように、平面の面を組み合わせて
宝石のような立体感を出し、光の当たる左上を明るく、右下を暗くしている。
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
SIZE = 1024
# 縁を滑らかにするため、大きく描いてから縮める倍率
SUPERSAMPLE = 4
FRAME = 180  # 座標を考えた枠の大きさ

WHITE = (255, 255, 255, 255)
DARK_BACKGROUND = (14, 19, 16, 255)  # テーマの bg（ダーク）#0E1310

# 大きい葉・小さい葉の面（中心が原点、葉先が上）。色は光の当たり方の順に明るい → 暗い
BIG_LEAF = [
    ([(0, -78), (-28, -34), (0, -18)], '#6FD99A'),
    ([(0, -78), (28, -34), (0, -18)], '#34A865'),
    ([(-28, -34), (-36, 14), (0, -18)], '#34A865'),
    ([(28, -34), (36, 14), (0, -18)], '#1E7F48'),
    ([(-36, 14), (0, -18), (0, 50)], '#1E7F48'),
    ([(36, 14), (0, -18), (0, 50)], '#0F4A2B'),
]
SMALL_LEAF = [
    ([(0, -56), (-18, -24), (0, -12)], '#C6EFD3'),
    ([(0, -56), (18, -24), (0, -12)], '#8FE0B0'),
    ([(-18, -24), (-24, 10), (0, -12)], '#8FE0B0'),
    ([(18, -24), (24, 10), (0, -12)], '#5FD08E'),
    ([(-24, 10), (0, -12), (0, 36)], '#5FD08E'),
    ([(24, 10), (0, -12), (0, 36)], '#34A865'),
]

# 二枚の葉の置き方: 根元 (0, 40) を中心に、小さい葉を左に 30°、大きい葉を右に 24° 傾ける
PIVOT_Y = 40
LEAVES = [  # (面, 回転°, 根元からの距離, 拡大率)。後のものが手前
    (SMALL_LEAF, -30, -44, 1.2),
    (BIG_LEAF, 24, -52, 1.05),
]
# Android のアダプティブアイコンでの葉の大きさ。端末ごとに丸などに切り抜かれるため、
# 葉の先まで中央の安全な範囲（直径の約 66% の円）に収まる大きさにする
ANDROID_LEAF_SCALE = 0.7
# 葉の束の外枠の中心を枠の中心に合わせる補正（計算で求めた値）
CENTERING = (-3.5, 21)


def leaf_polygons():
    """枠の座標系（中心が原点）での、すべての面の多角形と色"""
    polygons = []
    for facets, rotation, offset, scale in LEAVES:
        angle = math.radians(rotation)
        for points, color in facets:
            transformed = []
            for x, y in points:
                x, y = x * scale, y * scale + offset
                x, y = (x * math.cos(angle) - y * math.sin(angle),
                        x * math.sin(angle) + y * math.cos(angle) + PIVOT_Y)
                transformed.append((x + CENTERING[0], y + CENTERING[1]))
            polygons.append((transformed, color))
    return polygons


def render(background, leaf_scale, color_of=lambda color: color):
    """leaf_scale: 枠（180）に対する葉の大きさの倍率。1 ならアイコンと同じ比率"""
    canvas = SIZE * SUPERSAMPLE
    image = Image.new('RGBA', (canvas, canvas), background)
    draw = ImageDraw.Draw(image)
    unit = canvas / FRAME * leaf_scale
    for points, color in leaf_polygons():
        draw.polygon([(canvas / 2 + x * unit, canvas / 2 + y * unit) for x, y in points],
                     fill=color_of(color))
    return image.resize((SIZE, SIZE), Image.LANCZOS)


def grayscale(color):
    """iOS の色付き（tinted）アイコンは、明るさだけの画像にシステムが色を付ける"""
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    luminance = round(0.3 * r + 0.59 * g + 0.11 * b)
    # 明るい面ほど白くなるよう、明るさの幅を広げる
    level = min(255, round(luminance * 1.6))
    return (level, level, level, 255)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    transparent = (0, 0, 0, 0)
    outputs = {
        # iOS（角丸はシステムが付けるので、正方形を塗りつぶす）
        'icon.png': render(WHITE, 1),
        'ios-icon-dark.png': render(DARK_BACKGROUND, 1),
        'ios-icon-tinted.png': render((0, 0, 0, 255), 1, grayscale),
        # Android のアダプティブアイコン（背景と前景を重ねて、端末が形を切り抜く）
        'android-icon-foreground.png': render(transparent, ANDROID_LEAF_SCALE),
        'android-icon-background.png': Image.new('RGBA', (SIZE, SIZE), WHITE),
        'android-icon-monochrome.png': render(transparent, ANDROID_LEAF_SCALE, lambda _: WHITE),
        # 起動画面: 背景色は app.json で指定するので、葉だけを透明の上に描く
        'splash-icon.png': render(transparent, 1.25),
    }
    for name, image in outputs.items():
        image.save(OUT / name)
        print(f'wrote {OUT / name}')


if __name__ == '__main__':
    main()
