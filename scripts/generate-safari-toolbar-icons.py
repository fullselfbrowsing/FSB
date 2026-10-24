"""Generate the Safari toolbar icons in extension/assets/safari-toolbar-*.png.

Safari treats a grayscale toolbar icon as a template: it keeps only the alpha
channel and tints it (gray, or the accent color while the extension is active
on the page). extension/assets/icon*.png are opaque grayscale tiles, so Safari
draws them as a solid square. These icons carry the FSB lettering from
icon128.png as alpha on a transparent background, in black, which is what a
template image is.

The lettering is scaled to LETTER_WIDTH of the icon and centred slightly above
the middle, leaving the outer band free for utils/action-icon.js's orbit and
capability ring and the band below for its sweep. The small tag under the
letters is dropped: it is unreadable at toolbar size.

16 and 32 px, the two sizes the toolbar actually shows (1x and 2x), are drawn
by hand (PIXEL_16, and PIXEL_32 from the same letterforms at 2 px strokes).
Scaling the 20 px-tall lettering down to five or ten rows blurs it.

Only needed when the artwork changes. Requires Pillow:
    python3 scripts/generate-safari-toolbar-icons.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "extension", "assets", "icon128.png")
OUT_DIR = os.path.join(ROOT, "extension", "assets")
SIZES = (16, 32, 48, 64)
LETTER_WIDTH = 0.84
CENTER_Y = 0.45
THRESHOLD = 40  # luminance that counts as part of the artwork

# 1 px strokes, rows 4-10, columns 1-14: the same centre and margins the
# scaled sizes use.
PIXEL_16 = [
    "................",
    "................",
    "................",
    "................",
    ".####..###.###..",
    ".#....#....#..#.",
    ".#....#....#..#.",
    ".###...##..###..",
    ".#.......#.#..#.",
    ".#.......#.#..#.",
    ".#....###..###..",
    "................",
    "................",
    "................",
    "................",
    "................",
]

# The 16 px letterforms at 2 px strokes, rows 8-21, with the corners of S and
# B cut so they keep the artwork's rounded bowls.
_F32 = ["########", "########"] + ["##......"] * 4 + ["######..", "######.."] + ["##......"] * 6
_S32 = ["..######", ".#######"] + ["##......"] * 4 + [".######.", ".######."] + ["......##"] * 4 + ["#######.", "######.."]
_B32 = ["######..", "#######."] + ["##....##"] * 4 + ["#######.", "#######."] + ["##....##"] * 4 + ["#######.", "######.."]
PIXEL_32 = (["." * 32] * 8
            + [".." + f + ".." + s + ".." + b + ".." for f, s, b in zip(_F32, _S32, _B32)]
            + ["." * 32] * 10)


def lettering_box(img):
    """Bounding box of the first run of bright rows: the letters, not the tag."""
    w, h = img.size
    px = img.load()
    rows = [y for y in range(h) if max(px[x, y] for x in range(w)) > THRESHOLD]
    if not rows:
        raise SystemExit("no lettering found in " + SOURCE)
    y0 = y1 = rows[0]
    for y in rows[1:]:
        if y != y1 + 1:
            break
        y1 = y
    cols = [x for x in range(w) if max(px[x, y] for y in range(y0, y1 + 1)) > THRESHOLD]
    return cols[0], y0, cols[-1] + 1, y1 + 1


def render_pixel(rows):
    size = len(rows)
    alpha = Image.new("L", (size, size), 0)
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            if cell == "#":
                alpha.putpixel((x, y), 255)
    return Image.merge("LA", (Image.new("L", (size, size), 0), alpha))


def render(letters, size):
    if size == 16:
        return render_pixel(PIXEL_16)
    if size == 32:
        return render_pixel(PIXEL_32)
    lw, lh = letters.size
    width = size * LETTER_WIDTH
    height = width * lh / lw
    # Resample at 4x and reduce, so 16 and 32 keep their anti-aliasing.
    scale = 4
    big = letters.resize((round(width * scale), round(height * scale)), Image.LANCZOS)
    canvas = Image.new("L", (size * scale, size * scale), 0)
    left = round((size * scale - big.width) / 2)
    top = round(size * scale * CENTER_Y - big.height / 2)
    canvas.paste(big, (left, top))
    alpha = canvas.resize((size, size), Image.LANCZOS)
    black = Image.new("L", (size, size), 0)
    return Image.merge("LA", (black, alpha))


def main():
    source = Image.open(SOURCE).convert("L")
    letters = source.crop(lettering_box(source))
    for size in SIZES:
        path = os.path.join(OUT_DIR, "safari-toolbar-%d.png" % size)
        render(letters, size).save(path, optimize=True)
        print("wrote", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
