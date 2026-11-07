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
  z?: number;
  visibility?: number;
  presence?: number;
}

export interface GarmentSilhouetteProfile {
  topV: number[];
  bottomV: number[];
  torsoLeftU: number[];
  torsoRightU: number[];
  neckOpening?: GarmentNeckOpening;
}

export interface GarmentNeckOpening {
  centerU: number;
  topV: number;
  bottomV: number;
  topHalfWidth: number;
  bottomHalfWidth: number;
}

export interface GarmentPlacement {
  shoulderLeft: Point;
  shoulderRight: Point;
  hipLeft: Point;
  hipRight: Point;
  elbowLeft?: Point;
  elbowRight?: Point;
  wristLeft?: Point;
  wristRight?: Point;
  torsoRotationY?: number;
  bodyLeftX?: number;
  bodyRightX?: number;
  chestHalfWidth?: number;
  waistHalfWidth?: number;
  hipHalfWidth?: number;
  segRowLeftX?: number[];
  segRowRightX?: number[];
  segOuterLeftX?: number[];
  segOuterRightX?: number[];
  segColTopY?: number[];
  segArmAngleLeft?: number;
  segArmAngleRight?: number;
  garmentSilhouette?: GarmentSilhouetteProfile;
}

export interface Point {
  x: number;
  y: number;
}

export interface GarmentContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  necklineX: number;
  necklineY: number;
  hemWidthRatio: number;
}

export function removeCollarInterior(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  opening: GarmentNeckOpening,
): number {
  if (width < 2 || height < 2 || pixels.length !== width * height * 4) return 0;
  const { centerU, topV, bottomV, topHalfWidth, bottomHalfWidth } = opening;
  if (!(bottomV > topV) || topHalfWidth <= 0 || bottomHalfWidth < 0) return 0;
  let cleared = 0;
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    if (v < topV || v > bottomV) continue;
    const t = (v - topV) / (bottomV - topV);
    const halfWidth = topHalfWidth + (bottomHalfWidth - topHalfWidth) * t;
    const left = Math.max(0, Math.ceil((centerU - halfWidth) * (width - 1)));
    const right = Math.min(width - 1, Math.floor((centerU + halfWidth) * (width - 1)));
    for (let x = left; x <= right; x++) {
      const alphaIndex = (y * width + x) * 4 + 3;
      if (pixels[alphaIndex] === 0) continue;
      pixels[alphaIndex] = 0;
      cleared++;
    }
  }
  return cleared;
}

export interface BodyAnchor {
  x: number;
  y: number;
  shoulderWidth: number;
  torsoLength: number;
  shoulderLeft: Point;
  shoulderRight: Point;
  hipLeft: Point;
  hipRight: Point;
  elbowLeft?: Point;
  elbowRight?: Point;
  wristLeft?: Point;
  wristRight?: Point;
  torsoRotationY: number;
}

const SHOULDER_VISIBILITY = 0.5;
const HIP_VISIBILITY = 0.35;
const PLACEMENT_SMOOTHING = 0.22;

export function getGarmentContentBounds(pixels: Uint8ClampedArray, width: number, height: number): GarmentContentBounds | null {
  if (width < 1 || height < 1 || pixels.length !== width * height * 4) return null;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  const rowBounds: { left: number; right: number }[] = [];
  for (let y = 0; y < height; y++) {
    let rowLeft = width;
    let rowRight = -1;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      rowLeft = Math.min(rowLeft, x);
      rowRight = Math.max(rowRight, x);
    }
    rowBounds.push({ left: rowLeft, right: rowRight });
  }
  if (right < left || bottom < top) return null;
  const boundsWidth = right - left + 1;
  const boundsHeight = bottom - top + 1;
  const centerX = left + boundsWidth / 2;
  const searchBottom = Math.min(bottom, top + Math.floor(boundsHeight * 0.4));
  const centerColumn = Math.max(left, Math.min(right, Math.round(centerX)));
  const hemStart = top + Math.floor(boundsHeight * 0.7);
  const hemWidth = rowBounds.slice(hemStart, bottom + 1)
    .reduce((widest, row) => row.right >= row.left ? Math.max(widest, row.right - row.left + 1) : widest, 0);
  let necklineY = top;
  for (let y = top; y <= searchBottom; y++) {
    if (pixels[(y * width + centerColumn) * 4 + 3] >= 96) { necklineY = y; break; }
  }
  return {
    x: left,
    y: top,
    width: boundsWidth,
    height: boundsHeight,
    necklineX: (centerX - left) / boundsWidth,
    necklineY: (necklineY - top) / boundsHeight,
    hemWidthRatio: hemWidth / boundsWidth,
  };
}

const silhouetteCache = new WeakMap<HTMLCanvasElement, GarmentSilhouetteProfile>();

