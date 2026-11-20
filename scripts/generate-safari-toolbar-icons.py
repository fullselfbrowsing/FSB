"""Generate the Safari toolbar icons in extension/assets/safari-toolbar-*.png.

Safari decides whether to tint a toolbar icon with -[NSImage
safari_isGrayscale] (SafariShared). Probing that method directly shows the
rule: a pixel counts as colored when its premultiplied channel spread (max
minus min of R, G, B) is at least 25/255, and the image is left in its own
colors only when at least 3% of its non-transparent pixels are colored.
Anything else is tinted: Safari keeps only the alpha and paints it gray, or
the accent color while the extension is active on the page.

FSB's artwork (icon*.png) is black and white, so Safari drew the opaque tile
as a solid square. A white tile with black lettering is just as colorless. So
on Safari the tile is white with black lettering (white -> INK, black ->
PLATE), and the white itself carries the color: it is mixed with 16% of FSB
orange (#ff8c00), which reads as white in a toolbar and gives nearly every
pixel a spread of 41. Probed on real files, Safari accepts a mix of 10% (spread
25) and tints anything weaker; 16% keeps the tile clear of the cutoff on a
wide-gamut display too, where the same color measures about 14% less. Drawn at
half alpha the spread halves and falls under the rule, so action-icon.js warms
its dimmed frame separately.

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
ORANGE = (255, 140, 0)    # FSB orange (#ff8c00)
WARMTH = 0.16             # share of ORANGE mixed into the white plate
# black plate -> warm white, #ffedd6. utils/action-icon.js repaints the same
# color under its frames (TINTED_PLATE), so keep the two in step.
PLATE = tuple(round(255 + (c - 255) * WARMTH) for c in ORANGE)
INK = (0, 0, 0)           # white lettering -> black
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
