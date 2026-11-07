// Adaptive filtering/compositing adapted from Drakit0/Try-On; see THIRD_PARTY_NOTICES.md.
import type { NormalizedLandmark, Point } from "./garment";

class OneEuroFilter {
  private value: number | null = null;
  private raw = 0;
  private velocity = 0;
  private time = 0;

  sample(value: number, time: number): number {
    const dt = (time - this.time) / 1000;
    if (this.value === null || dt > 0.25 || dt <= 0) {
      this.value = this.raw = value;
      this.velocity = 0;
    } else {
      const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
      this.velocity += alpha(1) * ((value - this.raw) / dt - this.velocity);
      this.value += alpha(1.5 + 4 * Math.abs(this.velocity)) * (value - this.value);
      this.raw = value;
    }
    this.time = time;
    return this.value;
  }
}

export class PoseSmoother {
  private filters: OneEuroFilter[][] = [];

  reset(): void { this.filters = []; }

  filter(landmarks: NormalizedLandmark[], time: number): NormalizedLandmark[] {
    return landmarks.map((landmark, index) => {
      const filters = this.filters[index] ??= [new OneEuroFilter(), new OneEuroFilter(), new OneEuroFilter()];
      if (![landmark.x, landmark.y].every(Number.isFinite) || (landmark.visibility ?? landmark.presence ?? 1) < 0.35) {
        this.filters[index] = [];
        return landmark;
      }
      if (filters.length === 0) this.filters[index] = [new OneEuroFilter(), new OneEuroFilter(), new OneEuroFilter()];
      const current = this.filters[index];
      return {
        ...landmark,
        x: current[0].sample(landmark.x, time),
        y: current[1].sample(landmark.y, time),
        z: Number.isFinite(landmark.z) ? current[2].sample(landmark.z!, time) : undefined,
      };
    });
  }
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

export interface ForegroundAlphaOptions {
  restoreCrossedForearms?: boolean;
}

export function getForegroundAlpha(
  categories: Uint8Array,
  width: number,
  height: number,
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
  options?: ForegroundAlphaOptions,
): Uint8ClampedArray {
  if (width < 1 || height < 1 || categories.length !== width * height || frameWidth <= 0 || frameHeight <= 0) {
    throw new Error("Invalid foreground mask dimensions.");
  }
  const alpha = new Uint8ClampedArray(width * height * 4);
  const visible = (index: number) => {
    const p = landmarks[index];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? p.presence ?? 0) >= 0.5;
  };
  const toPixel = (p: NormalizedLandmark) => ({ x: p.x * frameWidth, y: p.y * frameHeight });
  const shoulderWidth = visible(11) && visible(12)
    ? Math.hypot((landmarks[12].x - landmarks[11].x) * frameWidth, (landmarks[12].y - landmarks[11].y) * frameHeight) : 0;
  const shoulderDepth = ((landmarks[11]?.z ?? 0) + (landmarks[12]?.z ?? 0)) / 2;
  const left = landmarks[11]?.x < landmarks[12]?.x ? landmarks[11] : landmarks[12];
  const right = landmarks[11]?.x < landmarks[12]?.x ? landmarks[12] : landmarks[11];
  const handPairs = [[15, 17], [15, 19], [15, 21], [16, 18], [16, 20], [16, 22]];
  const forearmPairs = options?.restoreCrossedForearms ? [[13, 15], [14, 16]] : [];
  const isWristCrossingTorso = (wristIndex: number) => {
    const wrist = landmarks[wristIndex];
    const elbowIndex = wristIndex === 15 ? 13 : 14;
    const elbow = landmarks[elbowIndex];
    if (!wrist || !left || !right) return false;
    const spanX = Math.max(0.05, Math.abs(right.x - left.x));
    const minX = Math.min(left.x, right.x) + spanX * 0.08;
    const maxX = Math.max(left.x, right.x) - spanX * 0.08;
    const insideChestX = wrist.x >= minX && wrist.x <= maxX;
    const bentAcrossOrUp =
      !visible(elbowIndex) ||
      Math.abs(wrist.x - elbow.x) >= spanX * 0.18 ||
      wrist.y <= elbow.y + spanX * 0.08;
    return insideChestX && bentAcrossOrUp && (wrist.z ?? shoulderDepth) <= shoulderDepth + 0.04;
  };
  const palmPoints = [15, 16]
    .filter((wristIndex) => visible(wristIndex) && isWristCrossingTorso(wristIndex))
    .map((wristIndex) => toPixel(landmarks[wristIndex]));
  const segments = [
    ...handPairs
      .filter(([start, end]) => visible(start) && visible(end) && isWristCrossingTorso(start)
        && ((landmarks[start].z ?? shoulderDepth) + (landmarks[end].z ?? shoulderDepth)) / 2 <= shoulderDepth + 0.08)
      .map(([start, end]) => [toPixel(landmarks[start]), toPixel(landmarks[end])] as const),
    ...forearmPairs
      .filter(([start, end]) => visible(start) && visible(end) && isWristCrossingTorso(end))
      .map(([start, end]) => [toPixel(landmarks[start]), toPixel(landmarks[end])] as const),
  ];
  const coreRadius = shoulderWidth * 0.095;
  const featherRadius = shoulderWidth * 0.11;
  const palmRadius = shoulderWidth * 0.11;
  // The uploaded garment's alpha defines the neckline; pose geometry must not cut a substitute hole.
  for (let index = 0; index < categories.length; index++) {
    const category = categories[index];
    const point = { x: ((index % width) + 0.5) * frameWidth / width, y: (Math.floor(index / width) + 0.5) * frameHeight / height };
    let alphaValue = 0;
    if ((category === 1 || category === 3) && shoulderWidth > 0) {
      const dx = (right.x - left.x) * frameWidth / shoulderWidth;
      const dy = (right.y - left.y) * frameHeight / shoulderWidth;
      const x = point.x - (left.x + right.x) * frameWidth / 2;
      const y = point.y - (left.y + right.y) * frameHeight / 2;
      if (-x * dy + y * dx < -shoulderWidth * 0.03 && Math.abs(x * dx + y * dy) < shoulderWidth * 0.7) {
        alphaValue = 255;
      }
    }
    if (category === 2 && shoulderWidth > 0 && alphaValue < 255) {
      let minDist = Infinity;
      for (const [start, end] of segments) {
        const d = distanceToSegment(point, start, end);
        if (d < minDist) minDist = d;
      }
      for (const palm of palmPoints) {
        const d = Math.hypot(point.x - palm.x, point.y - palm.y);
        if (d <= palmRadius && d < minDist) minDist = Math.min(minDist, coreRadius * (d / palmRadius));
      }
      if (minDist <= coreRadius) {
        alphaValue = 255;
      } else if (minDist <= featherRadius) {
        const t = (featherRadius - minDist) / Math.max(1e-5, featherRadius - coreRadius);
        alphaValue = Math.round(255 * t);
      }
    }
    if (alphaValue > 0) alpha[index * 4 + 3] = alphaValue;
  }
  return alpha;
}
