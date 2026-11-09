export const MAX_GARMENT_BYTES = 10 * 1024 * 1024;
export const MAX_GARMENT_DIMENSION = 4096;

export function validateGarmentFile(file: Pick<File, "type" | "size">): string | null {
  if (!(file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp")) {
    return "Choose a PNG, JPEG, or WebP image.";
  }
  if (file.size === 0) return "That image is empty.";
  if (file.size > MAX_GARMENT_BYTES) return "Choose an image smaller than 10 MB.";
  return null;
}

export function validateGarmentDimensions(width: number, height: number): string | null {
  if (width < 1 || height < 1) return "That image has invalid dimensions.";
  if (width > MAX_GARMENT_DIMENSION || height > MAX_GARMENT_DIMENSION) {
    return "Choose an image no larger than 4096 × 4096 pixels.";
  }
  return null;
}

export async function prepareGarmentImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file could not be decoded as an image.");
  }

  const dimensionError = validateGarmentDimensions(bitmap.width, bitmap.height);
  if (dimensionError) {
    bitmap.close();
    throw new Error(dimensionError);
  }

  let canvas: HTMLCanvasElement | undefined;
  try {
    const targetCanvas = document.createElement("canvas");
    canvas = targetCanvas;
    targetCanvas.width = bitmap.width;
    targetCanvas.height = bitmap.height;
    const context = targetCanvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    context.drawImage(bitmap, 0, 0);
    const encoded = await new Promise<Blob>((resolve, reject) => {
      targetCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Your browser could not encode this image.")), "image/webp", 0.92);
    });
    if (encoded.size > MAX_GARMENT_BYTES) throw new Error("The prepared image is larger than 10 MB. Choose a smaller image.");
    return encoded;
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
