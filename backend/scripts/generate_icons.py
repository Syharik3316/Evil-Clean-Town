from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path("/out")
PRIMARY = (15, 139, 108)
ACCENT = (43, 159, 216)


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), PRIMARY)
    draw = ImageDraw.Draw(img)

    wave_top = int(size * 0.62)
    for y in range(wave_top, size):
        t = (y - wave_top) / (size - wave_top)
        color = tuple(int(PRIMARY[i] + (ACCENT[i] - PRIMARY[i]) * t) for i in range(3))
        draw.line([(0, y), (size, y)], fill=color)

    text = "ЧБ"
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(size * 0.32))
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2 - bbox[0], size * 0.18 - bbox[1]), text, fill="white", font=font)

    return img


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        make_icon(size).save(OUT_DIR / f"icon-{size}.png")
    print("done")
