/** Target square size (px) for a resized avatar. */
export const AVATAR_TARGET_SIZE = 128;

/**
 * Stays comfortably under the backend's ~250KB cap on `photo_url`
 * (see apps/api/src/family_api/services/auth.py MAX_PHOTO_URL_LENGTH).
 */
export const MAX_AVATAR_DATA_URL_LENGTH = 200_000;

export function isSupportedImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function isDataUrlTooLarge(dataUrl: string): boolean {
  return dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH;
}

/** Pure: the centered source rectangle for a square crop of an image. */
export function squareCropRect(
  width: number,
  height: number,
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: (width - size) / 2, sy: (height - size) / 2, size };
}

/**
 * Downscales an image file to a small square JPEG data URL, resizing on a
 * canvas so a stray huge photo never reaches the server. Browser-API
 * dependent — not covered by the pure unit tests below, exercised at the
 * component level instead.
 */
export async function resizeImageToDataUrl(
  file: File,
  targetSize: number = AVATAR_TARGET_SIZE,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const { sx, sy, size } = squareCropRect(image.naturalWidth, image.naturalHeight);

    const canvas = document.createElement("canvas");
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unsupported");
    ctx.drawImage(image, sx, sy, size, size, 0, 0, targetSize, targetSize);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("invalid_image"));
    image.src = src;
  });
}
