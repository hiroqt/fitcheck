import { describe, expect, it } from "vitest";
import { MAX_GARMENT_BYTES, validateGarmentDimensions, validateGarmentFile } from "./garment";

describe("validateGarmentFile", () => {
  it("accepts supported image formats within the byte limit", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateGarmentFile({ type, size: 1 })).toBeNull();
    }
  });

  it("rejects active/unsupported formats, empty files, and oversized files", () => {
    expect(validateGarmentFile({ type: "image/svg+xml", size: 10 })).toMatch(/PNG, JPEG, or WebP/);
    expect(validateGarmentFile({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(validateGarmentFile({ type: "image/png", size: MAX_GARMENT_BYTES + 1 })).toMatch(/10 MB/);
  });

  it("rejects invalid and oversized decoded dimensions", () => {
    expect(validateGarmentDimensions(0, 100)).toMatch(/invalid dimensions/);
    expect(validateGarmentDimensions(4096, 4096)).toBeNull();
    expect(validateGarmentDimensions(4097, 1)).toMatch(/4096/);
  });
});
