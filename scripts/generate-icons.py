"""Generate brand icons from the SVG shared with the navigation Logo.

Run: python3 scripts/generate-icons.py
Requires rsvg-convert (librsvg) and Pillow.
"""

from io import BytesIO
from pathlib import Path
import subprocess

from PIL import Image


PUBLIC = Path(__file__).resolve().parents[1] / "packages/app/public"
ICONS = PUBLIC / "images/icons"
SOURCE = ICONS / "favicon.svg"


def render(size: int) -> Image.Image:
    png = subprocess.check_output(
        ["rsvg-convert", "--width", str(size), "--height", str(size), str(SOURCE)]
    )
    return Image.open(BytesIO(png)).convert("RGBA")


for size in (16, 32, 96, 192, 256, 512):
    render(size).save(ICONS / f"favicon-{size}x{size}.png")

render(200).save(ICONS / "favicon.png")
render(256).save(PUBLIC / "favicon.png")
for size in (192, 512):
    render(size).save(ICONS / f"android-chrome-{size}x{size}.png")

# iOS supplies rounded corners; an opaque background avoids black transparency.
for name, size in (("apple-touch-icon.png", 180), ("mstile-150x150.png", 270)):
    image = Image.new("RGB", (size, size), "#16161a")
    glyph = render(size)
    image.paste(glyph, mask=glyph.getchannel("A"))
    image.save(ICONS / name)

for target in (PUBLIC / "favicon.ico", ICONS / "favicon.ico"):
    render(256).save(target, sizes=[(size, size) for size in (16, 32, 48, 64, 128, 256)])

# Safari uses the SVG as a monochrome mask; index.html supplies the brand color.
(ICONS / "safari-pinned-tab.svg").write_text(
    SOURCE.read_text().replace('fill="#000000"', 'fill="#000000"')
)
