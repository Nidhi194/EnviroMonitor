from PIL import Image, ImageOps

img = Image.open("public/images/logo.png").convert("RGB")
gray = ImageOps.grayscale(img)
inverted_gray = ImageOps.invert(gray)

# Enhance mask contrast: 
# If a pixel in inverted_gray is > 100, push to 255.
mask = inverted_gray.point(lambda p: min(255, int(p * 2.5)))

img.putalpha(mask)
img.save("public/images/logo.png", "PNG")
