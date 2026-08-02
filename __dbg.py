from PIL import Image

im = Image.open('textures.low/tracks/cityscape/height.png').convert('RGB')
w, h = im.size
px = im.load()
ratio = w / 6000.0


def hv_at(wx, wz):
    x = w / 2 + wx * ratio
    z = w / 2 + wz * ratio
    x = int(round(x)); z = int(round(z))
    r, g, b = px[x, z]
    return r + g * 255 + b * 65025, (r, g, b)


# Along the spawn column (world x = -2268), walking world z forward from spawn
print('height profile along spawn column (x=-2268), z from -886:')
for i in range(16):
    wz = -886 + i * 60
    v, c = hv_at(-2268, wz)
    print('z', wz, 'heightValue', v, 'worldY', round(v / 10 + 4, 1), 'rgb', c)

print()
# Also a broad scan of height values on ROAD pixels (from collision mask)
coll = Image.open('textures.low/tracks/cityscape/collision.png').convert('RGB')
pc = coll.load()
import collections
vals = []
for y in range(0, h, 3):
    for x in range(0, w, 3):
        if pc[x, y][0] >= 200:
            r, g, b = px[x, y]
            vals.append((r + g * 255 + b * 65025) / 10 + 4)
vals.sort()
print('road height profile: min', round(vals[0], 1), 'p25', round(vals[len(vals)//4], 1),
      'median', round(vals[len(vals)//2], 1), 'p75', round(vals[3*len(vals)//4], 1),
      'max', round(vals[-1], 1), 'n=', len(vals))