export function extractGarmentSilhouette(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): GarmentSilhouetteProfile {
  const SILHOUETTE_COLS = 28;
  const SILHOUETTE_ROWS = 32;
  const rawTopV = new Array<number>(SILHOUETTE_COLS + 1).fill(-1);
  const rawBottomV = new Array<number>(SILHOUETTE_COLS + 1).fill(-1);
  const wMinus1 = Math.max(1, width - 1);
  const hMinus1 = Math.max(1, height - 1);
  const radX = Math.max(1, Math.floor(width * 0.015));

  for (let col = 0; col <= SILHOUETTE_COLS; col++) {
    const u = col / SILHOUETTE_COLS;
    const xCenter = Math.round(u * wMinus1);
    const x0 = Math.max(0, xCenter - radX);
    const x1 = Math.min(width - 1, xCenter + radX);
    let firstY = -1;
    let lastY = -1;
    for (let y = 0; y < height; y++) {
      let rowOpaque = false;
      for (let x = x0; x <= x1; x++) {
        if (pixels[(y * width + x) * 4 + 3] >= 48) {
          rowOpaque = true;
          break;
        }
      }
      if (rowOpaque) {
        if (firstY < 0) firstY = y;
        lastY = y;
      }
    }
    if (firstY >= 0 && lastY >= 0) {
      rawTopV[col] = firstY / hMinus1;
      rawBottomV[col] = lastY / hMinus1;
    }
  }

  const fillMissing = (arr: number[], fallback: number): number[] => {
    const out = [...arr];
    for (let i = 0; i < out.length; i++) {
      if (out[i] >= 0) continue;
      let found = fallback;
      for (let d = 1; d < out.length; d++) {
        if (i - d >= 0 && out[i - d] >= 0) {
          found = out[i - d];
          break;
        }
        if (i + d < out.length && out[i + d] >= 0) {
          found = out[i + d];
          break;
        }
      }
      out[i] = found;
    }
    return out;
  };

  const smoothProfile = (arr: number[], passes = 2): number[] => {
    let curr = [...arr];
    for (let p = 0; p < passes; p++) {
      curr = curr.map((val, i) => {
        const prev = curr[Math.max(0, i - 1)];
        const next = curr[Math.min(curr.length - 1, i + 1)];
        return prev * 0.25 + val * 0.5 + next * 0.25;
      });
    }
    return curr;
  };

  const topV = smoothProfile(fillMissing(rawTopV, 0.12), 1);
  const bottomV = smoothProfile(fillMissing(rawBottomV, 0.96), 1);

  const centerColumn = Math.floor(SILHOUETTE_COLS / 2);
  const centerTop = rawTopV[centerColumn] >= 0 ? rawTopV[centerColumn] : topV[centerColumn];
  const leftCollarColumn = 11;
  const rightCollarColumn = SILHOUETTE_COLS - leftCollarColumn;
  const leftCollarTop = rawTopV[leftCollarColumn] >= 0 ? rawTopV[leftCollarColumn] : topV[leftCollarColumn];
  const rightCollarTop = rawTopV[rightCollarColumn] >= 0 ? rawTopV[rightCollarColumn] : topV[rightCollarColumn];
  const collarSpan = (rightCollarColumn - leftCollarColumn) / SILHOUETTE_COLS;
  const collarNotch = centerTop - Math.max(leftCollarTop, rightCollarTop);
  const collarIsSymmetric = Math.abs(
    (centerColumn - leftCollarColumn) - (rightCollarColumn - centerColumn),
  ) <= 2;
  const neckOpening = collarIsSymmetric && collarNotch >= 0.008 && centerTop <= 0.06
    && leftCollarTop <= 0.02 && rightCollarTop <= 0.02
    ? {
        centerU: 0.5,
        topV: centerTop,
        bottomV: Math.min(0.18, centerTop + Math.max(0.08, collarSpan * 0.58)),
        topHalfWidth: Math.min(0.11, Math.max(0.045, collarSpan * 0.35)),
        bottomHalfWidth: Math.min(0.01, collarSpan * 0.05),
      }
    : undefined;

  // Measure the contiguous torso horizontal span [torsoLeftU, torsoRightU] across lower torso rows (v = 0.55..0.90)
  const lowerLeftSamples: number[] = [];
  const lowerRightSamples: number[] = [];
  const rawTorsoLeftU = new Array<number>(SILHOUETTE_ROWS + 1).fill(0.24);
  const rawTorsoRightU = new Array<number>(SILHOUETTE_ROWS + 1).fill(0.76);
  const xMid = Math.floor(width * 0.5);
  const maxGap = Math.max(2, Math.round(width * 0.025));

  for (let row = 0; row <= SILHOUETTE_ROWS; row++) {
    const v = row / SILHOUETTE_ROWS;
    const y = Math.min(height - 1, Math.max(0, Math.round(v * hMinus1)));
    let leftX = xMid;
    let gapL = 0;
    for (let x = xMid; x >= 0; x--) {
      if (pixels[(y * width + x) * 4 + 3] >= 32) {
        leftX = x;
        gapL = 0;
      } else if (++gapL >= maxGap) {
        break;
      }
    }
    let rightX = xMid;
    let gapR = 0;
    for (let x = xMid; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] >= 32) {
        rightX = x;
        gapR = 0;
      } else if (++gapR >= maxGap) {
        break;
      }
    }
    const uL = Math.max(0.16, Math.min(0.36, leftX / wMinus1));
    const uR = Math.max(0.64, Math.min(0.84, rightX / wMinus1));
    rawTorsoLeftU[row] = uL;
    rawTorsoRightU[row] = uR;
    if (v >= 0.55 && v <= 0.90 && rightX - leftX >= width * 0.25) {
      lowerLeftSamples.push(uL);
      lowerRightSamples.push(uR);
    }
  }

  const median = (vals: number[], fallback: number): number => {
    if (vals.length === 0) return fallback;
    const sorted = [...vals].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.5)];
  };

  const chestLeftU = median(lowerLeftSamples, 0.24);
  const chestRightU = median(lowerRightSamples, 0.76);
  const shoulderLeftU = Math.max(0.18, chestLeftU - 0.015);
  const shoulderRightU = Math.min(0.82, chestRightU + 0.015);

  for (let row = 0; row <= SILHOUETTE_ROWS; row++) {
    const v = row / SILHOUETTE_ROWS;
    if (v < 0.55) {
      const t = v / 0.55;
      rawTorsoLeftU[row] = shoulderLeftU + (chestLeftU - shoulderLeftU) * t;
      rawTorsoRightU[row] = shoulderRightU + (chestRightU - shoulderRightU) * t;
    } else {
      rawTorsoLeftU[row] = Math.max(chestLeftU - 0.05, Math.min(chestLeftU + 0.05, rawTorsoLeftU[row]));
      rawTorsoRightU[row] = Math.max(chestRightU - 0.05, Math.min(chestRightU + 0.05, rawTorsoRightU[row]));
    }
  }

  return {
    topV,
    bottomV,
    torsoLeftU: smoothProfile(rawTorsoLeftU, 2),
    torsoRightU: smoothProfile(rawTorsoRightU, 2),
    neckOpening,
  };
}

export function getOrComputeGarmentSilhouette(canvas: HTMLCanvasElement): GarmentSilhouetteProfile | undefined {
  const cached = silhouetteCache.get(canvas);
  if (cached) return cached;
  if (typeof canvas.getContext !== "function" || canvas.width < 2 || canvas.height < 2) return undefined;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const profile = extractGarmentSilhouette(data, canvas.width, canvas.height);
  silhouetteCache.set(canvas, profile);
  return profile;
}

export function cropGarmentCanvas(source: HTMLCanvasElement): {
  canvas: HTMLCanvasElement;
  necklineX: number;
  necklineY: number;
  hemWidthRatio: number;
  silhouette: GarmentSilhouetteProfile;
} {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Your browser could not prepare this image.");
  const bounds = getGarmentContentBounds(context.getImageData(0, 0, source.width, source.height).data, source.width, source.height);
  if (!bounds) throw new Error("No garment pixels were found. Choose a visible garment image.");
  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const croppedCtx = canvas.getContext("2d", { willReadFrequently: true });
  croppedCtx?.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  const croppedImage = croppedCtx?.getImageData(0, 0, bounds.width, bounds.height);
  const croppedPixels = croppedImage?.data;
  const silhouette = croppedPixels
    ? extractGarmentSilhouette(croppedPixels, bounds.width, bounds.height)
    : {
        topV: new Array<number>(29).fill(0.08),
        bottomV: new Array<number>(29).fill(0.98),
        torsoLeftU: new Array<number>(33).fill(0.24),
        torsoRightU: new Array<number>(33).fill(0.76),
      };
  if (croppedImage && silhouette.neckOpening
    && removeCollarInterior(croppedImage.data, bounds.width, bounds.height, silhouette.neckOpening) > 0) {
    croppedCtx?.putImageData(croppedImage, 0, 0);
  }
  silhouetteCache.set(canvas, silhouette);
  return {
    canvas,
    necklineX: bounds.necklineX,
    necklineY: bounds.necklineY,
    hemWidthRatio: bounds.hemWidthRatio,
    silhouette,
  };
}

function visible(landmark: NormalizedLandmark | undefined, threshold: number): landmark is NormalizedLandmark {
  return Boolean(landmark && Number.isFinite(landmark.x) && Number.isFinite(landmark.y)
    && landmark.x >= 0 && landmark.x <= 1 && landmark.y >= 0 && landmark.y <= 1
    && (landmark.visibility ?? landmark.presence ?? 1) >= threshold);
}

