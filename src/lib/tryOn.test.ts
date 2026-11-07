import { describe, expect, it } from "vitest";
import { getForegroundAlpha, PoseSmoother } from "./tryOn";
import type { NormalizedLandmark } from "./garment";

describe("reference-style pose smoothing", () => {
  it("suppresses small stationary jitter while responding to deliberate movement", () => {
    const smoother = new PoseSmoother();
    const filtered = Array.from({ length: 60 }, (_, i) => {
      const x = 0.5 + (i % 2 ? 0.002 : -0.002);
      return smoother.filter([{ x, y: 0.5, visibility: 1 }], i * 1000 / 30)[0].x;
    });
    expect(Math.max(...filtered.slice(30)) - Math.min(...filtered.slice(30))).toBeLessThan(0.002);
    let moved = 0;
    for (let i = 60; i < 63; i++) moved = smoother.filter([{ x: 0.7, y: 0.5, visibility: 1 }], i * 1000 / 30)[0].x;
    expect(moved).toBeGreaterThan(0.65);
    expect(moved).toBeLessThan(0.7);
  });

  it("reacquires without stale filter state after a gap, reset, or low-confidence sample", () => {
    const smoother = new PoseSmoother();
    smoother.filter([{ x: 0.1, y: 0.2, visibility: 1 }], 0);
    expect(smoother.filter([{ x: 0.8, y: 0.7, visibility: 1 }], 500)[0].x).toBe(0.8);
    smoother.reset();
    expect(smoother.filter([{ x: 0.3, y: 0.2, visibility: 1 }], 533)[0].x).toBe(0.3);
    smoother.filter([{ x: 0.9, y: 0.2, visibility: 0 }], 566);
    expect(smoother.filter([{ x: 0.6, y: 0.2, visibility: 1 }], 600)[0].x).toBe(0.6);
  });
});

