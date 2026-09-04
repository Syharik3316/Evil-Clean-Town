"""Generates stylized placeholder 'before/after' coastline images for the demo dataset.

Real Sentinel-2 / "СР Дата" imagery requires API credentials we don't have during
development (see ТЗ п.8, п.11 — a static demo dataset is an explicitly accepted
fallback). These synthetic images just need to look plausibly satellite-like and
visually communicate "before" (littered) vs "after" (cleaned) for the map slider demo.
"""

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 640, 640

SAND = (222, 197, 148)
SAND_DARK = (196, 168, 118)
WATER_SHALLOW = (79, 166, 176)
WATER_DEEP = (23, 84, 110)
VEGETATION = (63, 122, 58)
TRASH_COLORS = [(60, 60, 60), (200, 40, 40), (230, 230, 230), (40, 90, 160)]


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def _lerp_color(c1, c2, t):
    return tuple(_lerp(c1[i], c2[i], t) for i in range(3))


def _draw_base_scene(draw: ImageDraw.ImageDraw) -> None:
    # water gradient (top) -> sand (bottom), diagonal coastline
    for y in range(HEIGHT):
        t = y / HEIGHT
        if t < 0.55:
            color = _lerp_color(WATER_DEEP, WATER_SHALLOW, t / 0.55)
        else:
            color = _lerp_color(SAND_DARK, SAND, (t - 0.55) / 0.45)
        draw.line([(0, y), (WIDTH, y)], fill=color)

    rng = random.Random(42)
    for _ in range(60):
        x = rng.randint(0, WIDTH)
        y = rng.randint(int(HEIGHT * 0.58), HEIGHT)
        r = rng.randint(4, 10)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=VEGETATION)


def _draw_trash(draw: ImageDraw.ImageDraw, seed: int, count: int) -> None:
    rng = random.Random(seed)
    for _ in range(count):
        x = rng.randint(10, WIDTH - 10)
        y = rng.randint(int(HEIGHT * 0.60), HEIGHT - 10)
        w = rng.randint(6, 16)
        h = rng.randint(4, 10)
        color = rng.choice(TRASH_COLORS)
        draw.rectangle([x, y, x + w, y + h], fill=color)


FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _label(draw: ImageDraw.ImageDraw, text: str) -> None:
    try:
        font = ImageFont.truetype(FONT_PATH, 28)
    except OSError:
        font = ImageFont.load_default()
    padding = 10
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    box = [16, 16, 16 + tw + padding * 2, 16 + th + padding * 2]
    draw.rectangle(box, fill=(0, 0, 0, 160))
    draw.text((16 + padding, 16 + padding - bbox[1]), text, fill=(255, 255, 255), font=font)


def generate_pair(output_dir: Path, slug: str) -> tuple[str, str]:
    """Returns (before_filename, after_filename), generating files if missing."""
    output_dir.mkdir(parents=True, exist_ok=True)
    before_name = f"{slug}_before.png"
    after_name = f"{slug}_after.png"
    before_path = output_dir / before_name
    after_path = output_dir / after_name

    if not before_path.exists():
        img = Image.new("RGB", (WIDTH, HEIGHT))
        draw = ImageDraw.Draw(img)
        _draw_base_scene(draw)
        _draw_trash(draw, seed=hash(slug) % 10_000, count=45)
        _label(draw, "До уборки")
        img.save(before_path)

    if not after_path.exists():
        img = Image.new("RGB", (WIDTH, HEIGHT))
        draw = ImageDraw.Draw(img)
        _draw_base_scene(draw)
        _draw_trash(draw, seed=hash(slug) % 10_000, count=3)
        _label(draw, "После уборки")
        img.save(after_path)

    return before_name, after_name