export function getBodyAnchor(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
): BodyAnchor | null {
  const leftIndex = landmarks[11]?.x <= landmarks[12]?.x ? 11 : 12;
  const rightIndex = leftIndex === 11 ? 12 : 11;
  const left = landmarks[leftIndex];
  const right = landmarks[rightIndex];
  if (!visible(left, SHOULDER_VISIBILITY) || !visible(right, SHOULDER_VISIBILITY)) return null;

  const leftX = left.x * frameWidth;
  const leftY = left.y * frameHeight;
  const rightX = right.x * frameWidth;
  const rightY = right.y * frameHeight;
  const shoulderWidth = Math.hypot(rightX - leftX, rightY - leftY);
  if (!Number.isFinite(shoulderWidth) || shoulderWidth < 12) return null;
  const shoulderCenterX = (leftX + rightX) / 2;
  const shoulderCenterY = (leftY + rightY) / 2;
  const leftHip = landmarks[leftIndex === 11 ? 23 : 24];
  const rightHip = landmarks[rightIndex === 11 ? 23 : 24];
  const hipsVisible = visible(leftHip, HIP_VISIBILITY) && visible(rightHip, HIP_VISIBILITY);
  const measuredHipWidth = hipsVisible
    ? Math.hypot((rightHip.x - leftHip.x) * frameWidth, (rightHip.y - leftHip.y) * frameHeight)
    : 0;
  const plausibleHipWidth = measuredHipWidth >= shoulderWidth * 0.7 && measuredHipWidth <= shoulderWidth * 1.5;
  const measuredHipCenterX = hipsVisible ? (leftHip.x + rightHip.x) * frameWidth / 2 : shoulderCenterX;
  const measuredHipCenterY = hipsVisible ? (leftHip.y + rightHip.y) * frameHeight / 2 : shoulderCenterY + shoulderWidth * 1.6;
  const hipCenterX = measuredHipCenterX;
  const hipCenterY = measuredHipCenterY;
  const measuredTorsoLength = Math.hypot(hipCenterX - shoulderCenterX, hipCenterY - shoulderCenterY);
  const hasTorso = hipsVisible && plausibleHipWidth && hipCenterY > shoulderCenterY && hipCenterY < frameHeight * 0.92
    && (rightHip.x - leftHip.x) * frameWidth * (rightX - leftX) + (rightHip.y - leftHip.y) * frameHeight * (rightY - leftY) > 0
    && Math.abs(hipCenterX - shoulderCenterX) <= shoulderWidth * 0.75
    && measuredTorsoLength >= shoulderWidth * 0.35
    && measuredTorsoLength <= shoulderWidth * 3
  const dz = (Number.isFinite(right.z) ? right.z! : 0) - (Number.isFinite(left.z) ? left.z! : 0);
  const anatomicalSpan = Math.hypot(shoulderWidth, dz * frameWidth * 0.85);
  const torsoLength = hasTorso ? measuredTorsoLength : anatomicalSpan * 1.6;
  const hipWidth = hasTorso ? measuredHipWidth : shoulderWidth;
  const downScale = ( anatomicalSpan / shoulderWidth ) * 1.6;
  const fallbackDown = { x: -(rightY - leftY) * downScale, y: (rightX - leftX) * downScale };
  const effectiveHipLeft = hasTorso ? { x: leftHip.x * frameWidth, y: leftHip.y * frameHeight } : { x: leftX + fallbackDown.x, y: leftY + fallbackDown.y };
  const effectiveHipRight = hasTorso ? { x: rightHip.x * frameWidth, y: rightHip.y * frameHeight } : { x: rightX + fallbackDown.x, y: rightY + fallbackDown.y };
  const leftElbowLandmark = landmarks[leftIndex === 11 ? 13 : 14];
  const rightElbowLandmark = landmarks[rightIndex === 11 ? 13 : 14];
  const leftWristLandmark = landmarks[leftIndex === 11 ? 15 : 16];
  const rightWristLandmark = landmarks[rightIndex === 11 ? 15 : 16];
  const toArmPoint = (joint: NormalizedLandmark | undefined, anchor: Point, maxDistance: number): Point | undefined => {
    if (!visible(joint, HIP_VISIBILITY)) return undefined;
    const point = { x: joint.x * frameWidth, y: joint.y * frameHeight };
    const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y);
    return distance >= shoulderWidth * 0.12 && distance <= maxDistance ? point : undefined;
  };
  const elbowLeft = toArmPoint(leftElbowLandmark, { x: leftX, y: leftY }, anatomicalSpan * 1.6);
  const elbowRight = toArmPoint(rightElbowLandmark, { x: rightX, y: rightY }, anatomicalSpan * 1.6);
  const wristLeft = elbowLeft ? toArmPoint(leftWristLandmark, elbowLeft, anatomicalSpan * 1.6) : undefined;
  const wristRight = elbowRight ? toArmPoint(rightWristLandmark, elbowRight, anatomicalSpan * 1.6) : undefined;
  const dxNorm = Math.max(0.08, Math.abs(right.x - left.x));
  const torsoRotationY = Math.max(-0.85, Math.min(0.85, Math.atan2(dz, dxNorm)));

  return {
    x: shoulderCenterX,
    // Keep the clothing anchor below the shoulder line so face landmarks cannot pull it upward.
    y: shoulderCenterY + shoulderWidth * 0.08,
    shoulderWidth: Math.max(shoulderWidth, Math.min(hipWidth, shoulderWidth * 1.15)),
    torsoLength,
    shoulderLeft: { x: leftX, y: leftY },
    shoulderRight: { x: rightX, y: rightY },
    hipLeft: effectiveHipLeft,
    hipRight: effectiveHipRight,
    elbowLeft,
    elbowRight,
    wristLeft,
    wristRight,
    torsoRotationY,
  };
}

export function getGarmentPlacement(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
): GarmentPlacement | null {
  const body = getBodyAnchor(landmarks, frameWidth, frameHeight);
  if (!body) return null;
  return {
    shoulderLeft: body.shoulderLeft,
    shoulderRight: body.shoulderRight,
    hipLeft: body.hipLeft,
    hipRight: body.hipRight,
    elbowLeft: body.elbowLeft,
    elbowRight: body.elbowRight,
    wristLeft: body.wristLeft,
    wristRight: body.wristRight,
    torsoRotationY: body.torsoRotationY,
  };
}

export function smoothGarmentPlacement(
  previous: GarmentPlacement | null,
  next: GarmentPlacement,
  amount = PLACEMENT_SMOOTHING,
): GarmentPlacement {
  if (!previous) return next;
  amount = Math.max(0, Math.min(1, amount));
  const blend = (from: number, to: number) => from + (to - from) * amount;
  const blendPoint = (from?: Point, to?: Point): Point | undefined =>
    to ? (from ? { x: blend(from.x, to.x), y: blend(from.y, to.y) } : to) : undefined;
  const blendArray = (from?: number[], to?: number[]): number[] | undefined => {
    if (!to) return from;
    if (!from || from.length !== to.length) return to;
    return to.map((val, idx) => blend(from[idx], val));
  };
  return {
    shoulderLeft: { x: blend(previous.shoulderLeft.x, next.shoulderLeft.x), y: blend(previous.shoulderLeft.y, next.shoulderLeft.y) },
    shoulderRight: { x: blend(previous.shoulderRight.x, next.shoulderRight.x), y: blend(previous.shoulderRight.y, next.shoulderRight.y) },
    hipLeft: { x: blend(previous.hipLeft.x, next.hipLeft.x), y: blend(previous.hipLeft.y, next.hipLeft.y) },
    hipRight: { x: blend(previous.hipRight.x, next.hipRight.x), y: blend(previous.hipRight.y, next.hipRight.y) },
    elbowLeft: blendPoint(previous.elbowLeft, next.elbowLeft),
    elbowRight: blendPoint(previous.elbowRight, next.elbowRight),
    wristLeft: blendPoint(previous.wristLeft, next.wristLeft),
    wristRight: blendPoint(previous.wristRight, next.wristRight),
    torsoRotationY: next.torsoRotationY !== undefined
      ? blend(previous.torsoRotationY ?? next.torsoRotationY, next.torsoRotationY)
      : previous.torsoRotationY,
    bodyLeftX: next.bodyLeftX !== undefined
      ? blend(previous.bodyLeftX ?? next.bodyLeftX, next.bodyLeftX)
      : previous.bodyLeftX,
    bodyRightX: next.bodyRightX !== undefined
      ? blend(previous.bodyRightX ?? next.bodyRightX, next.bodyRightX)
      : previous.bodyRightX,
    segRowLeftX: blendArray(previous.segRowLeftX, next.segRowLeftX),
    segRowRightX: blendArray(previous.segRowRightX, next.segRowRightX),
    segOuterLeftX: blendArray(previous.segOuterLeftX, next.segOuterLeftX),
    segOuterRightX: blendArray(previous.segOuterRightX, next.segOuterRightX),
    segColTopY: blendArray(previous.segColTopY, next.segColTopY),
    segArmAngleLeft: next.segArmAngleLeft !== undefined
      ? blend(previous.segArmAngleLeft ?? next.segArmAngleLeft, next.segArmAngleLeft)
      : previous.segArmAngleLeft,
    segArmAngleRight: next.segArmAngleRight !== undefined
      ? blend(previous.segArmAngleRight ?? next.segArmAngleRight, next.segArmAngleRight)
      : previous.segArmAngleRight,
    garmentSilhouette: next.garmentSilhouette ?? previous.garmentSilhouette,
  };
}