describe("foreground occlusion", () => {
  const makePose = () => {
    const pose: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    pose[11] = { x: 0.25, y: 0.2, z: 0, visibility: 1 };
    pose[12] = { x: 0.75, y: 0.2, z: 0, visibility: 1 };
    pose[13] = { x: 0.3, y: 0.6, z: -0.1, visibility: 1 };
    pose[15] = { x: 0.65, y: 0.6, z: -0.1, visibility: 1 };
    pose[19] = { x: 0.72, y: 0.6, z: -0.1, visibility: 1 };
    return pose;
  };
  const alphaAt = (mask: Uint8ClampedArray, x: number, y: number) => mask[(y * 20 + x) * 4 + 3];

  it("restores tracked hands but never exposes a covered forearm, bare chest, or old clothes", () => {
    const categories = new Uint8Array(400).fill(2);
    categories[9] = 1;
    categories[10] = 3;
    categories[7 * 20 + 9] = 1;
    categories[7 * 20 + 10] = 3;
    categories[12 * 20 + 11] = 4;
    categories[12 * 20 + 12] = 0;
    const mask = getForegroundAlpha(categories, 20, 20, makePose(), 1000, 1000);
    expect(alphaAt(mask, 10, 12)).toBe(0);
    expect(alphaAt(mask, 14, 12)).toBe(255);
    expect(alphaAt(mask, 10, 7)).toBe(0);
    expect(alphaAt(mask, 11, 12)).toBe(0);
    expect(alphaAt(mask, 12, 12)).toBe(0);
    expect(alphaAt(mask, 9, 0)).toBe(255);
    expect(alphaAt(mask, 10, 0)).toBe(255);
    expect(alphaAt(mask, 9, 7)).toBe(0);
  });

  it("does not invent a pose-shaped neck opening over the uploaded garment outline", () => {
    const categories = new Uint8Array(400).fill(2);
    const pose = makePose();
    pose[7] = { x: 0.4, y: 0.12, z: 0, visibility: 1 };
    pose[8] = { x: 0.6, y: 0.12, z: 0, visibility: 1 };
    pose[11] = { x: 0.25, y: 0.35, z: 0, visibility: 1 };
    pose[12] = { x: 0.75, y: 0.35, z: 0, visibility: 1 };
    const mask = getForegroundAlpha(categories, 20, 20, pose, 1000, 1000);
    expect(alphaAt(mask, 10, 5)).toBe(0);
    expect(alphaAt(mask, 10, 8)).toBe(0);
    expect(alphaAt(mask, 6, 5)).toBe(0);
  });

  it("does not reveal skin through the garment when a hand is untracked or behind the torso", () => {
    const categories = new Uint8Array(400).fill(2);
    const pose = makePose();
    pose[15].visibility = 0;
    expect(alphaAt(getForegroundAlpha(categories, 20, 20, pose, 1000, 1000), 14, 12)).toBe(0);
    pose[15].visibility = 1;
    pose[13].z = pose[15].z = pose[19].z = 0.5;
    expect(alphaAt(getForegroundAlpha(categories, 20, 20, pose, 1000, 1000), 14, 12)).toBe(0);
  });

  it("rejects inconsistent mask dimensions", () => {
    expect(() => getForegroundAlpha(new Uint8Array(3), 2, 2, [], 100, 100)).toThrow("dimensions");
  });

  it("restores crossed bare forearms in front of the chest when enabled for short-sleeved garments", () => {
    const categories = new Uint8Array(400).fill(2);
    const pose = makePose();
    // Point (10, 12) is on the forearm segment (13 -> 15) in front of the torso (z = -0.15)
    pose[13].z = -0.15;
    pose[15].z = -0.15;
    expect(alphaAt(getForegroundAlpha(categories, 20, 20, pose, 1000, 1000, { restoreCrossedForearms: false }), 10, 12)).toBe(0);
    expect(alphaAt(getForegroundAlpha(categories, 20, 20, pose, 1000, 1000, { restoreCrossedForearms: true }), 10, 12)).toBe(255);
  });

  it("restores a hand in front of the torso when the wrist is visible even if finger landmarks drop out", () => {
    const categories = new Uint8Array(400).fill(2);
    const pose = makePose();
    // Finger landmark 19 loses visibility while wrist 15 is clearly visible in front of the chest at (0.65, 0.6)
    pose[19].visibility = 0.1;
    const mask = getForegroundAlpha(categories, 20, 20, pose, 1000, 1000, { restoreCrossedForearms: true });
    // Pixel (13, 12) -> (675, 625) is right on the palm/wrist and must be restored
    expect(alphaAt(mask, 13, 12)).toBe(255);
    // Pixel (10, 12) -> (525, 625) on the crossed forearm (13 -> 15) must also be restored even if elbow z is 0
    pose[13].z = 0;
    pose[15].z = -0.02;
    const maskCrossed = getForegroundAlpha(categories, 20, 20, pose, 1000, 1000, { restoreCrossedForearms: true });
    expect(alphaAt(maskCrossed, 10, 12)).toBe(255);

    // An arm hanging down near the shoulder seam (x = 0.25..0.28) must NEVER cut a vertical pill hole in the shirt even if z is negative
    const hangingPose = makePose();
    hangingPose[13] = { x: 0.26, y: 0.55, z: -0.15, visibility: 1 };
    hangingPose[15] = { x: 0.27, y: 0.82, z: -0.18, visibility: 1 };
    hangingPose[19] = { x: 0.27, y: 0.88, z: -0.18, visibility: 1 };
    const maskHanging = getForegroundAlpha(categories, 20, 20, hangingPose, 1000, 1000, { restoreCrossedForearms: true });
    expect(alphaAt(maskHanging, 5, 11)).toBe(0);
    expect(alphaAt(maskHanging, 5, 16)).toBe(0);
  });

  it("does not erase garment pixels just because they extend past the body segmentation edge", () => {
    const categories = new Uint8Array(400).fill(0);
    for (let y = 4; y < 20; y++) {
      for (let x = 6; x <= 13; x++) categories[y * 20 + x] = 2;
    }
    const pose = makePose();
    pose[15].visibility = 0;
    const mask = getForegroundAlpha(categories, 20, 20, pose, 1000, 1000, { restoreCrossedForearms: true });

    expect(alphaAt(mask, 10, 10)).toBe(0);
    expect(alphaAt(mask, 1, 10)).toBe(0);
    expect(alphaAt(mask, 18, 10)).toBe(0);
  });
});
