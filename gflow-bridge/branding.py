"""OpenReels mark as PNG/ICO (stdlib only) for the window and the exe."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

LIME = (216, 255, 0)
BLACK = (0, 0, 0)


def _chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def png_rgba(width: int, height: int, pixels: bytes) -> bytes:
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )


def ico_from_pngs(pngs: list[tuple[int, bytes]]) -> bytes:
    count = len(pngs)
    offset = 6 + 16 * count
    entries = bytearray()
    blob = bytearray()
    for size, data in pngs:
        w = 0 if size >= 256 else size
        h = 0 if size >= 256 else size
        entries.extend(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
        blob.extend(data)
    return struct.pack("<HHH", 0, 1, count) + bytes(entries) + bytes(blob)


def _cubic(p0, p1, p2, p3, t: float):
    u = 1.0 - t
    return (
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    )


def _relative_cubics(start: tuple[float, float], triplets: list[tuple[float, float, float, float, float, float]]):
    pts = [start]
    cur = start
    for c1x, c1y, c2x, c2y, x, y in triplets:
        p1 = (cur[0] + c1x, cur[1] + c1y)
        p2 = (cur[0] + c2x, cur[1] + c2y)
        p3 = (cur[0] + x, cur[1] + y)
        for i in range(1, 25):
            pts.append(_cubic(cur, p1, p2, p3, i / 24))
        cur = p3
    return pts


def _stamp(px: bytearray, size: int, x: float, y: float, radius: float, color: tuple[int, int, int], alpha: float = 1.0) -> None:
    r0 = max(0.6, radius)
    x0, x1 = max(0, int(x - r0 - 1)), min(size - 1, int(x + r0 + 1))
    y0, y1 = max(0, int(y - r0 - 1)), min(size - 1, int(y + r0 + 1))
    cr, cg, cb = color
    for yy in range(y0, y1 + 1):
        for xx in range(x0, x1 + 1):
            d = math.hypot(xx + 0.5 - x, yy + 0.5 - y)
            cover = max(0.0, min(1.0, r0 + 0.5 - d)) * alpha
            if cover <= 0:
                continue
            i = (yy * size + xx) * 4
            a = px[i + 3] / 255.0
            na = cover + a * (1.0 - cover)
            if na <= 0:
                continue
            px[i] = int((cr * cover + px[i] * a * (1.0 - cover)) / na)
            px[i + 1] = int((cg * cover + px[i + 1] * a * (1.0 - cover)) / na)
            px[i + 2] = int((cb * cover + px[i + 2] * a * (1.0 - cover)) / na)
            px[i + 3] = int(na * 255)


def _fill_round_rect(px: bytearray, size: int, pad: float, radius: float, color: tuple[int, int, int]) -> None:
    cr, cg, cb = color
    for y in range(size):
        for x in range(size):
            cx = min(max(x + 0.5, pad + radius), size - pad - radius)
            cy = min(max(y + 0.5, pad + radius), size - pad - radius)
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius
            cover = max(0.0, min(1.0, 0.5 - d))
            if cover <= 0:
                continue
            i = (y * size + x) * 4
            px[i] = cr
            px[i + 1] = cg
            px[i + 2] = cb
            px[i + 3] = int(cover * 255)


def render_icon_png(size: int = 256) -> bytes:
    px = bytearray(size * size * 4)
    pad = size * 0.06
    _fill_round_rect(px, size, pad, size * 0.18, BLACK)
    scale = (size * 0.78) / 32.0
    ox = (size - 32 * scale) / 2
    oy = (size - 32 * scale) / 2 + size * 0.02
    stroke = size * 0.038
    loops = [
        _relative_cubics(
            (8, 22.2),
            [
                (0.3, -6, 5.4, -8.1, 9.8, -9.4),
                (2.8, -0.8, 4.6, -1.9, 4.6, -3.8),
                (0, -2.1, -2, -3.5, -4.7, -3.5),
                (-3.3, 0, -5.6, 1.7, -6.2, 4.3),
            ],
        ),
        _relative_cubics(
            (24, 10),
            [
                (-0.3, 6, -5.4, 8.1, -9.8, 9.4),
                (-2.8, 0.8, -4.6, 1.9, -4.6, 3.8),
                (0, 2.1, 2, 3.5, 4.7, 3.5),
                (3.3, 0, 5.6, -1.7, 6.2, -4.3),
            ],
        ),
    ]
    for pts in loops:
        for x, y in pts:
            _stamp(px, size, ox + x * scale, oy + y * scale, stroke, LIME)
    return png_rgba(size, size, bytes(px))


def render_ico() -> bytes:
    sizes = (16, 32, 48, 256)
    return ico_from_pngs([(s, render_icon_png(s)) for s in sizes])


def write_ico(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(render_ico())
    return path


def write_png(path: Path, size: int = 256) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(render_icon_png(size))
    return path