export function adaptPlacementToBodyMask(
  placement: GarmentPlacement,
  categories: Uint8Array,
  maskWidth: number,
  maskHeight: number,
  frameWidth: number,
  frameHeight: number,
): GarmentPlacement {
  if (maskWidth < 4 || maskHeight < 4 || categories.length !== maskWidth * maskHeight) {
    return placement;
  }
  const { shoulderLeft: sl, shoulderRight: sr, hipLeft: hl, hipRight: hr } = placement;
  const shoulderCenterX = (sl.x + sr.x) / 2;
  const shoulderCenterY = (sl.y + sr.y) / 2;
  const shoulderWidth = Math.max(12, Math.hypot(sr.x - sl.x, sr.y - sl.y));
  const centerCol = Math.max(0, Math.min(maskWidth - 1, Math.round((shoulderCenterX / frameWidth) * maskWidth)));
  const isBody = (cat: number) => cat === 2 || cat === 4;

  // Scan torso rows from upper chest to waist to measure the person's actual outer torso/lat edges
  const startRow = Math.max(0, Math.min(maskHeight - 1, Math.round(((shoulderCenterY - shoulderWidth * 0.05) / frameHeight) * maskHeight)));
  const endRow = Math.max(startRow, Math.min(maskHeight - 1, Math.round(((shoulderCenterY + shoulderWidth * 1.1) / frameHeight) * maskHeight)));

  const leftEdges: number[] = [];
  const rightEdges: number[] = [];
  for (let r = startRow; r <= endRow; r++) {
    const rowOffset = r * maskWidth;
    let leftCol = centerCol;
    while (leftCol > 0 && isBody(categories[rowOffset + leftCol - 1])) leftCol--;
    let rightCol = centerCol;
    while (rightCol < maskWidth - 1 && isBody(categories[rowOffset + rightCol + 1])) rightCol++;
    if (rightCol - leftCol >= 2) {
      leftEdges.push((leftCol / maskWidth) * frameWidth);
      rightEdges.push(((rightCol + 1) / maskWidth) * frameWidth);
    }
  }

  let bodyLeftX = placement.bodyLeftX;
  let bodyRightX = placement.bodyRightX;
  if (leftEdges.length > 0 && rightEdges.length > 0) {
    leftEdges.sort((a, b) => a - b);
    rightEdges.sort((a, b) => b - a);
    // Use 30th-percentile contour and clamp strictly to anatomical ribcage/deltoid bounds
    // so bare arms (category 2) next to the torso never inflate the shirt width.
    const measuredLeft = leftEdges[Math.floor(leftEdges.length * 0.3)];
    const measuredRight = rightEdges[Math.floor(rightEdges.length * 0.3)];
    const minAnatomicalLeft = Math.max(0, sl.x - shoulderWidth * 0.24);
    const maxAnatomicalRight = Math.min(frameWidth, sr.x + shoulderWidth * 0.24);
    bodyLeftX = Math.max(minAnatomicalLeft, Math.min(sl.x - shoulderWidth * 0.14, measuredLeft));
    bodyRightX = Math.min(maxAnatomicalRight, Math.max(sr.x + shoulderWidth * 0.14, measuredRight));
  }

  // Check if the person's segmented torso reaches the bottom of the camera frame
  let touchesBottom = false;
  for (let r = Math.max(0, maskHeight - 3); r < maskHeight; r++) {
    for (let c = Math.max(0, centerCol - Math.round(maskWidth * 0.2)); c <= Math.min(maskWidth - 1, centerCol + Math.round(maskWidth * 0.2)); c++) {
      if (isBody(categories[r * maskWidth + c])) {
        touchesBottom = true;
        break;
      }
    }
  }

  const targetBottomY = touchesBottom ? Math.max(hl.y, frameHeight * 1.04) : hl.y;

  // Extract dense per-row (33 vertical slices) left/right torso contour, outer arm-inclusive contour,
  // and per-column (29 horizontal slices) top shoulder/trapezius/arm drop contour from the live segmentation mask.
  const CONTOUR_ROWS = 32;
  const CONTOUR_COLS = 28;
  const topY = shoulderCenterY - shoulderWidth * 0.28;
  const hipCenterX = (hl.x + hr.x) / 2;
  const rawRowLeftX: number[] = [];
  const rawRowRightX: number[] = [];
  const rawOuterLeftX: number[] = [];
  const rawOuterRightX: number[] = [];

  for (let row = 0; row <= CONTOUR_ROWS; row++) {
    const v = row / CONTOUR_ROWS;
    const spineX = shoulderCenterX + (hipCenterX - shoulderCenterX) * v;
    const y = topY + (targetBottomY - topY) * v;
    const mr = Math.max(0, Math.min(maskHeight - 1, Math.round((y / frameHeight) * (maskHeight - 1))));
    const mc = Math.max(0, Math.min(maskWidth - 1, Math.round((spineX / frameWidth) * (maskWidth - 1))));
    const rowOffset = mr * maskWidth;

    let leftCol = mc;
    while (leftCol > 0 && isBody(categories[rowOffset + leftCol - 1])) leftCol--;
    let rightCol = mc;
    while (rightCol < maskWidth - 1 && isBody(categories[rowOffset + rightCol + 1])) rightCol++;

    const measuredL = (leftCol / maskWidth) * frameWidth - shoulderWidth * 0.015;
    const measuredR = ((rightCol + 1) / maskWidth) * frameWidth + shoulderWidth * 0.015;
    // Separate the inner torso ribcage/waist seam (where |s| <= 1 maps) from the outer arm span (where sleeves |s| > 1 map)
    const minTorsoHalf = shoulderWidth * 0.54;
    const maxTorsoHalf = shoulderWidth * (v < 0.42 ? 0.61 : 0.66);

    const clampedTorsoL =
      rightCol - leftCol >= 2
        ? Math.max(spineX - maxTorsoHalf, Math.min(spineX - minTorsoHalf, measuredL))
        : spineX - shoulderWidth * 0.58;
    const clampedTorsoR =
      rightCol - leftCol >= 2
        ? Math.min(spineX + maxTorsoHalf, Math.max(spineX + minTorsoHalf, measuredR))
        : spineX + shoulderWidth * 0.58;

    const maxOuterHalf = shoulderWidth * 0.96;
    const clampedOuterL =
      rightCol - leftCol >= 2
        ? Math.max(spineX - maxOuterHalf, Math.min(clampedTorsoL, measuredL))
        : clampedTorsoL - shoulderWidth * 0.14;
    const clampedOuterR =
      rightCol - leftCol >= 2
        ? Math.min(spineX + maxOuterHalf, Math.max(clampedTorsoR, measuredR))
        : clampedTorsoR + shoulderWidth * 0.14;

    rawRowLeftX.push(clampedTorsoL);
    rawRowRightX.push(clampedTorsoR);
    rawOuterLeftX.push(clampedOuterL);
    rawOuterRightX.push(clampedOuterR);
  }

  const smooth1D = (arr: number[], passes = 2): number[] => {
    let curr = [...arr];
    for (let p = 0; p < passes; p++) {
      curr = curr.map((val, i) => {
        const prev = curr[Math.max(0, i - 1)];
        const next = curr[Math.min(curr.length - 1, i + 1)];
        return prev * 0.25 + val * 0.5 + next * 0.25;
      });
    }
    return curr;
  };

  const segRowLeftX = smooth1D(rawRowLeftX, 2);
  const segRowRightX = smooth1D(rawRowRightX, 2);
  const segOuterLeftX = smooth1D(rawOuterLeftX, 2);
  const segOuterRightX = smooth1D(rawOuterRightX, 2);

  // Estimate live upper-arm angles directly from the outer deltoid-to-bicep segmentation contour (rows 4..14)
  // so sleeves follow downward-hanging arms even when the elbows are close to or below the bottom of the frame.
  const yArmTop = topY + (targetBottomY - topY) * (4 / CONTOUR_ROWS);
  const yArmBot = topY + (targetBottomY - topY) * (14 / CONTOUR_ROWS);
  const dyArm = Math.max(12, yArmBot - yArmTop);
  const dxArmL = segOuterLeftX[14] - segOuterLeftX[4];
  const dxArmR = segOuterRightX[14] - segOuterRightX[4];
  const segArmAngleLeft = Math.atan2(dyArm, Math.min(-dyArm * 0.08, dxArmL));
  const segArmAngleRight = Math.atan2(dyArm, Math.max(dyArm * 0.08, dxArmR));

  // Per-column top drop profile across neck, trapezius, deltoids, and upper arms.
  // Scan downward from topY to find the true first body pixel (cat === 2 || cat === 4) in each column.
  const rawColTopY: number[] = [];
  const halfTorsoU = 0.25;
  const mrSearchTop = Math.max(0, Math.min(maskHeight - 1, Math.round((topY / frameHeight) * (maskHeight - 1))));
  for (let col = 0; col <= CONTOUR_COLS; col++) {
    const u = col / CONTOUR_COLS;
    const s = (u - 0.5) / halfTorsoU;
    const absS = Math.abs(s);

    let refX = shoulderCenterX + ((sr.x - sl.x) / 2) * s * 1.18;
    let refY = shoulderCenterY + Math.min(1.4, absS) * shoulderWidth * 0.16;

    if (s < -1.0 && placement.elbowLeft) {
      const armT = Math.min(1, (absS - 1.0) / 1.0);
      const seamX = shoulderCenterX - shoulderWidth * 0.58;
      refX = seamX + (placement.elbowLeft.x - seamX) * armT * 0.65;
      refY = sl.y + Math.max(shoulderWidth * 0.12, (placement.elbowLeft.y - sl.y) * armT * 0.55);
    } else if (s > 1.0 && placement.elbowRight) {
      const armT = Math.min(1, (absS - 1.0) / 1.0);
      const seamX = shoulderCenterX + shoulderWidth * 0.58;
      refX = seamX + (placement.elbowRight.x - seamX) * armT * 0.65;
      refY = sr.y + Math.max(shoulderWidth * 0.12, (placement.elbowRight.y - sr.y) * armT * 0.55);
    }

    const mc = Math.max(0, Math.min(maskWidth - 1, Math.round((refX / frameWidth) * (maskWidth - 1))));
    const mrSearchBot = Math.max(mrSearchTop, Math.min(maskHeight - 1, Math.round((refY / frameHeight) * (maskHeight - 1))));
    let mrTop = -1;
    for (let r = mrSearchTop; r <= mrSearchBot; r++) {
      if (isBody(categories[r * maskWidth + mc])) {
        mrTop = r;
        break;
      }
    }
    const measuredTopY = mrTop >= 0 ? (mrTop / maskHeight) * frameHeight - shoulderWidth * 0.02 : Infinity;
    const defaultDrop = Math.max(0, absS - 0.26) * shoulderWidth * 0.16;
    const fallbackTopY = topY + defaultDrop;
    const minTopY = topY + Math.max(0, absS - 0.30) * shoulderWidth * 0.08;
    const maxTopY = shoulderCenterY + Math.max(0.06, Math.min(1.2, absS) * 0.18) * shoulderWidth;
    const topVal =
      mrTop >= 0
        ? Math.max(minTopY, Math.min(maxTopY, measuredTopY))
        : Math.max(minTopY, Math.min(maxTopY, fallbackTopY));
    rawColTopY.push(topVal);
  }
  const segColTopY = smooth1D(rawColTopY, 2);

  return {
    ...placement,
    hipLeft: { x: bodyLeftX !== undefined ? Math.min(hl.x, bodyLeftX + shoulderWidth * 0.04) : hl.x, y: targetBottomY },
    hipRight: { x: bodyRightX !== undefined ? Math.max(hr.x, bodyRightX - shoulderWidth * 0.04) : hr.x, y: Math.max(hr.y, targetBottomY) },
    bodyLeftX,
    bodyRightX,
    segRowLeftX,
    segRowRightX,
    segOuterLeftX,
    segOuterRightX,
    segColTopY,
    segArmAngleLeft,
    segArmAngleRight,
  };
}

