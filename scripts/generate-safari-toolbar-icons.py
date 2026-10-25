"""Generate the Safari toolbar icons in extension/assets/safari-toolbar-*.png.

Safari tints any toolbar icon it detects as grayscale: it keeps only the alpha
channel and paints it gray, or the accent color while the extension is active
on the page. FSB's artwork (icon*.png) is pure black and white, so Safari drew
the tile as a solid square. These are the same tile with a faint warm tint on
every pixel (a duotone from DARK to LIGHT), so no pixel is gray and Safari
shows the icon in its own colors. The tint is too small to notice.

Sizes: 16/32 and 19/38 (the toolbar's 1x and 2x, depending on the macOS
version), plus 48 and 64. 16 comes from icon16.png and 48 from icon48.png,
which were drawn for those sizes; the rest are reduced from icon128.png.

Only needed when the artwork changes. Requires Pillow:
    python3 scripts/generate-safari-toolbar-icons.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "extension", "assets")
SIZES = (16, 19, 32, 38, 48, 64)
DARK = (18, 12, 8)      # black -> warm black
LIGHT = (255, 242, 224)  # white -> warm white
DRAWN = {16: "icon16.png", 48: "icon48.png"}


def artwork(size):
    if size in DRAWN:
        return Image.open(os.path.join(ASSETS, DRAWN[size])).convert("L")
    master = Image.open(os.path.join(ASSETS, "icon128.png")).convert("L")
    return master.resize((size, size), Image.LANCZOS)


def tint(gray):
    channels = [gray.point(lambda v, lo=lo, hi=hi: round(lo + (hi - lo) * v / 255))
                for lo, hi in zip(DARK, LIGHT)]
    return Image.merge("RGB", channels)


def main():
    for size in SIZES:
        path = os.path.join(ASSETS, "safari-toolbar-%d.png" % size)
        tint(artwork(size)).save(path, optimize=True)
        print("wrote", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
