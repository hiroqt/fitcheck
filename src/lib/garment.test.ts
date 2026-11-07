import { describe, expect, it } from "vitest";
import { adaptPlacementToBodyMask, extractGarmentSilhouette, fitThinPlateSpline, getBodyAnchor, getGarmentContentBounds, getGarmentControlPoints, getGarmentPlacement, getTorsoQuad, mapGarmentBoneSkinPoint, mapGarmentPoint, removeCollarInterior, removePlainBackgroundPixels, smoothGarmentPlacement, validateGarmentFile } from "./garment";

describe("garment image handling", () => {
  it("keeps image-side correspondence when anatomical left is image-right and hips are missing", () => {
    const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
    pose[11] = { x: 0.65, y: 0.32, visibility: 1 };
    pose[12] = { x: 0.35, y: 0.3, visibility: 1 };
    const body = getBodyAnchor(pose, 1000, 800)!;
    expect(body.shoulderLeft.x).toBe(350);
    expect(body.shoulderRight.x).toBe(650);
    expect(body.hipLeft.x).toBeLessThan(body.hipRight.x);
    expect(body.hipLeft.x - body.shoulderLeft.x).toBeCloseTo(body.hipRight.x - body.shoulderRight.x);
    expect(body.hipLeft.y - body.shoulderLeft.y).toBeCloseTo(body.hipRight.y - body.shoulderRight.y);
    pose[23] = { x: 0.62, y: 0.75, visibility: 1 };
    pose[24] = { x: 0.38, y: 0.75, visibility: 1 };
    const measured = getBodyAnchor(pose, 1000, 800)!;
    expect(measured.hipLeft.x).toBe(380);
    expect(measured.hipRight.x).toBe(620);
  });

  it("fits TPS control points and preserves affine mappings", () => {
    const source = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 }, { x: 0.9, y: 0.9 }, { x: 0.5, y: 0.5 }];
    const target = source.map((point) => ({ x: point.x * 2 + 5, y: point.y * 3 - 2 }));
    const warp = fitThinPlateSpline(source, target);
    expect(warp(source[2]).x).toBeCloseTo(target[2].x, 5);
    expect(warp(source[2]).y).toBeCloseTo(target[2].y, 5);
    expect(warp({ x: 0.3, y: 0.7 }).x).toBeCloseTo(5.6, 5);
    expect(warp({ x: 0.3, y: 0.7 }).y).toBeCloseTo(0.1, 5);
  });

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

  it("detects and opens a symmetric polo collar notch from the uploaded silhouette", () => {
    const width = 100;
    const height = 120;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const setOpaque = (x: number, y: number) => { pixels[(y * width + x) * 4 + 3] = 255; };
    for (let y = 4; y < height; y++) {
      for (let x = 20; x <= 80; x++) setOpaque(x, y);
    }
    for (let y = 0; y < 20; y++) {
      for (let x = 39; x <= 42; x++) setOpaque(x, y);
      for (let x = 58; x <= 61; x++) setOpaque(x, y);
    }

    const silhouette = extractGarmentSilhouette(pixels, width, height);
    expect(silhouette.neckOpening).toBeDefined();
    expect(removeCollarInterior(pixels, width, height, silhouette.neckOpening!)).toBeGreaterThan(0);
    expect(pixels[(8 * width + 50) * 4 + 3]).toBe(0);
    expect(pixels[(8 * width + 40) * 4 + 3]).toBe(255);
    expect(pixels[(20 * width + 50) * 4 + 3]).toBe(255);
  });

  it("places a garment from visible shoulder landmarks and skips missing poses", () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 1 }));
    landmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 };
    landmarks[12] = { x: 0.6, y: 0.32, visibility: 0.9 };
    landmarks[0] = { x: 0.5, y: 0.2, visibility: 0.9 };
    const body = getBodyAnchor(landmarks, 1000, 800);
    expect(body?.x).toBe(500);
    expect(body?.y).toBeCloseTo(264.05, 1);
    expect(body?.shoulderWidth).toBeGreaterThan(200);
    landmarks[0] = { x: 0.5, y: 0.05, visibility: 1 };
    expect(getBodyAnchor(landmarks, 1000, 800)?.y).toBeCloseTo(264.05, 1);
    landmarks[11].visibility = 0.1;
    expect(getGarmentPlacement(landmarks, 1000, 800)).toBeNull();
  });

  it("uses confident torso landmarks to size placement and smooth tracking jitter", () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    landmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 };
    landmarks[12] = { x: 0.6, y: 0.3, visibility: 0.9 };
    landmarks[23] = { x: 0.38, y: 0.68, visibility: 0.8 };
    landmarks[24] = { x: 0.62, y: 0.68, visibility: 0.8 };

    const body = getBodyAnchor(landmarks, 1000, 800);
    const placement = getGarmentPlacement(landmarks, 1000, 800);
    expect(body?.torsoLength).toBeCloseTo(304);
    expect(body).not.toBeNull();
    expect(body!.shoulderWidth * 1.45).toBeCloseTo(333.5);

    const next = { ...placement!, shoulderLeft: { ...placement!.shoulderLeft, x: placement!.shoulderLeft.x + 100 } };
    const smooth = smoothGarmentPlacement(placement, next);
    expect(smooth.shoulderLeft.x).toBeCloseTo(placement!.shoulderLeft.x + 22);

    landmarks[24].visibility = 0.1;
    expect(getBodyAnchor(landmarks, 1000, 800)?.torsoLength).toBeCloseTo(320);
  });

  it("falls back to shoulder-based torso geometry when visible hip points collapse", () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    landmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 };
    landmarks[12] = { x: 0.6, y: 0.3, visibility: 0.9 };
    landmarks[23] = { x: 0.495, y: 0.68, visibility: 0.9 };
    landmarks[24] = { x: 0.505, y: 0.68, visibility: 0.9 };

    const body = getBodyAnchor(landmarks, 1000, 800)!;
    expect(body.torsoLength).toBeCloseTo(320);
    expect(body.hipRight.x - body.hipLeft.x).toBeCloseTo(200);
    expect(body.hipLeft.y).toBeCloseTo(560);

    landmarks[23] = { x: 0.44, y: 0.9, visibility: 0.9 };
    landmarks[24] = { x: 0.56, y: 0.9, visibility: 0.9 };
    expect(getBodyAnchor(landmarks, 1000, 800)?.hipLeft.y).toBeCloseTo(560);
  });

  it("crops transparent garment padding and finds the center neckline anchor", () => {
    const pixels = new Uint8ClampedArray(5 * 6 * 4);
    const setPixel = (x: number, y: number, alpha = 255) => { pixels[(y * 5 + x) * 4 + 3] = alpha; };
    setPixel(1, 0);
    setPixel(4, 0);
    setPixel(2, 2);
    setPixel(3, 2);
    setPixel(2, 5);
    setPixel(3, 5);
    expect(getGarmentContentBounds(pixels, 5, 6)).toEqual({ x: 1, y: 0, width: 4, height: 6, necklineX: 0.5, necklineY: 1 / 3, hemWidthRatio: 0.5 });
    expect(getGarmentContentBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toBeNull();
  });

  it("aligns the detected garment neckline to the shoulders in the torso mesh", () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    landmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 };
    landmarks[12] = { x: 0.6, y: 0.3, visibility: 0.9 };
    landmarks[23] = { x: 0.4, y: 0.7, visibility: 0.9 };
    landmarks[24] = { x: 0.6, y: 0.7, visibility: 0.9 };
    const placement = getGarmentPlacement(landmarks, 1000, 1000)!;
    const necklineX = 0.46;
    const necklineY = 0.14;
    const quad = getTorsoQuad(placement, necklineX, necklineY);
    const top = {
      x: quad.topLeft.x + (quad.topRight.x - quad.topLeft.x) * necklineX,
      y: quad.topLeft.y + (quad.topRight.y - quad.topLeft.y) * necklineX,
    };
    const bottom = {
      x: quad.bottomLeft.x + (quad.bottomRight.x - quad.bottomLeft.x) * necklineX,
      y: quad.bottomLeft.y + (quad.bottomRight.y - quad.bottomLeft.y) * necklineX,
    };
    expect(top.x + (bottom.x - top.x) * necklineY).toBeCloseTo(500);
    expect(top.y + (bottom.y - top.y) * necklineY).toBeCloseTo(300);
    const adjusted = getTorsoQuad(placement, necklineX, necklineY, 0.34);
    expect((adjusted.bottomRight.x - adjusted.bottomLeft.x) * 0.34).toBeCloseTo(170);
  });

  it("maps the complete garment mesh to the torso edges without collapsing its hem", () => {
    const quad = {
      topLeft: { x: 100, y: 100 }, topRight: { x: 300, y: 100 },
      bottomLeft: { x: 130, y: 500 }, bottomRight: { x: 270, y: 500 },
    };
    expect(mapGarmentPoint(quad, 0, 0)).toEqual(quad.topLeft);
    expect(mapGarmentPoint(quad, 1, 0)).toEqual(quad.topRight);
    expect(mapGarmentPoint(quad, 0, 1)).toEqual(quad.bottomLeft);
    expect(mapGarmentPoint(quad, 1, 1)).toEqual(quad.bottomRight);
    expect(mapGarmentPoint(quad, 0.5, 1)).toEqual({ x: 200, y: 500 });
  });

  it("extracts 3D torso yaw and image-side elbow/wrist landmarks for articulated sleeves", () => {
    const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
    // Anatomical left (11) is on image-right (x=0.65), anatomical right (12) is on image-left (x=0.35)
    pose[11] = { x: 0.65, y: 0.3, z: -0.15, visibility: 0.95 };
    pose[12] = { x: 0.35, y: 0.3, z: 0.05, visibility: 0.95 };
    pose[13] = { x: 0.78, y: 0.22, z: -0.2, visibility: 0.9 }; // anatomical left elbow (raised on image-right)
    pose[14] = { x: 0.24, y: 0.45, z: 0.05, visibility: 0.9 }; // anatomical right elbow (lowered on image-left)
    pose[15] = { x: 0.85, y: 0.16, z: -0.25, visibility: 0.85 };
    pose[16] = { x: 0.2, y: 0.58, z: 0.05, visibility: 0.85 };

    const placement = getGarmentPlacement(pose, 1000, 800)!;
    expect(placement.elbowLeft).toEqual({ x: 240, y: 360 });
    expect(placement.elbowRight).toEqual({ x: 780, y: 176 });
    expect(placement.wristLeft?.x).toBeCloseTo(200);
    expect(placement.wristLeft?.y).toBeCloseTo(464);
    expect(placement.wristRight).toEqual({ x: 850, y: 128 });
    expect(placement.torsoRotationY).toBeLessThan(-0.3);

    const controls = getGarmentControlPoints(placement, 800, 0.5, 0.1, 0.7);
    const warp = fitThinPlateSpline(controls.sourceControls, controls.targetControls);
    // Right sleeve tip (0.96, 0.34) should pull upward toward the raised image-right elbow (y=176)
    // while left sleeve tip (0.04, 0.34) should pull downward toward the lowered image-left elbow (y=360)
    expect(warp({ x: 0.96, y: 0.34 }).y).toBeLessThan(warp({ x: 0.04, y: 0.34 }).y - 80);
  });

  it("wraps collar above shoulder joints and expands torso/shoulders to full outer body width", () => {
    const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
    pose[11] = { x: 0.35, y: 0.30, visibility: 0.95 };
    pose[12] = { x: 0.65, y: 0.30, visibility: 0.95 };
    pose[23] = { x: 0.38, y: 0.72, visibility: 0.9 };
    pose[24] = { x: 0.62, y: 0.72, visibility: 0.9 };

    // Frame 1000x800 -> skeletal shoulders at (350, 240) and (650, 240), width = 300
    const placement = getGarmentPlacement(pose, 1000, 800)!;
    // Polo shirt with narrow lower body ratio (0.48) and collar at (0.5, 0.08)
    const controls = getGarmentControlPoints(placement, 800, 0.5, 0.08, 0.48);
    const warp = fitThinPlateSpline(controls.sourceControls, controls.targetControls);

    // 1. Collar (0.5, 0.08) must sit well ABOVE the skeletal shoulder line (y = 240) to wrap the neck
    const collarPoint = warp({ x: 0.5, y: 0.08 });
    expect(collarPoint.y).toBeLessThan(240 - 300 * 0.22);

    // 2. Shoulder seams (0.22, 0.12) and (0.78, 0.12) must sit ABOVE y = 240 and span wider than 300px
    const leftSeam = warp({ x: 0.22, y: 0.12 });
    const rightSeam = warp({ x: 0.78, y: 0.12 });
    expect(leftSeam.y).toBeLessThan(220);
    expect(rightSeam.y).toBeLessThan(220);
    expect(rightSeam.x - leftSeam.x).toBeGreaterThan(300 * 1.2);

    // 3. Mid-chest torso edges of the polo (x = 0.26 and x = 0.74 at y = 0.55) must wrap the full chest (> 1.18 * shoulderWidth)
    const leftChest = warp({ x: 0.26, y: 0.55 });
    const rightChest = warp({ x: 0.74, y: 0.55 });
    expect(rightChest.x - leftChest.x).toBeGreaterThan(300 * 1.18);
  });

  it("adapts garment placement to the segmented body contour so wide lats and bottom-of-frame torsos are fully covered", () => {
    const maskWidth = 40;
    const maskHeight = 30;
    const categories = new Uint8Array(maskWidth * maskHeight).fill(0);
    // Fill a wide body silhouette from x = 6..33 (15%..85% of frame width) and down to the bottom row (y = 6..29)
    for (let y = 6; y < maskHeight; y++) {
      for (let x = 6; x <= 33; x++) {
        categories[y * maskWidth + x] = 2; // body-skin
      }
    }
    const initialPlacement = {
      shoulderLeft: { x: 350, y: 240 },
      shoulderRight: { x: 650, y: 240 },
      hipLeft: { x: 350, y: 680 },
      hipRight: { x: 650, y: 680 },
    };

    const adapted = adaptPlacementToBodyMask(initialPlacement, categories, maskWidth, maskHeight, 1000, 800);
    // Should expand past skeletal shoulder joints (350..650) to cover outer lats/deltoids (278..722),
    // while clamping so bare arms at 150..850 never inflate the shirt into a wide tent!
    expect(adapted.bodyLeftX).toBeLessThan(350);
    expect(adapted.bodyLeftX).toBeGreaterThanOrEqual(275);
    expect(adapted.bodyRightX).toBeGreaterThan(650);
    expect(adapted.bodyRightX).toBeLessThanOrEqual(725);
    expect(adapted.hipLeft.y).toBeGreaterThanOrEqual(800);
    // Dense per-row left/right contour and per-column top drop profile must be extracted from the segmentation mask
    expect(adapted.segRowLeftX).toHaveLength(33);
    expect(adapted.segRowRightX).toHaveLength(33);
    expect(adapted.segColTopY).toHaveLength(29);
    // Outer shoulder/sleeve columns must drop lower (larger Y) than the central neck column
    expect(adapted.segColTopY![2]).toBeGreaterThan(adapted.segColTopY![14]);
    expect(adapted.segColTopY![26]).toBeGreaterThan(adapted.segColTopY![14]);
  });

  it("skins sleeves directly along tracked upper-arm angles without spiking even when necklineY is deep", () => {
    const placement = {
      shoulderLeft: { x: 350, y: 240 },
      shoulderRight: { x: 650, y: 240 },
      hipLeft: { x: 380, y: 640 },
      hipRight: { x: 620, y: 640 },
      elbowLeft: { x: 200, y: 180 }, // Left arm raised up-left!
      elbowRight: { x: 780, y: 360 }, // Right arm angled down-right
    };

    // Even with a deep necklineY = 0.22 (which caused TPS to invert and spike), collar stays smooth above shoulders
    const collar = mapGarmentBoneSkinPoint(0.5, 0.08, placement, 800, 0.5, 0.22, 0.48);
    expect(collar.y).toBeLessThan(200);
    expect(collar.y).toBeGreaterThan(120);

    // Raised left elbow (y=180 < shoulder y=240) rotates left sleeve cuff (0.04, 0.34) upward!
    const leftCuff = mapGarmentBoneSkinPoint(0.04, 0.34, placement, 800, 0.5, 0.22, 0.48);
    const rightCuff = mapGarmentBoneSkinPoint(0.96, 0.34, placement, 800, 0.5, 0.22, 0.48);
    expect(leftCuff.y).toBeLessThan(rightCuff.y - 80);
  });

  it("prevents sleeves from folding inward when elbows cross in front of the chest and preserves height when turning sideways", () => {
    const crossedPose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
    crossedPose[11] = { x: 0.35, y: 0.3, z: 0, visibility: 0.95 };
    crossedPose[12] = { x: 0.65, y: 0.3, z: 0, visibility: 0.95 };
    // Elbows crossed inward onto the middle of the chest!
    crossedPose[13] = { x: 0.52, y: 0.48, z: -0.2, visibility: 0.95 };
    crossedPose[14] = { x: 0.48, y: 0.48, z: -0.2, visibility: 0.95 };

    const crossedPlacement = getGarmentPlacement(crossedPose, 1000, 800)!;
    const controls = getGarmentControlPoints(crossedPlacement, 800, 0.5, 0.08, 0.5);
    const warp = fitThinPlateSpline(controls.sourceControls, controls.targetControls);
    // Left sleeve tip (0.04, 0.34) must stay on the left outside of the left shoulder seam, NOT pulled into the center chest
    expect(warp({ x: 0.04, y: 0.34 }).x).toBeLessThan(300);
    expect(warp({ x: 0.96, y: 0.34 }).x).toBeGreaterThan(700);

    // Sideways turn: 2D shoulder X distance foreshortens to 0.16, but Z depth difference is 0.26
    const sidePose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
    sidePose[11] = { x: 0.42, y: 0.3, z: -0.13, visibility: 0.95 };
    sidePose[12] = { x: 0.58, y: 0.3, z: 0.13, visibility: 0.95 };
    const sideBody = getBodyAnchor(sidePose, 1000, 800)!;
    expect(sideBody.torsoLength).toBeGreaterThan(360);
  });

  it("compensates for tall polo collar shoulder slope and rotates sleeves down onto hanging arms", () => {
    // Synthetic collared polo silhouette: collar top at v=0.02, sloped shoulder seams at v=0.18
    const w = 60;
    const h = 80;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const absS = Math.abs(u - 0.5) / 0.25;
        const topV = absS <= 0.35 ? 0.02 : 0.02 + Math.min(1.5, (absS - 0.35) / 0.65) * 0.16;
        const inTorso = u >= 0.25 && u <= 0.75 && v >= topV && v <= 0.98;
        const inSleeve = (u < 0.25 || u > 0.75) && v >= topV && v <= 0.46;
        if (inTorso || inSleeve) {
          pixels[(y * w + x) * 4 + 3] = 255;
        }
      }
    }
    const silhouette = extractGarmentSilhouette(pixels, w, h);
    expect(silhouette.topV[14]).toBeLessThan(0.06);
    expect(silhouette.topV[7]).toBeGreaterThan(0.14);

    // Segmented shoulder top contour at y = 215px on left shoulder (u=0.25), arms hanging straight down at ~82 deg
    const segColTopY = new Array<number>(29).fill(215);
    const placementWithSilhouette = {
      shoulderLeft: { x: 350, y: 240 },
      shoulderRight: { x: 650, y: 240 },
      hipLeft: { x: 370, y: 760 },
      hipRight: { x: 630, y: 760 },
      elbowLeft: { x: 315, y: 510 }, // Hanging down at ~82 deg
      elbowRight: { x: 685, y: 510 },
      segColTopY,
      garmentSilhouette: silhouette,
    };

    // Opaque shoulder seam at (u=0.26, v=0.18) must land right on segColTopY (~215px), NOT 90px lower!
    const shoulderSeam = mapGarmentBoneSkinPoint(0.26, 0.18, placementWithSilhouette, 800, 0.5, 0.08, 0.5);
    expect(shoulderSeam.y).toBeLessThanOrEqual(222);

    // Hanging left arm (elbow at 315, 510) must rotate the left sleeve cuff (u=0.04, v=0.34) downward and inward
    // compared to a T-pose arm (elbow at 140, 290)
    const tPosePlacement = {
      ...placementWithSilhouette,
      elbowLeft: { x: 140, y: 290 },
      elbowRight: { x: 860, y: 290 },
    };
    const cuffHangingL = mapGarmentBoneSkinPoint(0.04, 0.34, placementWithSilhouette, 800, 0.5, 0.08, 0.5);
    const cuffTPoseL = mapGarmentBoneSkinPoint(0.04, 0.34, tPosePlacement, 800, 0.5, 0.08, 0.5);
    expect(cuffHangingL.y).toBeGreaterThan(cuffTPoseL.y + 35);
    expect(cuffHangingL.x).toBeGreaterThan(cuffTPoseL.x + 25);
  });

  it("uses segmented 2D torso contours to cup a garment to the wearer's body width", () => {
    const base = {
      shoulderLeft: { x: 350, y: 240 },
      shoulderRight: { x: 650, y: 240 },
      hipLeft: { x: 390, y: 620 },
      hipRight: { x: 610, y: 620 },
      chestHalfWidth: 210,
      waistHalfWidth: 210,
      hipHalfWidth: 210,
    };
    const contour = {
      ...base,
      segRowLeftX: new Array<number>(33).fill(400),
      segRowRightX: new Array<number>(33).fill(600),
    };

    const unshaped = mapGarmentBoneSkinPoint(0.75, 0.5, base, 800);
    const bodyFitted = mapGarmentBoneSkinPoint(0.75, 0.5, contour, 800);
    expect(bodyFitted.x).toBeLessThan(unshaped.x - 20);
  });
});
