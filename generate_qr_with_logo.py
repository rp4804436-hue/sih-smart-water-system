import qrcode
from PIL import Image

target_url = "https://sih-smart-water-system.onrender.com"

# 1. Initialize QR Code with High Error Correction (30% recoverable)
qr = qrcode.QRCode(
    version=4,
    error_correction=qrcode.constants.ERROR_CORRECT_H,
    box_size=10,
    border=4,
)
qr.add_data(target_url)
qr.make(fit=True)

# Generate QR base image (RGB format)
qr_img = qr.make_image(fill_color="#0284c7", back_color="white").convert("RGBA")

# 2. Path to your center logo
logo_path = "logo.png"

try:
    logo = Image.open(logo_path).convert("RGBA")

    # Resize logo to ~24% of the QR code width
    qr_width, qr_height = qr_img.size
    logo_max_size = int(qr_width * 0.24)
    logo.thumbnail((logo_max_size, logo_max_size), Image.Resampling.LANCZOS)

    # Optional: add a clean white background behind transparent logos
    bg_padding = 4
    logo_bg = Image.new("RGBA", (logo.size[0] + bg_padding * 2, logo.size[1] + bg_padding * 2), (255, 255, 255, 255))
    logo_bg.paste(logo, (bg_padding, bg_padding), mask=logo)

    # Calculate center position
    pos = (
        (qr_width - logo_bg.size[0]) // 2,
        (qr_height - logo_bg.size[1]) // 2
    )

    # Paste onto QR
    qr_img.paste(logo_bg, pos, mask=logo_bg)
    print("Logo centered successfully.")
except FileNotFoundError:
    print(f"'{logo_path}' not found in the directory. Please check the filename.")

# Save output
qr_img.convert("RGB").save("jaldrishti_app_qr.png")
print("Saved final QR code to jaldrishti_app_qr.png")