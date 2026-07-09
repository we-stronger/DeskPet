"""Split the music sprite into 6 frames and remove ONLY the background
that touches the image edges.

The earlier per-pixel pass matched light-gray pixels everywhere — that
also ate into the character's hair shine and skin highlights, which
left black dots on the body. The fix is to flood-fill from the four
edges: any pixel reachable from an edge that matches the background
criterion is removed; anything interior (even if it happens to be the
same color) is preserved.

Background criterion: a pixel is treated as background when it is
both bright (every channel >= 232) AND neutral (max - min channel <= 6).
"""

import os
import sys
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "frames", "music", "music1-6.png")
OUT_DIR = os.path.join(ROOT, "frames", "music")
FRAMES = 6
BG_MIN = 232
NEUTRAL_RANGE = 6


def is_background(r: int, g: int, b: int) -> bool:
    if r < BG_MIN or g < BG_MIN or b < BG_MIN:
        return False
    return (max(r, g, b) - min(r, g, b)) <= NEUTRAL_RANGE


def strip_edge_background(pixels: Image.Image.Image, frame_w: int, height: int) -> bytearray:
    """Return a flat alpha channel (length = frame_w * height) where 0
    means the pixel was reached from the edge and matches the bg
    criterion (and so should be transparent), and 255 otherwise.

    BFS seeded from every edge cell that is background. We only enqueue
    4-connected neighbors, so any interior "background-looking" pixel
    surrounded by darker pixels (hair shine, eye whites, dress
    highlights) is preserved.
    """
    out = bytearray(b"\xff") * (frame_w * height)
    visited = bytearray(frame_w * height)
    queue = deque()

    def seed(x: int, y: int) -> None:
        idx = y * frame_w + x
        if visited[idx]:
            return
        r, g, b = pixels[x, y]
        if not is_background(r, g, b):
            return
        visited[idx] = 1
        out[idx] = 0
        queue.append(idx)

    for x in range(frame_w):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(frame_w - 1, y)

    while queue:
        idx = queue.popleft()
        x = idx % frame_w
        y = idx // frame_w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if nx < 0 or nx >= frame_w or ny < 0 or ny >= height:
                continue
            nidx = ny * frame_w + nx
            if visited[nidx]:
                continue
            r, g, b = pixels[nx, ny]
            if not is_background(r, g, b):
                continue
            visited[nidx] = 1
            out[nidx] = 0
            queue.append(nidx)

    return out


def main() -> int:
    src = Image.open(SOURCE).convert("RGB")
    width, height = src.size
    frame_w = width // FRAMES
    print(f"source: {width}x{height}, frames: {FRAMES} @ {frame_w}x{height}")

    for i in range(FRAMES):
        frame = src.crop((i * frame_w, 0, (i + 1) * frame_w, height))
        pixels = frame.load()
        alpha = strip_edge_background(pixels, frame_w, height)
        rgba = Image.new("RGBA", (frame_w, height))
        rgba_pixels = rgba.load()
        for y in range(height):
            for x in range(frame_w):
                r, g, b = pixels[x, y]
                rgba_pixels[x, y] = (r, g, b, alpha[y * frame_w + x])
        out_path = os.path.join(OUT_DIR, f"music_{i + 1:02d}.png")
        rgba.save(out_path, "PNG")
        print(f"wrote {out_path} (removed {alpha.count(0)} px, kept {alpha.count(255)} px)")

    return 0


if __name__ == "__main__":
    sys.exit(main())