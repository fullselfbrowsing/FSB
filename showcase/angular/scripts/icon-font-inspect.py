"""Reads an icon font for build-icon-fonts.mjs and prints what it found as JSON.

    python3 -I icon-font-inspect.py FONT            codepoints the font maps
    python3 -I icon-font-inspect.py FONT SUBSET     also: every way SUBSET would render differently

A subset is only useful if swapping it in changes nothing on screen, so the comparison
covers what a browser reads: each glyph's outline and advance, and the font-wide tables
that size and place a line of text (head, hhea, OS/2, post, gasp).
"""

import json
import sys

import fontTools
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

# Fields that describe how a file stores its glyphs rather than how they are drawn.
BOOKKEEPING = {
    "head": {"checkSumAdjustment", "indexToLocFormat"},
    "hhea": {"numberOfHMetrics"},
    "OS/2": {"usFirstCharIndex", "usLastCharIndex"},
    "post": {"formatType", "extraNames", "mapping", "glyphOrder"},
}


def plain(value):
    if hasattr(value, "__dict__"):
        return {key: plain(item) for key, item in sorted(vars(value).items())}
    if isinstance(value, dict):
        return {str(key): plain(item) for key, item in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [plain(item) for item in value]
    return value


def table_fields(font, tag):
    if tag not in font:
        return None
    fields = plain(font[tag])
    fields.pop("tableTag", None)
    for name in BOOKKEEPING.get(tag, ()):
        fields.pop(name, None)
    if tag == "head":
        # Bit 11 only records that the file went through a lossless transform (WOFF2).
        fields["flags"] &= ~0x0800
    return fields


def outline(font, glyph_name):
    glyphs = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyphs)
    glyphs[glyph_name].draw(pen)
    return pen.value


def differences(full, subset):
    found = []
    for tag in ("head", "hhea", "OS/2", "post", "gasp"):
        before, after = table_fields(full, tag), table_fields(subset, tag)
        if before == after:
            continue
        if before is None or after is None:
            found.append("%s table %s" % (tag, "dropped" if after is None else "added"))
            continue
        for name in sorted(set(before) | set(after)):
            if before.get(name) != after.get(name):
                found.append("%s.%s: %r -> %r" % (tag, name, before.get(name), after.get(name)))

    full_cmap, subset_cmap = full.getBestCmap(), subset.getBestCmap()
    for codepoint, glyph_name in sorted(subset_cmap.items()):
        if codepoint not in full_cmap:
            found.append("U+%04X is not in the full font" % codepoint)
            continue
        source = full_cmap[codepoint]
        if full["hmtx"][source] != subset["hmtx"][glyph_name]:
            found.append("U+%04X advance/bearing %r -> %r" % (codepoint, full["hmtx"][source], subset["hmtx"][glyph_name]))
        if outline(full, source) != outline(subset, glyph_name):
            found.append("U+%04X outline differs" % codepoint)

    for name in (".notdef",):
        if name in full.getGlyphOrder() and name in subset.getGlyphOrder():
            if outline(full, name) != outline(subset, name) or full["hmtx"][name] != subset["hmtx"][name]:
                found.append(".notdef differs")
    return found


def main(argv):
    full = TTFont(argv[1])
    report = {
        "fontTools": fontTools.version,
        "codepoints": sorted(full.getBestCmap()),
        "tables": sorted(tag for tag in full.keys() if tag != "GlyphOrder"),
    }
    if len(argv) > 2:
        subset = TTFont(argv[2])
        report["subset"] = {
            "codepoints": sorted(subset.getBestCmap()),
            "glyphs": len(subset.getGlyphOrder()),
            "tables": sorted(tag for tag in subset.keys() if tag != "GlyphOrder"),
            "differences": differences(full, subset),
        }
    json.dump(report, sys.stdout)


if __name__ == "__main__":
    main(sys.argv)
