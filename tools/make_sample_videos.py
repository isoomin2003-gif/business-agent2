"""프로젝트 자체 제작 샘플 영상 생성 스크립트 (CC0로 배포).
픽셀 아트 프레임을 Pillow로 그린 뒤 ffmpeg(libx264)로 mp4로 인코딩합니다.
사용법: python3 tools/make_sample_videos.py  (ffmpeg, Pillow 필요)
"""
import math, os, random, subprocess, tempfile
from PIL import Image, ImageDraw

W, H, FPS, SEC, SCALE = 160, 90, 12, 6, 4
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'media', 'samples')

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def sunset(f, d):
    t = f / (FPS * SEC)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp((255, 170, 110), (120, 70, 140), y / H))
    sy = 40 + int(t * 25)
    d.ellipse([70, sy, 90, sy + 20], fill=(255, 230, 150))
    for i, cx in enumerate([20, 90, 130]):
        x = (cx + f * (0.6 + i * 0.2)) % (W + 40) - 20
        d.rectangle([x, 20 + i * 8, x + 26, 24 + i * 8], fill=(255, 200, 190))
    d.rectangle([0, 62, W, H], fill=(60, 40, 70))  # 창틀 아래
    for x in range(0, W, 12):
        d.rectangle([x, 54 - (x * 7 % 13), x + 10, 62], fill=(80, 50, 90))
    # 창틀
    d.rectangle([0, 0, W - 1, H - 1], outline=(90, 60, 50), width=4)
    d.rectangle([W // 2 - 1, 0, W // 2 + 1, 62], fill=(90, 60, 50))
    d.rectangle([0, 62, W, 70], fill=(110, 75, 60))
    # 고양이 실루엣 + 꼬리
    d.rectangle([110, 50, 124, 62], fill=(30, 20, 35)); d.rectangle([112, 44, 122, 52], fill=(30, 20, 35))
    d.polygon([(112, 44), (114, 40), (116, 44)], fill=(30, 20, 35)); d.polygon([(118, 44), (120, 40), (122, 44)], fill=(30, 20, 35))
    a = math.sin(f / 3) * 0.6
    d.line([(124, 60), (124 + 8 * math.cos(a), 60 - 8 * math.sin(a) - 4)], fill=(30, 20, 35), width=2)

rng = random.Random(7)
drops = [(rng.randrange(W), rng.randrange(H), rng.choice([2, 3])) for _ in range(70)]
def rain(f, d):
    d.rectangle([0, 0, W, H], fill=(25, 30, 55))
    for i, x in enumerate(range(0, W, 22)):
        h = 30 + (i * 17 % 25)
        d.rectangle([x, 60 - h, x + 18, 60], fill=(40, 45, 80))
        for wy in range(60 - h + 4, 58, 6):
            if (wy + i) % 3: d.rectangle([x + 4, wy, x + 6, wy + 2], fill=(255, 210, 120))
    d.rectangle([0, 60, W, H], fill=(35, 38, 60))
    d.rectangle([60, 40, 100, 43], fill=(200, 90, 90)); d.rectangle([62, 43, 64, 72], fill=(120, 120, 140))
    for x, y, s in drops:
        yy = (y + f * 6 * s) % H
        d.line([(x, yy), (x - 1, yy + 4)], fill=(150, 170, 220))
    for k in range(4):
        r = (f * 0.8 + k * 6) % 12
        cx = 30 + k * 35
        d.ellipse([cx - r, 78 - r / 3, cx + r, 78 + r / 3], outline=(110, 130, 190))

bursts = [(40, 30, 0, (255, 120, 160)), (110, 25, 18, (120, 220, 255)), (75, 20, 36, (255, 220, 110)), (130, 35, 52, (180, 255, 150))]
def fireworks(f, d):
    d.rectangle([0, 0, W, H], fill=(18, 16, 40))
    for i in range(30):
        sx, sy = (i * 53) % W, (i * 29) % 50
        if (f + i) % 9: d.point((sx, sy), fill=(200, 200, 255))
    for bx, by, st, col in bursts:
        age = f - st
        if 0 <= age < 24:
            r = age * 1.4
            for k in range(14):
                a = k / 14 * math.tau
                px, py = bx + math.cos(a) * r, by + math.sin(a) * r + age * 0.15
                fade = 1 - age / 24
                d.rectangle([px, py, px + 1, py + 1], fill=lerp((18, 16, 40), col, fade))
        elif -10 < age < 0:
            d.point((bx, by + (-age) * 4), fill=(255, 240, 200))
    d.rectangle([0, 70, W, H], fill=(25, 30, 30))
    for i, x in enumerate([50, 62, 74, 86]):  # 친구들 실루엣
        bob = int(math.sin((f + i * 3) / 2) * 1)
        d.rectangle([x, 60 + bob, x + 8, 72], fill=(10, 10, 20)); d.rectangle([x + 1, 54 + bob, x + 7, 60 + bob], fill=(10, 10, 20))

for name, fn in [('sample-sunset', sunset), ('sample-rain', rain), ('sample-fireworks', fireworks)]:
    with tempfile.TemporaryDirectory() as tmp:
        for f in range(FPS * SEC):
            im = Image.new('RGB', (W, H)); fn(f, ImageDraw.Draw(im))
            im.resize((W * SCALE, H * SCALE), Image.NEAREST).save(f'{tmp}/{f:04d}.png')
        out = os.path.abspath(f'{OUT}/{name}.mp4')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{tmp}/%04d.png',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', out], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-vframes', '1', '-ss', '2', out.replace('.mp4', '.jpg')], check=True)
        print('wrote', out)
