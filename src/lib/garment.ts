export const MAX_GARMENT_BYTES = 10 * 1024 * 1024;
export const MAX_GARMENT_DIMENSION = 4096;

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateGarmentFile(file: Pick<File, "type" | "size">): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Choose a PNG, JPEG, or WebP image. SVG and other active formats are not supported.";
  }
  if (file.size === 0) return "That image is empty.";
  if (file.size > MAX_GARMENT_BYTES) return "Choose an image smaller than 10 MB.";
  return null;
}

export function removePlainBackgroundPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 42,
): number {
  if (width < 2 || height < 2 || pixels.length !== width * height * 4) return 0;

  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const background = [0, 0, 0];
  for (const pixel of corners) {
    for (let channel = 0; channel < 3; channel++) background[channel] += pixels[pixel * 4 + channel];
  }
  for (let channel = 0; channel < 3; channel++) background[channel] /= corners.length;

  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let stackLength = 0;
  let removed = 0;
  const threshold = tolerance * tolerance;
  const enqueue = (pixel: number) => {
    if (pixel < 0 || visited[pixel]) return;
    const offset = pixel * 4;
    const dr = pixels[offset] - background[0];
    const dg = pixels[offset + 1] - background[1];
    const db = pixels[offset + 2] - background[2];
    if (dr * dr + dg * dg + db * db <= threshold * 3) {
      visited[pixel] = 1;
      stack[stackLength++] = pixel;
    }
  };
  for (const pixel of corners) enqueue(pixel);

  while (stackLength > 0) {
    const pixel = stack[--stackLength];
    const offset = pixel * 4;
    if (pixels[offset + 3] > 0) {
      pixels[offset + 3] = 0;
      removed++;
    }

    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  return removed;
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  visibility?: number;
}

export interface GarmentPlacement {
  neckX: number;
  neckY: number;
  width: number;
  rotation: number;
}

export function getGarmentPlacement(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
): GarmentPlacement | null {
  const left = landmarks[11];
  const right = landmarks[12];
  if (!left || !right || (left.visibility ?? 1) < 0.35 || (right.visibility ?? 1) < 0.35) return null;

  const leftX = left.x * frameWidth;
  const leftY = left.y * frameHeight;
  const rightX = right.x * frameWidth;
  const rightY = right.y * frameHeight;
  const shoulderWidth = Math.hypot(rightX - leftX, rightY - leftY);
  if (!Number.isFinite(shoulderWidth) || shoulderWidth < 12) return null;

  const shoulderCenterX = (leftX + rightX) / 2;
  const shoulderCenterY = (leftY + rightY) / 2;
  const nose = landmarks[0];
  const hasVisibleNose = nose && (nose.visibility ?? 1) >= 0.35;

  return {
    neckX: hasVisibleNose ? shoulderCenterX * 0.82 + nose.x * frameWidth * 0.18 : shoulderCenterX,
    neckY: hasVisibleNose ? shoulderCenterY * 0.82 + nose.y * frameHeight * 0.18 : shoulderCenterY,
    width: shoulderWidth * 1.48,
    rotation: Math.atan2(rightY - leftY, rightX - leftX),
  };
}
