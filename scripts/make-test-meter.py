"""Generează o poză sintetică de contor de gaz pentru testul OCR de pe emulator."""
import base64, io, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 900, 600
img = Image.new("RGB", (W, H), (214, 218, 210))
d = ImageDraw.Draw(img)
sans = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
small = ImageFont.truetype(sans, 26)
digit = ImageFont.truetype(bold, 84)

d.text((60, 40), "Elster  BK-G4", font=ImageFont.truetype(bold, 34), fill=(30, 30, 30))
d.text((60, 95), "Nr. 36721458   2019", font=small, fill=(40, 40, 40))

# fereastra tamburilor
x0, y0, cw, ch, gap = 110, 200, 82, 120, 8
d.rounded_rectangle((x0 - 14, y0 - 14, x0 + 8 * (cw + gap) + 4, y0 + ch + 14), 10, fill=(18, 20, 22))
for i, c in enumerate("06105742"):
    x = x0 + i * (cw + gap)
    red = i >= 5
    d.rectangle((x, y0, x + cw, y0 + ch), fill=(176, 30, 30) if red else (34, 38, 42))
    bbox = d.textbbox((0, 0), c, font=digit)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((x + (cw - tw) / 2 - bbox[0], y0 + (ch - th) / 2 - bbox[1]), c, font=digit, fill=(245, 245, 245))
d.text((x0 + 8 * (cw + gap) + 20, y0 + 70), "m3", font=ImageFont.truetype(bold, 40), fill=(20, 20, 20))

d.text((60, 420), "Qmax 6 m3/h    Qmin 0,04 m3/h    pmax 0,5 bar", font=small, fill=(40, 40, 40))
d.text((60, 470), "V = 1,2 dm3    CE M19 0102", font=small, fill=(40, 40, 40))

img = img.rotate(2, resample=Image.BICUBIC, fillcolor=(214, 218, 210)).filter(ImageFilter.GaussianBlur(0.8))
buf = io.BytesIO()
img.save(buf, "JPEG", quality=82)
if len(sys.argv) > 1:
    img.save(sys.argv[1], "JPEG", quality=82)
b64 = base64.b64encode(buf.getvalue()).decode()
print(f"// Generat de scripts/make-test-meter.py — poză sintetică de contor gaz (06105,742 m³)\nexport const TEST_METER_JPEG_BASE64 =\n  '{b64}';")
