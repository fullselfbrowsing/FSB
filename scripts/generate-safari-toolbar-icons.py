"""Generate the Safari toolbar icons in extension/assets/safari-toolbar-*.png.

Safari decides whether to tint a toolbar icon with -[NSImage
safari_isGrayscale] (SafariShared). Probing that method directly shows the
rule: a pixel counts as colored when its premultiplied channel spread (max
minus min of R, G, B) is at least 25/255, and the image is left in its own
colors only when at least 3% of its non-transparent pixels are colored.
Anything else is tinted: Safari keeps only the alpha and paints it gray, or
the accent color while the extension is active on the page.

FSB's artwork (icon*.png) is black and white, so Safari drew the opaque tile
as a solid square. Nearly all of a tile is plate, so on Safari the plate
carries the color: the same artwork in FSB orange with black lettering
(white -> INK, black -> PLATE). Every pixel of the plate has a spread of 255,
so the toolbar frames stay in color even when action-icon.js dims them to
half alpha.

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
PLATE = (255, 140, 0)  # black plate -> FSB orange (#ff8c00)
INK = (0, 0, 0)        # white lettering -> black
DRAWN = {16: "icon16.png", 48: "icon48.png"}


def artwork(size):
    if size in DRAWN:
        return Image.open(os.path.join(ASSETS, DRAWN[size])).convert("L")
    master = Image.open(os.path.join(ASSETS, "icon128.png")).convert("L")
    return master.resize((size, size), Image.LANCZOS)


def recolor(gray):
    channels = [gray.point(lambda v, lo=lo, hi=hi: round(lo + (hi - lo) * v / 255))
                for lo, hi in zip(PLATE, INK)]
    return Image.merge("RGB", channels)


def main():
    for size in SIZES:
        path = os.path.join(ASSETS, "safari-toolbar-%d.png" % size)
        recolor(artwork(size)).save(path, optimize=True)
        print("wrote", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
