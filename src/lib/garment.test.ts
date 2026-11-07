import { describe, expect, it } from "vitest";
import { getGarmentPlacement, removePlainBackgroundPixels, validateGarmentFile } from "./garment";

describe("garment image handling", () => {
  it("accepts supported raster types and rejects active or oversized files", () => {
    expect(validateGarmentFile({ type: "image/png", size: 1024 })).toBeNull();
    expect(validateGarmentFile({ type: "image/svg+xml", size: 1024 })).toContain("SVG");
    expect(validateGarmentFile({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 })).toContain("10 MB");
  });

  it("clears a connected light background while preserving an enclosed garment pixel", () => {
    const white = [250, 250, 250, 255];
    const dark = [25, 40, 70, 255];
    const pixels = new Uint8ClampedArray([
      ...white, ...white, ...white,
      ...white, ...dark, ...white,
      ...white, ...white, ...white,
    ]);
    expect(removePlainBackgroundPixels(pixels, 3, 3)).toBe(8);
    expect(pixels[3]).toBe(0);
    expect(pixels[19]).toBe(255);
  });

  it("places a garment from visible shoulder landmarks and skips missing poses", () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 1 }));
    landmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 };
    landmarks[12] = { x: 0.6, y: 0.32, visibility: 0.9 };
    const position = getGarmentPlacement(landmarks, 1000, 800);
    expect(position?.centerX).toBe(500);
    expect(position?.width).toBeGreaterThan(300);
    landmarks[11].visibility = 0.1;
    expect(getGarmentPlacement(landmarks, 1000, 800)).toBeNull();
  });
});
