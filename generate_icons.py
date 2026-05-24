"""Generate simple PNG icons for the PWA."""
import struct
import zlib
import math


def create_png(size):
    img = []
    for y in range(size):
        row = []
        for x in range(size):
            cx, cy = size / 2, size / 2
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            r = size * 0.45

            # Background circle
            if dist < r:
                # Dark navy background
                bg = (26, 26, 46)
                # Inner mic area
                mic_r = r * 0.3
                mic_h = r * 0.5
                mic_x_ok = abs(x - cx) < mic_r
                mic_y_ok = (cy - mic_h) < y < (cy + mic_h * 0.4)
                in_mic = mic_x_ok and mic_y_ok

                # Mic base (rounded top)
                top_cy = cy - mic_h * 0.5
                in_mic_top = math.sqrt((x - cx) ** 2 + (y - top_cy) ** 2) < mic_r

                # Stand
                stand_w = mic_r * 0.15
                stand_y_ok = cy + mic_h * 0.1 < y < cy + mic_h * 0.7
                in_stand = abs(x - cx) < stand_w and stand_y_ok

                # Base line
                base_y_ok = abs(y - (cy + mic_h * 0.65)) < size * 0.02
                base_x_ok = abs(x - cx) < mic_r * 0.8
                in_base = base_y_ok and base_x_ok

                if in_mic or in_mic_top or in_stand or in_base:
                    row.append((233, 69, 96, 255))
                else:
                    row.append((*bg, 255))
            else:
                row.append((0, 0, 0, 0))
        img.append(row)
    return img


def encode_png(img, size):
    def pack_chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)

    raw = b''
    for row in img:
        raw += b'\x00'
        for px in row:
            raw += bytes(px)

    compressed = zlib.compress(raw, 9)

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr = pack_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    idat = pack_chunk(b'IDAT', compressed)
    iend = pack_chunk(b'IEND', b'')
    return signature + ihdr + idat + iend


for size in (192, 512):
    img = create_png(size)
    data = encode_png(img, size)
    with open(f'static/icons/icon-{size}.png', 'wb') as f:
        f.write(data)
    print(f'Generated icon-{size}.png')
