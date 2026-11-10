"""Renders the Figma Community listing images into assets/.

    python3 scripts/render_assets.py      (after `node build.mjs --core`; needs Pillow)

assets/icon-128.png          the GunsNPrices icon at 128 x 128
assets/cover-1920x1080.png   plugin name, what it does, and a mock of four product cards. The card text is exactly what
                             the plugin writes for the first row of each category (scripts/cover-data.mjs), and the
                             cards are labeled as a design mock.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND_ICON = os.environ.get("GNP_ICON", os.path.join(ROOT, "..", "brand", "gunsnprices-icon-512.png"))
OUT = os.path.join(ROOT, "assets")

ORANGE = (241, 90, 41)
INK = (30, 30, 30)
MUTED = (110, 110, 110)
LINE = (222, 222, 222)
PAPER = (247, 245, 242)
WHITE = (255, 255, 255)

# Helvetica Neue on macOS; DejaVu on Linux. Index: 0 regular, 1 bold in HelveticaNeue.ttc.
FONT_FILES = [
    ("/System/Library/Fonts/HelveticaNeue.ttc", 0, 1),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", None, None),
]


def font(size, bold=False):
    for path, regular, heavy in FONT_FILES:
        if os.path.exists(path):
            if regular is None:
                path = path.replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf") if bold else path
                return ImageFont.truetype(path, size)
            return ImageFont.truetype(path, size, index=heavy if bold else regular)
    sys.exit("no font found; edit FONT_FILES")


def wrap(draw, text, fnt, width):
    lines, line = [], ""
    for word in text.split(" "):
        test = (line + " " + word).strip()
        if draw.textlength(test, font=fnt) <= width:
            line = test
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def icon():
    src = Image.open(BRAND_ICON).convert("RGBA")
    src.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, "icon-128.png"))
    return src


def cover(src_icon, data):
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # ---- left: name and pitch ----
    x = 110
    ic = src_icon.resize((150, 150), Image.LANCZOS)
    img.paste(ic, (x, 150), ic)
    d.text((x, 350), "Gun & Ammo", font=font(104, True), fill=INK)
    d.text((x, 465), "Data", font=font(104, True), fill=ORANGE)
    y = 620
    for line in wrap(d, "Fill your mockups with real firearm models, calibers, prices and ammo boxes.", font(40), 640):
        d.text((x, y), line, font=font(40), fill=INK)
        y += 54
    y += 30
    cx = x
    for chip in ["Free", "Works offline", "Figma + FigJam"]:
        w = d.textlength(chip, font=font(28, True)) + 40
        d.rounded_rectangle((cx, y, cx + w, y + 52), radius=26, outline=ORANGE, width=3)
        d.text((cx + 20, y + 11), chip, font=font(28, True), fill=ORANGE)
        cx += w + 16
    d.text((x, H - 92), f"{data['attribution']}. Prices from the {data['snapshot']} snapshot.", font=font(22), fill=MUTED)

    # ---- right: layers panel + cards, labeled as a mock ----
    px, py = 860, 120
    d.text((px, py - 58), "DESIGN MOCK · cards filled by the plugin", font=font(24, True), fill=MUTED)

    # layers panel: the naming convention
    lw, lh = 250, 480
    d.rounded_rectangle((px, py, px + lw, py + lh), radius=14, fill=WHITE, outline=LINE, width=2)
    d.text((px + 22, py + 20), "Layers", font=font(24, True), fill=INK)
    d.polygon([(px + 24, py + 78), (px + 40, py + 78), (px + 32, py + 88)], fill=INK)  # disclosure triangle
    d.text((px + 50, py + 66), "Card", font=font(24), fill=INK)
    ly = py + 112
    for tag in ["#brand", "#title", "#specs", "#price", "#from"]:
        d.text((px + 46, ly), "T", font=font(24, True), fill=MUTED)
        d.text((px + 76, ly), tag, font=font(24, True), fill=ORANGE)
        ly += 44
    d.text((px + 22, ly + 14), "Name a text layer", font=font(20), fill=MUTED)
    d.text((px + 22, ly + 40), "#price, and it gets", font=font(20), fill=MUTED)
    d.text((px + 22, ly + 66), "a price.", font=font(20), fill=MUTED)

    # 2 x 2 cards
    cw, ch, gap = 340, 430, 24
    gx = px + lw + 30
    for i, c in enumerate(data["cards"]):
        x0 = gx + (i % 2) * (cw + gap)
        y0 = py + (i // 2) * (ch + gap)
        d.rounded_rectangle((x0, y0, x0 + cw, y0 + ch), radius=14, fill=WHITE, outline=LINE, width=2)
        d.rounded_rectangle((x0 + 20, y0 + 20, x0 + cw - 20, y0 + 150), radius=8, fill=(238, 236, 233))
        d.text((x0 + cw / 2, y0 + 85), "image", font=font(22), fill=(170, 170, 170), anchor="mm")
        v = c["values"]
        ty = y0 + 168
        d.text((x0 + 22, ty), v["brand"], font=font(22), fill=MUTED)
        ty += 34
        for line in wrap(d, v["title"], font(26, True), cw - 44)[:3]:
            d.text((x0 + 22, ty), line, font=font(26, True), fill=INK)
            ty += 32
        ty += 6
        second = v.get("specs") or v.get("caliber")
        for line in wrap(d, second, font(21), cw - 44)[:2]:
            d.text((x0 + 22, ty), line, font=font(21), fill=MUTED)
            ty += 28
        d.text((x0 + 22, y0 + ch - 92), v["price"], font=font(40, True), fill=INK)
        d.text((x0 + 22, y0 + ch - 42), v.get("from") or v.get("cpr"), font=font(22), fill=ORANGE)
        d.text((x0 + cw - 22, y0 + ch - 42), c["category"].capitalize(), font=font(20), fill=MUTED, anchor="ra")

    img.save(os.path.join(OUT, "cover-1920x1080.png"), optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    data = json.loads(subprocess.check_output(["node", os.path.join(ROOT, "scripts", "cover-data.mjs")], cwd=ROOT))
    cover(icon(), data)
    for f in ("icon-128.png", "cover-1920x1080.png"):
        with Image.open(os.path.join(OUT, f)) as im:
            print(f, im.size)


if __name__ == "__main__":
    main()
