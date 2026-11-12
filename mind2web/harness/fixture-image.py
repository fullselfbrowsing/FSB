"""Render the synthetic store used by the offline MCP fixture."""
import sys
from PIL import Image, ImageDraw

image = Image.new('RGB', (800, 480), '#f5f7fb')
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 800, 90), fill='#173d64')
draw.text((32, 25), 'WIDGET STORE', fill='white', font_size=32)
draw.rounded_rectangle((32, 120, 768, 420), radius=12, fill='white', outline='#d4dae4', width=2)
draw.rectangle((64, 160, 220, 350), fill='#2375d8')
draw.text((260, 165), 'Blue Widget', fill='#102d49', font_size=34)
draw.text((260, 225), 'Price: $19.99', fill='#102d49', font_size=32)
draw.text((260, 285), 'In stock', fill='#17663a', font_size=24)
draw.text((32, 445), 'Synthetic fixture for harness tests', fill='#536073', font_size=16)
image.save(sys.argv[1])