export interface TorsoQuad {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

export function getTorsoQuad(placement: GarmentPlacement, necklineX: number, necklineY: number, hemWidthRatio = 1): TorsoQuad {
  const { shoulderLeft: sl, shoulderRight: sr, hipLeft: hl, hipRight: hr } = placement;
  const shoulderCenter = { x: (sl.x + sr.x) / 2, y: (sl.y + sr.y) / 2 };
  const hipCenter = { x: (hl.x + hr.x) / 2, y: (hl.y + hr.y) / 2 };
  const sourceNeckX = Math.max(0.1, Math.min(0.9, necklineX));
  const sourceNeckY = Math.max(0, Math.min(0.35, necklineY));
  const shoulderLength = Math.hypot(sr.x - sl.x, sr.y - sl.y) || 1;
  const topWidth = shoulderLength * 1.45;
  const bottomLength = Math.hypot(hr.x - hl.x, hr.y - hl.y);
  const torsoHemWidth = Math.max(bottomLength, topWidth * 0.82) * 1.35;
  const hemRatio = Math.max(0.2, Math.min(1, hemWidthRatio));
  const bottomWidth = Math.min(shoulderLength * 3, Math.max(torsoHemWidth * hemRatio, shoulderLength * 0.85) / hemRatio);
  const topDirection = { x: (sr.x - sl.x) / shoulderLength, y: (sr.y - sl.y) / shoulderLength };
  const bottomDirection = bottomLength
    ? { x: (hr.x - hl.x) / bottomLength, y: (hr.y - hl.y) / bottomLength }
    : topDirection;
  const bottomAtNeck = {
    x: hipCenter.x + (sourceNeckX - 0.5) * bottomWidth * bottomDirection.x,
    y: hipCenter.y + (sourceNeckX - 0.5) * bottomWidth * bottomDirection.y,
  };
  const topAtNeck = {
    x: (shoulderCenter.x - sourceNeckY * bottomAtNeck.x) / (1 - sourceNeckY),
    y: (shoulderCenter.y - sourceNeckY * bottomAtNeck.y) / (1 - sourceNeckY),
  };
  const topCenter = {
    x: topAtNeck.x - (sourceNeckX - 0.5) * topWidth * topDirection.x,
    y: topAtNeck.y - (sourceNeckX - 0.5) * topWidth * topDirection.y,
  };
  return {
    topLeft: { x: topCenter.x - topDirection.x * topWidth / 2, y: topCenter.y - topDirection.y * topWidth / 2 },
    topRight: { x: topCenter.x + topDirection.x * topWidth / 2, y: topCenter.y + topDirection.y * topWidth / 2 },
    bottomLeft: { x: hipCenter.x - bottomDirection.x * bottomWidth / 2, y: hipCenter.y - bottomDirection.y * bottomWidth / 2 },
    bottomRight: { x: hipCenter.x + bottomDirection.x * bottomWidth / 2, y: hipCenter.y + bottomDirection.y * bottomWidth / 2 },
  };
}

export function mapGarmentPoint(quad: TorsoQuad, x: number, y: number): Point {
  const top = { x: quad.topLeft.x + (quad.topRight.x - quad.topLeft.x) * x, y: quad.topLeft.y + (quad.topRight.y - quad.topLeft.y) * x };
  const bottom = { x: quad.bottomLeft.x + (quad.bottomRight.x - quad.bottomLeft.x) * x, y: quad.bottomLeft.y + (quad.bottomRight.y - quad.bottomLeft.y) * x };
  return { x: top.x + (bottom.x - top.x) * y, y: top.y + (bottom.y - top.y) * y };
}

export function fitThinPlateSpline(source: Point[], target: Point[]): (point: Point) => Point {
  const count = source.length;
  const kernel = (a: Point, b: Point) => {
    const radiusSquared = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    return radiusSquared ? radiusSquared * Math.log(radiusSquared) : 0;
  };
  const matrix = Array.from({ length: count + 3 }, () => Array(count + 3).fill(0) as number[]);
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) matrix[row][column] = kernel(source[row], source[column]);
    matrix[row][count] = 1;
    matrix[row][count + 1] = source[row].x;
    matrix[row][count + 2] = source[row].y;
    matrix[count][row] = 1;
    matrix[count + 1][row] = source[row].x;
    matrix[count + 2][row] = source[row].y;
  }
  const solve = (axis: "x" | "y") => {
    const rows = matrix.map((line, row) => [...line, row < count ? target[row][axis] : 0]);
    for (let column = 0; column < rows.length; column++) {
      let pivot = column;
      for (let row = column + 1; row < rows.length; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      if (Math.abs(rows[pivot][column]) < 1e-10) throw new Error("Invalid garment control points.");
      [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
      const divisor = rows[column][column];
      for (let cell = column; cell <= rows.length; cell++) rows[column][cell] /= divisor;
      for (let row = 0; row < rows.length; row++) {
        if (row === column) continue;
        const factor = rows[row][column];
        for (let cell = column; cell <= rows.length; cell++) rows[row][cell] -= factor * rows[column][cell];
      }
    }
    return rows.map((row) => row[rows.length]);
  };
  const weightsX = solve("x");
  const weightsY = solve("y");
  const evaluate = (point: Point, weights: number[]) => weights[count] + weights[count + 1] * point.x + weights[count + 2] * point.y
    + source.reduce((sum, control, index) => sum + weights[index] * kernel(point, control), 0);
  return (point) => ({ x: evaluate(point, weightsX), y: evaluate(point, weightsY) });
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  source: [Point, Point, Point],
  target: [Point, Point, Point],
): void {
  const [s1, s2, s3] = source;
  const [t1, t2, t3] = target;
  const determinant = (s1.x - s3.x) * (s2.y - s3.y) - (s2.x - s3.x) * (s1.y - s3.y);
  if (Math.abs(determinant) < 0.001) return;
  const a = ((t1.x - t3.x) * (s2.y - s3.y) - (t2.x - t3.x) * (s1.y - s3.y)) / determinant;
  const c = ((s1.x - s3.x) * (t2.x - t3.x) - (s2.x - s3.x) * (t1.x - t3.x)) / determinant;
  const e = t3.x - a * s3.x - c * s3.y;
  const b = ((t1.y - t3.y) * (s2.y - s3.y) - (t2.y - t3.y) * (s1.y - s3.y)) / determinant;
  const d = ((s1.x - s3.x) * (t2.y - t3.y) - (s2.x - s3.x) * (t1.y - t3.y)) / determinant;
  const f = t3.y - b * s3.x - d * s3.y;
  const center = { x: (t1.x + t2.x + t3.x) / 3, y: (t1.y + t2.y + t3.y) / 3 };
  const expanded = [t1, t2, t3].map((point) => {
    const length = Math.hypot(point.x - center.x, point.y - center.y) || 1;
    return { x: point.x + ((point.x - center.x) / length) * 0.85, y: point.y + ((point.y - center.y) / length) * 0.85 };
  });
  context.save();
  context.beginPath();
  context.moveTo(expanded[0].x, expanded[0].y);
  context.lineTo(expanded[1].x, expanded[1].y);
  context.lineTo(expanded[2].x, expanded[2].y);
  context.closePath();
  context.clip();
  context.setTransform(a, b, c, d, e, f);
  context.drawImage(image, 0, 0);
  context.restore();
}

export function getGarmentControlPoints(
  placement: GarmentPlacement,
  frameHeight: number,
  necklineX: number,
  necklineY: number,
  hemWidthRatio = 1,
): { sourceControls: Point[]; targetControls: Point[] } {
  const { shoulderLeft: sl, shoulderRight: sr, hipLeft: hl, hipRight: hr } = placement;
  const lerp = (a: Point, b: Point, amount: number): Point => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount });
  const rawLowerY = (hl.y + hr.y) / 2;
  const lowerY = rawLowerY >= frameHeight * 0.97 ? Math.min(rawLowerY, frameHeight * 1.04) : Math.min(rawLowerY, frameHeight * 0.98);
  const shoulderWidth = Math.hypot(sr.x - sl.x, sr.y - sl.y) || 1;
  const shoulderDirection = { x: (sr.x - sl.x) / shoulderWidth, y: (sr.y - sl.y) / shoulderWidth };
  // Upward unit normal perpendicular to the shoulder line (pointing toward the neck/head)
  const up = { x: shoulderDirection.y, y: -shoulderDirection.x };
  const shoulderCenter = lerp(sl, sr, 0.5);

  const segmentedHalfSpan =
    placement.bodyLeftX !== undefined && placement.bodyRightX !== undefined
      ? Math.max(shoulderCenter.x - placement.bodyLeftX, placement.bodyRightX - shoulderCenter.x)
      : 0;

  // Outer shoulder seams sit wider than internal skeletal joints (11/12) and higher on the trapezius
  const outerShoulderHalfWidth = Math.max(shoulderWidth * 0.68, segmentedHalfSpan * 0.96);
  const shoulderSeamLift = shoulderWidth * 0.16;
  const shoulderSeamLeft = {
    x: shoulderCenter.x - shoulderDirection.x * outerShoulderHalfWidth + up.x * shoulderSeamLift,
    y: shoulderCenter.y - shoulderDirection.y * outerShoulderHalfWidth + up.y * shoulderSeamLift,
  };
  const shoulderSeamRight = {
    x: shoulderCenter.x + shoulderDirection.x * outerShoulderHalfWidth + up.x * shoulderSeamLift,
    y: shoulderCenter.y + shoulderDirection.y * outerShoulderHalfWidth + up.y * shoulderSeamLift,
  };

  // Neck/collar sits well above the skeletal shoulder line so the collar hugs the neck base
  const collarLift = shoulderWidth * 0.28;
  const neckTarget = {
    x: shoulderCenter.x + up.x * collarLift,
    y: shoulderCenter.y + up.y * collarLift,
  };

  const hipCenterX = (hl.x + hr.x) / 2;
  const waistCenter = lerp(shoulderCenter, { x: hipCenterX, y: lowerY }, 0.52);
  const waistHalfWidth = Math.max(shoulderWidth * 0.68, segmentedHalfSpan * 1.04);
  const hipHalfWidth = Math.max(Math.hypot(hr.x - hl.x, hr.y - hl.y) * 0.68, waistHalfWidth * 1.02);
  const waistLeft = {
    x: placement.bodyLeftX !== undefined ? Math.min(waistCenter.x - shoulderDirection.x * waistHalfWidth, placement.bodyLeftX - shoulderWidth * 0.03) : waistCenter.x - shoulderDirection.x * waistHalfWidth,
    y: waistCenter.y - shoulderDirection.y * waistHalfWidth,
  };
  const waistRight = {
    x: placement.bodyRightX !== undefined ? Math.max(waistCenter.x + shoulderDirection.x * waistHalfWidth, placement.bodyRightX + shoulderWidth * 0.03) : waistCenter.x + shoulderDirection.x * waistHalfWidth,
    y: waistCenter.y + shoulderDirection.y * waistHalfWidth,
  };
  const hips = [
    { x: Math.min(hipCenterX - shoulderDirection.x * hipHalfWidth, waistLeft.x), y: lowerY - shoulderDirection.y * hipHalfWidth },
    { x: Math.max(hipCenterX + shoulderDirection.x * hipHalfWidth, waistRight.x), y: lowerY + shoulderDirection.y * hipHalfWidth },
  ];

  const sourceHemRatio = Math.max(0.24, Math.min(0.76, hemWidthRatio * 0.94));
  const sourceWaistRatio = Math.max(0.32, Math.min(0.64, hemWidthRatio * 0.90));
  const sourceControls: Point[] = [
    { x: 0.22, y: 0.12 },
    { x: 0.78, y: 0.12 },
    { x: (1 - sourceWaistRatio) / 2, y: 0.55 },
    { x: (1 + sourceWaistRatio) / 2, y: 0.55 },
    { x: (1 - sourceHemRatio) / 2, y: 0.98 },
    { x: (1 + sourceHemRatio) / 2, y: 0.98 },
    { x: Math.max(0.1, Math.min(0.9, necklineX)), y: Math.max(0.02, Math.min(0.35, necklineY)) },
  ];
  const targetControls: Point[] = [
    shoulderSeamLeft,
    shoulderSeamRight,
    waistLeft,
    waistRight,
    ...hips,
    neckTarget,
  ];

  // Articulate left and right sleeve cuffs along the upper-arm vector ONLY when the arm is outside the torso.
  // When an arm crosses in front of the chest, keep the sleeve naturally draped on the outer deltoid.
  const defaultLeftArm = {
    x: shoulderSeamLeft.x - (shoulderDirection.x * 0.38 + up.x * 0.34) * shoulderWidth,
    y: shoulderSeamLeft.y - (shoulderDirection.y * 0.38 + up.y * 0.34) * shoulderWidth,
  };
  const defaultRightArm = {
    x: shoulderSeamRight.x + (shoulderDirection.x * 0.38 - up.x * 0.34) * shoulderWidth,
    y: shoulderSeamRight.y + (shoulderDirection.y * 0.38 - up.y * 0.34) * shoulderWidth,
  };
  const leftArmAbducted =
    placement.elbowLeft &&
    (placement.elbowLeft.x - shoulderCenter.x) * shoulderDirection.x +
      (placement.elbowLeft.y - shoulderCenter.y) * shoulderDirection.y <
      -shoulderWidth * 0.48;
  const rightArmAbducted =
    placement.elbowRight &&
    (placement.elbowRight.x - shoulderCenter.x) * shoulderDirection.x +
      (placement.elbowRight.y - shoulderCenter.y) * shoulderDirection.y >
      shoulderWidth * 0.48;

  sourceControls.push({ x: 0.04, y: 0.34 });
  targetControls.push(leftArmAbducted && placement.elbowLeft ? lerp(shoulderSeamLeft, placement.elbowLeft, 0.78) : defaultLeftArm);
  sourceControls.push({ x: 0.96, y: 0.34 });
  targetControls.push(rightArmAbducted && placement.elbowRight ? lerp(shoulderSeamRight, placement.elbowRight, 0.78) : defaultRightArm);

  return { sourceControls, targetControls };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalizeAngleDiff(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function mapGarmentBoneSkinPoint(
  u: number,
  v: number,
  placement: GarmentPlacement,
  frameHeight: number,
  _necklineX = 0.5,
  _necklineY = 0.08,
  hemWidthRatio = 1,
): Point {
  const { shoulderLeft: sl, shoulderRight: sr, hipLeft: hl, hipRight: hr } = placement;
  const lerp = (a: Point, b: Point, amount: number): Point => ({
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  });
  const rawLowerY = (hl.y + hr.y) / 2;
  const lowerY =
    rawLowerY >= frameHeight * 0.97
      ? Math.min(rawLowerY, frameHeight * 1.04)
      : Math.min(rawLowerY, frameHeight * 0.98);
  const shoulderWidth = Math.hypot(sr.x - sl.x, sr.y - sl.y) || 1;
  const shoulderDir = { x: (sr.x - sl.x) / shoulderWidth, y: (sr.y - sl.y) / shoulderWidth };
  const up = { x: shoulderDir.y, y: -shoulderDir.x };
  const shoulderCenter = lerp(sl, sr, 0.5);

  const segmentedHalfSpan =
    placement.bodyLeftX !== undefined && placement.bodyRightX !== undefined
      ? Math.min(
          shoulderWidth * 0.68,
          Math.max(shoulderCenter.x - placement.bodyLeftX, placement.bodyRightX - shoulderCenter.x),
        )
      : 0;

  const chestHalfWidth =
    placement.chestHalfWidth !== undefined
      ? Math.max(shoulderWidth * 0.60, placement.chestHalfWidth)
      : Math.max(shoulderWidth * 0.64, segmentedHalfSpan);
  const rawHipWidth = Math.hypot(hr.x - hl.x, hr.y - hl.y);
  const waistHalfWidth =
    placement.waistHalfWidth !== undefined
      ? Math.max(shoulderWidth * 0.58, placement.waistHalfWidth)
      : Math.max(shoulderWidth * 0.62, segmentedHalfSpan * 0.96);
  const hemHalfWidth =
    placement.hipHalfWidth !== undefined
      ? Math.max(shoulderWidth * 0.60, placement.hipHalfWidth)
      : Math.max(
          shoulderWidth * 0.62,
          Math.min(shoulderWidth * 0.70, rawHipWidth * 0.64),
        );

  // Half-width of the shirt's opaque torso column in UV space [0..1]
  const defaultHalfTorsoU = Math.max(0.20, Math.min(0.35, hemWidthRatio * 0.46));

  // Top of collar (v = 0) sits above shoulderCenter so v = 0.08 hugs the base of the neck
  const topSpine = {
    x: shoulderCenter.x + up.x * (shoulderWidth * 0.28),
    y: shoulderCenter.y + up.y * (shoulderWidth * 0.28),
  };
  const bottomSpine = { x: (hl.x + hr.x) / 2, y: lowerY };

  const sampleProfile = (profile: number[] | undefined, t: number): number | undefined => {
    if (!profile || profile.length === 0) return undefined;
    const clamped = Math.max(0, Math.min(1, t));
    const exactIdx = clamped * (profile.length - 1);
    const i0 = Math.floor(exactIdx);
    const i1 = Math.min(profile.length - 1, i0 + 1);
    const frac = exactIdx - i0;
    return profile[i0] + (profile[i1] - profile[i0]) * frac;
  };

  const uLeftAtV = sampleProfile(placement.garmentSilhouette?.torsoLeftU, v) ?? 0.5 - defaultHalfTorsoU;
  const uRightAtV = sampleProfile(placement.garmentSilhouette?.torsoRightU, v) ?? 0.5 + defaultHalfTorsoU;
  const uMidAtV = (uLeftAtV + uRightAtV) * 0.5;
  const halfTorsoU = Math.max(0.16, Math.min(0.35, (uRightAtV - uLeftAtV) * 0.5));
  const garmentHemV = Math.max(0.88, sampleProfile(placement.garmentSilhouette?.bottomV, 0.5) ?? 1.0);

  const torsoPoint = (uVal: number, vVal: number): Point => {
    const rowUL = sampleProfile(placement.garmentSilhouette?.torsoLeftU, vVal) ?? 0.5 - defaultHalfTorsoU;
    const rowUR = sampleProfile(placement.garmentSilhouette?.torsoRightU, vVal) ?? 0.5 + defaultHalfTorsoU;
    const rowMid = (rowUL + rowUR) * 0.5;
    const rowHalfU = Math.max(0.16, Math.min(0.35, (rowUR - rowUL) * 0.5));
    const sVal = (uVal - rowMid) / rowHalfU;
    const absS = Math.abs(sVal);

    // Compensate for shoulder slope already baked into the flat-lay garment image (e.g. tall polo collar)
    // so the opaque shoulder seam (v = garmentTopV[u]) lands directly on segColTopY[u] with zero bare shoulder gap.
    const colOpaqueTopV = sampleProfile(placement.garmentSilhouette?.topV, uVal) ?? 0;
    const bakedShoulderSlopeV =
      Math.min(0.26, Math.max(0, colOpaqueTopV)) *
      smoothstep(0.24, 0.58, Math.min(1.15, absS));
    const vEffective = Math.max(
      -0.15,
      Math.min(1.08, (vVal - bakedShoulderSlopeV) / Math.max(0.55, garmentHemV - bakedShoulderSlopeV)),
    );
    const vClamped = Math.max(0, Math.min(1, vEffective));

    const spine = lerp(topSpine, bottomSpine, vEffective);
    // Multi-slice contour interpolation across upper chest (0..0.30), waist/lats (0.30..0.65), and hip hem (0.65..1.0)
    let halfW = chestHalfWidth;
    if (vClamped > 0.30 && vClamped <= 0.65) {
      const t = (vClamped - 0.30) / 0.35;
      halfW = chestHalfWidth + (waistHalfWidth - chestHalfWidth) * t;
    } else if (vClamped > 0.65) {
      const t = (vClamped - 0.65) / 0.35;
      halfW = waistHalfWidth + (hemHalfWidth - waistHalfWidth) * t;
    }

    // If live per-row segmentation contour is available, wrap directly to the segmented left and right body edges
    const segLeft = sampleProfile(placement.segRowLeftX, vClamped);
    const segRight = sampleProfile(placement.segRowRightX, vClamped);
    const leftHalfW = segLeft !== undefined
      ? Math.max(shoulderWidth * 0.48, Math.min(shoulderWidth * 0.72, spine.x - segLeft + shoulderWidth * 0.02))
      : halfW;
    const rightHalfW = segRight !== undefined
      ? Math.max(shoulderWidth * 0.48, Math.min(shoulderWidth * 0.72, segRight - spine.x + shoulderWidth * 0.02))
      : halfW;
    const activeHalfW = sVal < 0 ? leftHalfW : rightHalfW;

    // Drop the top of the garment along the live per-column segmented shoulder/trapezius/arm contour (segColTopY)
    const segTopY = sampleProfile(placement.segColTopY, uVal);
    const outerRatio = Math.min(1.35, Math.max(0, absS - 0.28) / 0.82);
    const defaultDrop = outerRatio * shoulderWidth * 0.18;
    const measuredDrop = segTopY !== undefined ? Math.max(0, segTopY - shoulderWidth * 0.035 - topSpine.y) : defaultDrop;
    const trapDrop = vClamped < 0.44 ? measuredDrop * (1 - vClamped / 0.44) : 0;

    return {
      x: spine.x + shoulderDir.x * (sVal * activeHalfW) - up.x * trapDrop,
      y: spine.y + shoulderDir.y * (sVal * activeHalfW) - up.y * trapDrop,
    };
  };

  const s = (u - uMidAtV) / halfTorsoU;
  const base = torsoPoint(u, v);

  const shoulderAngle = Math.atan2(sr.y - sl.y, Math.max(12, sr.x - sl.x));

  // Left sleeve skeletal skinning around left acromion pivot along tracked (shoulderLeft -> elbowLeft) or segmented upper-arm axis.
  if (s < -0.90 && v < 0.60) {
    const wL = smoothstep(-0.90, -1.16, s) * smoothstep(0.60, 0.45, v);
    if (wL > 0.001) {
      const seamUL = uMidAtV - halfTorsoU * 0.96;
      const seamTopVL = sampleProfile(placement.garmentSilhouette?.topV, seamUL) ?? 0.14;
      const pivotL = torsoPoint(seamUL, seamTopVL + 0.04);
      const restAngleL = shoulderAngle + Math.PI - 0.78;
      const leftArmAbducted =
        placement.elbowLeft &&
        (placement.elbowLeft.x - shoulderCenter.x) * shoulderDir.x +
          (placement.elbowLeft.y - shoulderCenter.y) * shoulderDir.y <
          -shoulderWidth * 0.24;
      const trackedAngleL =
        leftArmAbducted && placement.elbowLeft
          ? Math.atan2(placement.elbowLeft.y - sl.y, placement.elbowLeft.x - sl.x)
          : (placement.segArmAngleLeft ?? restAngleL);
      const rawDeltaL = normalizeAngleDiff(trackedAngleL - restAngleL);
      // Full physiological sleeve rotation: downward (-0.82 rad = -47 deg) onto hanging arms up to overhead (+1.35 rad)
      const deltaL = Math.max(-0.82, Math.min(1.35, rawDeltaL)) * wL;
      const cosL = Math.cos(deltaL);
      const sinL = Math.sin(deltaL);
      const dx = base.x - pivotL.x;
      const dy = base.y - pivotL.y;
      let rx = pivotL.x + dx * cosL - dy * sinL;
      const ry = pivotL.y + dx * sinL + dy * cosL;
      // When arm hangs downward, keep inner underarm seam from folding inside the lateral ribcage seam
      // while expanding the outer deltoid sleeve wall to hug segOuterLeftX.
      if (deltaL < -0.15) {
        const seamLeft = torsoPoint(uMidAtV - halfTorsoU * 0.96, Math.min(0.45, Math.max(0.18, v)));
        rx = Math.min(rx, seamLeft.x + shoulderWidth * 0.02);
        const outerSegL = sampleProfile(placement.segOuterLeftX, Math.min(0.48, Math.max(0.10, (ry - topSpine.y) / Math.max(40, bottomSpine.y - topSpine.y))));
        if (outerSegL !== undefined && v < 0.34) {
          const outerCapW = smoothstep(-0.95, -1.65, s) * smoothstep(0.34, 0.20, v);
          rx = rx + (outerSegL - shoulderWidth * 0.015 - rx) * outerCapW * 0.65;
        }
      }
      return { x: rx, y: ry };
    }
  }

  // Right sleeve skeletal skinning around right acromion pivot along tracked (shoulderRight -> elbowRight) or segmented upper-arm axis.
  if (s > 0.90 && v < 0.60) {
    const wR = smoothstep(0.90, 1.16, s) * smoothstep(0.60, 0.45, v);
    if (wR > 0.001) {
      const seamUR = uMidAtV + halfTorsoU * 0.96;
      const seamTopVR = sampleProfile(placement.garmentSilhouette?.topV, seamUR) ?? 0.14;
      const pivotR = torsoPoint(seamUR, seamTopVR + 0.04);
      const restAngleR = shoulderAngle + 0.78;
      const rightArmAbducted =
        placement.elbowRight &&
        (placement.elbowRight.x - shoulderCenter.x) * shoulderDir.x +
          (placement.elbowRight.y - shoulderCenter.y) * shoulderDir.y >
          shoulderWidth * 0.24;
      const trackedAngleR =
        rightArmAbducted && placement.elbowRight
          ? Math.atan2(placement.elbowRight.y - sr.y, placement.elbowRight.x - sr.x)
          : (placement.segArmAngleRight ?? restAngleR);
      const rawDeltaR = normalizeAngleDiff(trackedAngleR - restAngleR);
      const deltaR = Math.max(-1.35, Math.min(0.82, rawDeltaR)) * wR;
      const cosR = Math.cos(deltaR);
      const sinR = Math.sin(deltaR);
      const dx = base.x - pivotR.x;
      const dy = base.y - pivotR.y;
      let rx = pivotR.x + dx * cosR - dy * sinR;
      const ry = pivotR.y + dx * sinR + dy * cosR;
      if (deltaR > 0.15) {
        const seamRight = torsoPoint(uMidAtV + halfTorsoU * 0.96, Math.min(0.45, Math.max(0.18, v)));
        rx = Math.max(rx, seamRight.x - shoulderWidth * 0.02);
        const outerSegR = sampleProfile(placement.segOuterRightX, Math.min(0.48, Math.max(0.10, (ry - topSpine.y) / Math.max(40, bottomSpine.y - topSpine.y))));
        if (outerSegR !== undefined && v < 0.34) {
          const outerCapW = smoothstep(0.95, 1.65, s) * smoothstep(0.34, 0.20, v);
          rx = rx + (outerSegR + shoulderWidth * 0.015 - rx) * outerCapW * 0.65;
        }
      }
      return { x: rx, y: ry };
    }
  }

  return base;
}

export function drawGarmentOnTorso(
  context: CanvasRenderingContext2D,
  garment: HTMLCanvasElement,
  placement: GarmentPlacement,
  necklineX: number,
  necklineY: number,
  hemWidthRatio = 1,
): void {
  const columns = 24;
  const rows = 28;
  const enrichedPlacement: GarmentPlacement = placement.garmentSilhouette
    ? placement
    : { ...placement, garmentSilhouette: getOrComputeGarmentSilhouette(garment) };

  const sourceGrid = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => ({
      x: (garment.width * column) / columns,
      y: (garment.height * row) / rows,
    })),
  );
  const targetGrid = sourceGrid.map((line) =>
    line.map((point) =>
      mapGarmentBoneSkinPoint(
        point.x / garment.width,
        point.y / garment.height,
        enrichedPlacement,
        context.canvas.height,
        necklineX,
        necklineY,
        hemWidthRatio,
      ),
    ),
  );
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const tl = sourceGrid[row][column];
      const tr = sourceGrid[row][column + 1];
      const bl = sourceGrid[row + 1][column];
      const br = sourceGrid[row + 1][column + 1];
      drawTriangle(context, garment, [tl, tr, bl], [targetGrid[row][column], targetGrid[row][column + 1], targetGrid[row + 1][column]]);
      drawTriangle(context, garment, [tr, br, bl], [targetGrid[row][column + 1], targetGrid[row + 1][column + 1], targetGrid[row + 1][column]]);
    }
  }

}
