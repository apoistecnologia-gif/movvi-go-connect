from __future__ import annotations

import base64
import io
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android-motorista" / "app" / "src" / "main" / "res"
SOURCE = ROOT / "src" / "assets" / "apoisLogoData.ts"
BACKGROUND = (5, 6, 7, 255)

DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def load_official_logo() -> Image.Image:
    text = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"data:image/[^;]+;base64,([A-Za-z0-9+/=]+)", text)
    if not match:
        raise RuntimeError("Marca oficial APOIS não encontrada em apoisLogoData.ts")
    raw = base64.b64decode(match.group(1))
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def contain(source: Image.Image, size: int) -> Image.Image:
    image = source.copy()
    image.thumbnail((size, size), Image.Resampling.LANCZOS)
    return image


def centered_canvas(size: int, source: Image.Image, logo_ratio: float, transparent: bool) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent else BACKGROUND)
    logo = contain(source, max(1, int(size * logo_ratio)))
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.alpha_composite(logo, (x, y))
    return canvas


def generate_launcher_assets(logo: Image.Image) -> None:
    for density, (legacy_size, foreground_size) in DENSITIES.items():
        folder = RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)

        # Ícone legado: marca oficial grande sobre preto APOIS.
        legacy = centered_canvas(legacy_size, logo, logo_ratio=0.92, transparent=False)
        legacy.convert("RGB").save(folder / "ic_launcher.png", "PNG", optimize=True)
        legacy.convert("RGB").save(folder / "ic_launcher_round.png", "PNG", optimize=True)

        # Foreground adaptativo: margem maior para preservar a marca em masks
        # circulares, squircle e rounded-square do Android.
        foreground = centered_canvas(foreground_size, logo, logo_ratio=0.64, transparent=True)
        foreground.save(folder / "ic_launcher_foreground.png", "PNG", optimize=True)


def generate_splashes(logo: Image.Image) -> int:
    count = 0
    for path in sorted(RES.rglob("splash.png")):
        try:
            with Image.open(path) as current:
                width, height = current.size
        except Exception as exc:
            raise RuntimeError(f"Não foi possível ler {path}: {exc}") from exc

        canvas = Image.new("RGBA", (width, height), BACKGROUND)
        target = max(96, int(min(width, height) * 0.31))
        splash_logo = contain(logo, target)
        x = (width - splash_logo.width) // 2
        y = (height - splash_logo.height) // 2
        canvas.alpha_composite(splash_logo, (x, y))
        canvas.convert("RGB").save(path, "PNG", optimize=True)
        count += 1
    return count


def main() -> None:
    logo = load_official_logo()
    generate_launcher_assets(logo)
    splash_count = generate_splashes(logo)
    print(f"APOIS_NATIVE_ASSETS_OK launcher_densities={len(DENSITIES)} splash_files={splash_count}")


if __name__ == "__main__":
    main()
