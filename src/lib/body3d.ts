import type { NormalizedLandmark } from "./garment.ts";
import { PoseSmoother } from "./tryOn.ts";

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Capsule3D {
  start: Vector3D;
  end: Vector3D;
  radius: number;
  isInFrontOfTorso: boolean;
}

export interface BodyFrame3D {
  origin: Vector3D;
  neckCenter: Vector3D;
  hipCenter: Vector3D;
  shoulderLeft: Vector3D;
  shoulderRight: Vector3D;
  hipLeft: Vector3D;
  hipRight: Vector3D;
  elbowLeft?: Vector3D;
  elbowRight?: Vector3D;
  wristLeft?: Vector3D;
  wristRight?: Vector3D;
  handLeft?: Vector3D;
  handRight?: Vector3D;
  rightAxis: Vector3D;
  upAxis: Vector3D;
  forwardAxis: Vector3D;
  projectedShoulderWidth: number;
  trueShoulderWidth: number;
  torsoHeight: number;
  yaw: number;
  pitch: number;
  roll: number;
  confidence: number;
  isSideProfile: boolean;
  leftLandmarkIndex: 11 | 12;
}

export interface BodyProxy3D {
  frame: BodyFrame3D;
  torsoCenter: Vector3D;
  torsoRadiusX: number;
  torsoRadiusZ: number;
  torsoHeight: number;
  collarY: number;
  hemY: number;
  shoulderSeamLeft: Vector3D;
  shoulderSeamRight: Vector3D;
  leftUpperArm: Capsule3D | null;
  rightUpperArm: Capsule3D | null;
  leftForearm: Capsule3D | null;
  rightForearm: Capsule3D | null;
  leftHand: Capsule3D | null;
  rightHand: Capsule3D | null;
}

export interface EstimateBodyFrameOptions {
  preferredLeftIndex?: 11 | 12;
  referenceShoulderRatio?: number;
  segmentation?: {
    categories: Uint8Array;
    width: number;
    height: number;
  } | null;
}

export interface BodySegmentationBounds {
  leftX?: number;
  rightX?: number;
  touchesBottom?: boolean;
}

function dot3(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize3(v: Vector3D, fallback: Vector3D): Vector3D {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(len) || len < 1e-6) return fallback;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function isLandmarkVisible(landmark: NormalizedLandmark | undefined, minConfidence: number): landmark is NormalizedLandmark {
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return false;
  if (landmark.x < -0.08 || landmark.x > 1.08 || landmark.y < -0.08 || landmark.y > 1.08) return false;
  return (landmark.visibility ?? landmark.presence ?? 1) >= minConfidence;
}

function toVector3D(landmark: NormalizedLandmark, frameWidth: number, frameHeight: number, zOrigin = 0): Vector3D {
  // MediaPipe z is negative when closer to the camera; invert so +z is closer to the camera in 3D space.
  const rawZ = Number.isFinite(landmark.z) ? landmark.z! : zOrigin;
  return {
    x: landmark.x * frameWidth,
    y: landmark.y * frameHeight,
    z: -(rawZ - zOrigin) * frameWidth,
  };
}

export function estimateBodyFrame3D(
  landmarks: NormalizedLandmark[],
  frameWidth: number,
  frameHeight: number,
  options?: EstimateBodyFrameOptions,
): BodyFrame3D | null {
  if (frameWidth <= 0 || frameHeight <= 0 || landmarks.length < 25) return null;

  const s11 = landmarks[11];
  const s12 = landmarks[12];
  if (!isLandmarkVisible(s11, 0.45) || !isLandmarkVisible(s12, 0.45)) return null;

  // Preserve anatomical shoulder polarity near side profile so X crossover never flips 180 degrees
  const rawDxNorm = s12.x - s11.x;
  let leftLandmarkIndex: 11 | 12;
  if (options?.preferredLeftIndex && Math.abs(rawDxNorm) < 0.16) {
    leftLandmarkIndex = options.preferredLeftIndex;
  } else {
    leftLandmarkIndex = s11.x <= s12.x ? 11 : 12;
  }
  const rightLandmarkIndex: 11 | 12 = leftLandmarkIndex === 11 ? 12 : 11;
  const leftShoulderLm = landmarks[leftLandmarkIndex];
  const rightShoulderLm = landmarks[rightLandmarkIndex];

  const shoulderMidZ = ((leftShoulderLm.z ?? 0) + (rightShoulderLm.z ?? 0)) / 2;
  const shoulderLeft = toVector3D(leftShoulderLm, frameWidth, frameHeight, shoulderMidZ);
  const shoulderRight = toVector3D(rightShoulderLm, frameWidth, frameHeight, shoulderMidZ);

  const projectedShoulderWidth = Math.hypot(
    shoulderRight.x - shoulderLeft.x,
    shoulderRight.y - shoulderLeft.y,
  );
  const depthSpan = Math.abs(shoulderRight.z - shoulderLeft.z);
  const raw3DShoulderSpan = Math.hypot(projectedShoulderWidth, depthSpan);
  if (!Number.isFinite(raw3DShoulderSpan) || raw3DShoulderSpan < 12) return null;

  const origin: Vector3D = {
    x: (shoulderLeft.x + shoulderRight.x) / 2,
    y: (shoulderLeft.y + shoulderRight.y) / 2,
    z: 0,
  };

  const leftHipLm = landmarks[leftLandmarkIndex === 11 ? 23 : 24];
  const rightHipLm = landmarks[rightLandmarkIndex === 11 ? 23 : 24];
  const hipsVisible = isLandmarkVisible(leftHipLm, 0.35) && isLandmarkVisible(rightHipLm, 0.35);

  let hipLeft: Vector3D;
  let hipRight: Vector3D;
  let torsoHeight: number;
  if (hipsVisible) {
    const rawHipLeft = toVector3D(leftHipLm, frameWidth, frameHeight, shoulderMidZ);
    const rawHipRight = toVector3D(rightHipLm, frameWidth, frameHeight, shoulderMidZ);
    const rawHipCenterY = (rawHipLeft.y + rawHipRight.y) / 2;
    const measuredHeight = Math.hypot(
      (rawHipLeft.x + rawHipRight.x) / 2 - origin.x,
      rawHipCenterY - origin.y,
    );
    if (rawHipCenterY > origin.y + raw3DShoulderSpan * 0.35 && measuredHeight <= raw3DShoulderSpan * 3.2) {
      hipLeft = rawHipLeft;
      hipRight = rawHipRight;
      torsoHeight = measuredHeight;
    } else {
      torsoHeight = raw3DShoulderSpan * 1.55;
      hipLeft = { x: shoulderLeft.x, y: shoulderLeft.y + torsoHeight, z: shoulderLeft.z };
      hipRight = { x: shoulderRight.x, y: shoulderRight.y + torsoHeight, z: shoulderRight.z };
    }
  } else {
    torsoHeight = raw3DShoulderSpan * 1.55;
    hipLeft = { x: shoulderLeft.x, y: shoulderLeft.y + torsoHeight, z: shoulderLeft.z };
    hipRight = { x: shoulderRight.x, y: shoulderRight.y + torsoHeight, z: shoulderRight.z };
  }

  const ratioFloor = options?.referenceShoulderRatio
    ? torsoHeight * options.referenceShoulderRatio * 0.92
    : torsoHeight * 0.56;
  const trueShoulderWidth = Math.max(raw3DShoulderSpan, ratioFloor);

  const hipCenter: Vector3D = {
    x: (hipLeft.x + hipRight.x) / 2,
    y: (hipLeft.y + hipRight.y) / 2,
    z: (hipLeft.z + hipRight.z) / 2,
  };

  // Construct 3D orthonormal basis using Gram-Schmidt in a right-handed 3D coordinate system
  // (X: right, Y: up in 3D = -screenY, Z: out of chest toward camera)
  const clampedHorizDx = Math.max(trueShoulderWidth * 0.03, shoulderRight.x - shoulderLeft.x);
  const shoulderVec3D: Vector3D = {
    x: clampedHorizDx,
    y: -(shoulderRight.y - shoulderLeft.y),
    z: shoulderRight.z - shoulderLeft.z,
  };
  const spineUpVec3D: Vector3D = {
    x: -(hipCenter.x - origin.x),
    y: hipCenter.y - origin.y,
    z: -(hipCenter.z - origin.z),
  };

  const upAxis = normalize3(spineUpVec3D, { x: 0, y: 1, z: 0 });
  const shoulderProj = dot3(shoulderVec3D, upAxis);
  const orthoRight = {
    x: shoulderVec3D.x - upAxis.x * shoulderProj,
    y: shoulderVec3D.y - upAxis.y * shoulderProj,
    z: shoulderVec3D.z - upAxis.z * shoulderProj,
  };
  const rightAxis = normalize3(orthoRight, { x: 1, y: 0, z: 0 });
  const forwardAxis = normalize3(cross3(rightAxis, upAxis), { x: 0, y: 0, z: 1 });

  // Yaw in [-pi/2, pi/2]: apply a 0.06 normalized Z deadzone so bending one arm while facing
  // the camera does not induce a false 20-30 deg yaw shear on the torso mesh.
  const rawDzNorm = (rightShoulderLm.z ?? 0) - (leftShoulderLm.z ?? 0);
  const deadzonedDzNorm =
    Math.abs(rawDzNorm) <= 0.06 ? 0 : rawDzNorm - Math.sign(rawDzNorm) * 0.04;
  const dzMp = deadzonedDzNorm * frameWidth;
  const yaw = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, Math.atan2(dzMp, clampedHorizDx)));
  const pitch = Math.max(-0.6, Math.min(0.6, Math.asin(Math.max(-1, Math.min(1, forwardAxis.y)))));
  const roll = Math.max(
    -0.75,
    Math.min(0.75, Math.atan2(shoulderRight.y - shoulderLeft.y, Math.max(24, projectedShoulderWidth))),
  );

  const neckLift = trueShoulderWidth * 0.26;
  const neckCenter: Vector3D = {
    x: origin.x + upAxis.x * neckLift,
    y: origin.y - upAxis.y * neckLift,
    z: origin.z + upAxis.z * neckLift,
  };

  const leftElbowLm = landmarks[leftLandmarkIndex === 11 ? 13 : 14];
  const rightElbowLm = landmarks[rightLandmarkIndex === 11 ? 13 : 14];
  const leftWristLm = landmarks[leftLandmarkIndex === 11 ? 15 : 16];
  const rightWristLm = landmarks[rightLandmarkIndex === 11 ? 15 : 16];
  const leftHandLm = landmarks[leftLandmarkIndex === 11 ? 19 : 20];
  const rightHandLm = landmarks[rightLandmarkIndex === 11 ? 19 : 20];

  const elbowLeft = isLandmarkVisible(leftElbowLm, 0.35)
    ? toVector3D(leftElbowLm, frameWidth, frameHeight, shoulderMidZ)
    : undefined;
  const elbowRight = isLandmarkVisible(rightElbowLm, 0.35)
    ? toVector3D(rightElbowLm, frameWidth, frameHeight, shoulderMidZ)
    : undefined;
  const wristLeft = isLandmarkVisible(leftWristLm, 0.35)
    ? toVector3D(leftWristLm, frameWidth, frameHeight, shoulderMidZ)
    : undefined;
  const wristRight = isLandmarkVisible(rightWristLm, 0.35)
    ? toVector3D(rightWristLm, frameWidth, frameHeight, shoulderMidZ)
    : undefined;
  const handLeft = isLandmarkVisible(leftHandLm, 0.35)
    ? toVector3D(leftHandLm, frameWidth, frameHeight, shoulderMidZ)
    : undefined;
  const handRight = isLandmarkVisible(rightHandLm, 0.35)
    ? toVector3D(rightHandLm, frameWidth, frameHeight, shoulderMidZ)
    : undefined;

  const shoulderConf = ((leftShoulderLm.visibility ?? 1) + (rightShoulderLm.visibility ?? 1)) / 2;
  const hipConf = hipsVisible ? ((leftHipLm.visibility ?? 0.7) + (rightHipLm.visibility ?? 0.7)) / 2 : 0.65;
  const confidence = Math.max(0, Math.min(1, shoulderConf * 0.7 + hipConf * 0.3));

  return {
    origin,
    neckCenter,
    hipCenter,
    shoulderLeft,
    shoulderRight,
    hipLeft,
    hipRight,
    elbowLeft,
    elbowRight,
    wristLeft,
    wristRight,
    handLeft,
    handRight,
    rightAxis,
    upAxis,
    forwardAxis,
    projectedShoulderWidth,
    trueShoulderWidth,
    torsoHeight,
    yaw,
    pitch,
    roll,
    confidence,
    isSideProfile: Math.abs(yaw) >= Math.PI / 3.4 || projectedShoulderWidth <= trueShoulderWidth * 0.55,
    leftLandmarkIndex,
  };
}

export function constructBodyProxy3D(
  frame: BodyFrame3D,
  segmentationBounds?: BodySegmentationBounds,
): BodyProxy3D {
  const { origin, hipCenter, trueShoulderWidth, torsoHeight, upAxis } = frame;

  // Anatomical outer torso radius (ribcage/lat contour sits ~74% of skeletal shoulder width from center)
  let torsoRadiusX = trueShoulderWidth * 0.74;
  if (segmentationBounds?.leftX !== undefined && segmentationBounds?.rightX !== undefined) {
    const segHalfWidth = Math.min(
      trueShoulderWidth * 0.78,
      Math.max(origin.x - segmentationBounds.leftX, segmentationBounds.rightX - origin.x),
    );
    torsoRadiusX = Math.max(torsoRadiusX, segHalfWidth);
  }

  // Anterior-posterior chest depth radius (~34% of true shoulder width) gives realistic side volume
  const torsoRadiusZ = trueShoulderWidth * 0.34;
  const collarY = origin.y - trueShoulderWidth * 0.28;
  const hemY = segmentationBounds?.touchesBottom
    ? Math.max(hipCenter.y, origin.y + torsoHeight * 1.08)
    : Math.max(hipCenter.y, origin.y + torsoHeight);

  const shoulderLift = trueShoulderWidth * 0.15;
  const shoulderSeamLeft: Vector3D = {
    x: origin.x - Math.cos(frame.yaw) * torsoRadiusX + upAxis.x * shoulderLift,
    y: origin.y - upAxis.y * shoulderLift,
    z: origin.z - Math.sin(frame.yaw) * torsoRadiusX,
  };
  const shoulderSeamRight: Vector3D = {
    x: origin.x + Math.cos(frame.yaw) * torsoRadiusX + upAxis.x * shoulderLift,
    y: origin.y - upAxis.y * shoulderLift,
    z: origin.z + Math.sin(frame.yaw) * torsoRadiusX,
  };

  const torsoCenter: Vector3D = {
    x: (origin.x + hipCenter.x) / 2,
    y: (origin.y + hemY) / 2,
    z: (origin.z + hipCenter.z) / 2,
  };

  const armRadius = trueShoulderWidth * 0.12;
  const forearmRadius = trueShoulderWidth * 0.105;
  const handRadius = trueShoulderWidth * 0.115;

  const isWristCrossingFrontOfTorso = (wrist: Vector3D, elbow?: Vector3D): boolean => {
    const horizDistFromCenter = Math.abs(wrist.x - torsoCenter.x);
    const insideChestColumn = horizDistFromCenter <= trueShoulderWidth * 0.42;
    const withinTorsoVertical = wrist.y >= collarY && wrist.y <= hemY;
    if (!insideChestColumn || !withinTorsoVertical) return false;
    const bentAcrossOrUp =
      !elbow ||
      Math.abs(wrist.x - elbow.x) >= trueShoulderWidth * 0.18 ||
      wrist.y <= elbow.y + trueShoulderWidth * 0.10;
    if (!bentAcrossOrUp) return false;
    return wrist.z >= -trueShoulderWidth * 0.02;
  };

  const leftUpperArm: Capsule3D | null = frame.elbowLeft
    ? {
        start: frame.shoulderLeft,
        end: frame.elbowLeft,
        radius: armRadius,
        // Upper arms are inside the garment sleeves and must never cut out the shoulder/sleeve
        isInFrontOfTorso: false,
      }
    : null;

  const rightUpperArm: Capsule3D | null = frame.elbowRight
    ? {
        start: frame.shoulderRight,
        end: frame.elbowRight,
        radius: armRadius,
        isInFrontOfTorso: false,
      }
    : null;

  const leftForearm: Capsule3D | null =
    frame.elbowLeft && frame.wristLeft
      ? {
          start: frame.elbowLeft,
          end: frame.wristLeft,
          radius: forearmRadius,
          isInFrontOfTorso: isWristCrossingFrontOfTorso(frame.wristLeft, frame.elbowLeft),
        }
      : null;

  const rightForearm: Capsule3D | null =
    frame.elbowRight && frame.wristRight
      ? {
          start: frame.elbowRight,
          end: frame.wristRight,
          radius: forearmRadius,
          isInFrontOfTorso: isWristCrossingFrontOfTorso(frame.wristRight, frame.elbowRight),
        }
      : null;

  const leftHand: Capsule3D | null = frame.wristLeft
    ? {
        start: frame.wristLeft,
        end: frame.handLeft ?? frame.wristLeft,
        radius: handRadius,
        isInFrontOfTorso: isWristCrossingFrontOfTorso(frame.wristLeft, frame.elbowLeft),
      }
    : null;

  const rightHand: Capsule3D | null = frame.wristRight
    ? {
        start: frame.wristRight,
        end: frame.handRight ?? frame.wristRight,
        radius: handRadius,
        isInFrontOfTorso: isWristCrossingFrontOfTorso(frame.wristRight, frame.elbowRight),
      }
    : null;

  return {
    frame,
    torsoCenter,
    torsoRadiusX,
    torsoRadiusZ,
    torsoHeight: hemY - collarY,
    collarY,
    hemY,
    shoulderSeamLeft,
    shoulderSeamRight,
    leftUpperArm,
    rightUpperArm,
    leftForearm,
    rightForearm,
    leftHand,
    rightHand,
  };
}

export class BodyFrameSmoother {
  private poseSmoother = new PoseSmoother();
  private lastValidFrame: BodyFrame3D | null = null;
  private lastValidTime = 0;
  private preferredLeftIndex: 11 | 12 | undefined = undefined;
  private referenceShoulderRatio = 0.66;

  reset(): void {
    this.poseSmoother.reset();
    this.lastValidFrame = null;
    this.lastValidTime = 0;
    this.preferredLeftIndex = undefined;
  }

  update(
    landmarks: NormalizedLandmark[],
    frameWidth: number,
    frameHeight: number,
    timestampMs: number,
  ): BodyFrame3D | null {
    const smoothedLandmarks = this.poseSmoother.filter(landmarks, timestampMs);
    const next = estimateBodyFrame3D(smoothedLandmarks, frameWidth, frameHeight, {
      preferredLeftIndex: this.preferredLeftIndex,
      referenceShoulderRatio: this.referenceShoulderRatio,
    });

    if (!next || next.confidence < 0.45) {
      if (this.lastValidFrame && timestampMs - this.lastValidTime <= 450) {
        const decay = Math.max(0.2, 1 - (timestampMs - this.lastValidTime) / 500);
        return {
          ...this.lastValidFrame,
          confidence: this.lastValidFrame.confidence * decay,
        };
      }
      this.lastValidFrame = null;
      return null;
    }

    if (Math.abs(next.yaw) < 0.35 && next.confidence >= 0.75) {
      this.preferredLeftIndex = next.leftLandmarkIndex;
      const measuredRatio = next.trueShoulderWidth / Math.max(1, next.torsoHeight);
      if (measuredRatio >= 0.45 && measuredRatio <= 0.95) {
        this.referenceShoulderRatio = this.referenceShoulderRatio * 0.8 + measuredRatio * 0.2;
      }
    }

    if (this.lastValidFrame && timestampMs - this.lastValidTime <= 250) {
      // Prevent sudden single-frame scale jumps (> 35% per frame)
      const prevWidth = this.lastValidFrame.trueShoulderWidth;
      const maxDelta = prevWidth * 0.35;
      const clampedWidth = Math.max(
        prevWidth - maxDelta,
        Math.min(prevWidth + maxDelta, next.trueShoulderWidth),
      );
      next.trueShoulderWidth = prevWidth * 0.25 + clampedWidth * 0.75;
    }

    this.lastValidFrame = next;
    this.lastValidTime = timestampMs;
    return next;
  }
}

export type LiveBodyPostureKind =
  | "standing-still"
  | "turning-sideways"
  | "raising-arms"
  | "crossing-arms";

export type BodyDistanceLevel = "too-close" | "optimal" | "step-back";
export type BodyFramingLevel = "full-torso" | "upper-chest" | "partial";

export interface BodySliceProfile {
  deltoidSpan: number;
  chestWidth: number;
  waistWidth: number;
  hipWidth: number;
  touchesBottom: boolean;
}

export interface CalibratedBodyModel {
  deltoidToShoulderRatio: number;
  chestToShoulderRatio: number;
  waistToShoulderRatio: number;
  hipToShoulderRatio: number;
  torsoAspectRatio: number;
  sampleCount: number;
  adaptationProgress: number;
  isLocked: boolean;
}

export interface LiveBodyDiagnostics {
  posture: LiveBodyPostureKind;
  postureLabel: string;
  wrapStrategy: string;
  distanceLevel: BodyDistanceLevel;
  framingLevel: BodyFramingLevel;
  centerNormX: number;
  centerNormY: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  leftArmElevationDeg: number;
  rightArmElevationDeg: number;
  occlusionActive: boolean;
  occludingLimbs: string[];
  slices: BodySliceProfile;
  calibratedModel: CalibratedBodyModel;
  chestHalfWidth: number;
  waistHalfWidth: number;
  hipHalfWidth: number;
}

export function measureBodySliceProfile(
  frame: BodyFrame3D,
  categories?: Uint8Array | null,
  maskWidth = 0,
  maskHeight = 0,
  frameWidth = 1000,
  frameHeight = 800,
): BodySliceProfile {
  const { origin, shoulderLeft: sl, shoulderRight: sr, trueShoulderWidth, torsoHeight } = frame;
  const fallbackDeltoid = trueShoulderWidth * 1.36;
  const fallbackChest = trueShoulderWidth * 1.28;
  const fallbackWaist = trueShoulderWidth * 1.22;
  const fallbackHip = trueShoulderWidth * 1.26;

  if (
    !categories ||
    maskWidth < 4 ||
    maskHeight < 4 ||
    categories.length !== maskWidth * maskHeight ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    return {
      deltoidSpan: fallbackDeltoid,
      chestWidth: fallbackChest,
      waistWidth: fallbackWaist,
      hipWidth: fallbackHip,
      touchesBottom: false,
    };
  }

  const isBody = (cat: number) => cat === 2 || cat === 4;
  const centerCol = Math.max(0, Math.min(maskWidth - 1, Math.round((origin.x / frameWidth) * maskWidth)));

  const scanBandWidth = (normYStart: number, normYEnd: number, maxRatio: number, minRatio: number): number => {
    const r0 = Math.max(
      0,
      Math.min(maskHeight - 1, Math.round(((origin.y + torsoHeight * normYStart) / frameHeight) * maskHeight)),
    );
    const r1 = Math.max(
      r0,
      Math.min(maskHeight - 1, Math.round(((origin.y + torsoHeight * normYEnd) / frameHeight) * maskHeight)),
    );
    const spans: number[] = [];
    for (let r = r0; r <= r1; r++) {
      const rowOffset = r * maskWidth;
      let leftCol = centerCol;
      while (leftCol > 0 && isBody(categories[rowOffset + leftCol - 1])) leftCol--;
      let rightCol = centerCol;
      while (rightCol < maskWidth - 1 && isBody(categories[rowOffset + rightCol + 1])) rightCol++;
      if (rightCol - leftCol >= 2) {
        const leftX = (leftCol / maskWidth) * frameWidth;
        const rightX = ((rightCol + 1) / maskWidth) * frameWidth;
        // Clamp symmetric half-span so outstretched bare arms do not inflate torso slice width
        const halfLeft = Math.min(trueShoulderWidth * (maxRatio * 0.5), Math.max(origin.x - sl.x, origin.x - leftX));
        const halfRight = Math.min(trueShoulderWidth * (maxRatio * 0.5), Math.max(sr.x - origin.x, rightX - origin.x));
        spans.push(halfLeft + halfRight);
      }
    }
    if (spans.length === 0) return trueShoulderWidth * ((maxRatio + minRatio) * 0.5);
    spans.sort((a, b) => a - b);
    const p35 = spans[Math.floor(spans.length * 0.35)];
    return Math.max(trueShoulderWidth * minRatio, Math.min(trueShoulderWidth * maxRatio, p35));
  };

  const deltoidSpan = scanBandWidth(-0.06, 0.14, 1.44, 1.24);
  const chestWidth = scanBandWidth(0.15, 0.38, 1.38, 1.20);
  const waistWidth = scanBandWidth(0.40, 0.68, 1.34, 1.16);
  const hipWidth = scanBandWidth(0.70, 0.95, 1.38, 1.18);

  let touchesBottom = false;
  for (let r = Math.max(0, maskHeight - 3); r < maskHeight; r++) {
    for (
      let c = Math.max(0, centerCol - Math.round(maskWidth * 0.2));
      c <= Math.min(maskWidth - 1, centerCol + Math.round(maskWidth * 0.2));
      c++
    ) {
      if (isBody(categories[r * maskWidth + c])) {
        touchesBottom = true;
        break;
      }
    }
  }

  return { deltoidSpan, chestWidth, waistWidth, hipWidth, touchesBottom };
}

export class AdaptiveBodyCalibrator {
  private model: CalibratedBodyModel = {
    deltoidToShoulderRatio: 1.34,
    chestToShoulderRatio: 1.28,
    waistToShoulderRatio: 1.22,
    hipToShoulderRatio: 1.26,
    torsoAspectRatio: 0.66,
    sampleCount: 0,
    adaptationProgress: 0,
    isLocked: false,
  };

  reset(): void {
    this.model = {
      deltoidToShoulderRatio: 1.34,
      chestToShoulderRatio: 1.28,
      waistToShoulderRatio: 1.22,
      hipToShoulderRatio: 1.26,
      torsoAspectRatio: 0.66,
      sampleCount: 0,
      adaptationProgress: 0,
      isLocked: false,
    };
  }

  getModel(): CalibratedBodyModel {
    return { ...this.model };
  }

  analyzeAndAdapt(
    frame: BodyFrame3D,
    proxy: BodyProxy3D,
    slices: BodySliceProfile,
    frameWidth: number,
    frameHeight: number,
  ): LiveBodyDiagnostics {
    const { origin, shoulderLeft: sl, shoulderRight: sr, trueShoulderWidth, torsoHeight, yaw, pitch, roll } = frame;

    // Compute left and right upper-arm elevation angles (0 deg = hanging straight down, 90 deg = horizontal T-pose, 180 deg = straight up)
    const computeArmElevationDeg = (shoulder: Vector3D, elbow?: Vector3D): number => {
      if (!elbow) return 18;
      const dx = Math.abs(elbow.x - shoulder.x);
      const dy = elbow.y - shoulder.y; // +dy is downward in screen coords
      const angleFromDownRad = Math.atan2(dx, dy); // 0 when straight down, pi/2 when horizontal, pi when straight up
      return Math.round((angleFromDownRad * 180) / Math.PI);
    };

    const leftArmElevationDeg = computeArmElevationDeg(sl, frame.elbowLeft);
    const rightArmElevationDeg = computeArmElevationDeg(sr, frame.elbowRight);

    const occludingLimbs: string[] = [];
    if (proxy.leftForearm?.isInFrontOfTorso || proxy.leftHand?.isInFrontOfTorso) {
      occludingLimbs.push("Left Forearm/Hand");
    }
    if (proxy.rightForearm?.isInFrontOfTorso || proxy.rightHand?.isInFrontOfTorso) {
      occludingLimbs.push("Right Forearm/Hand");
    }
    const occlusionActive = occludingLimbs.length > 0;

    // Online body model adaptation: update personal body ratios when facing front with unoccluded torso and relaxed arms
    const isFrontalCalibrationPose =
      Math.abs(yaw) <= 0.24 &&
      frame.confidence >= 0.70 &&
      !occlusionActive &&
      leftArmElevationDeg <= 72 &&
      rightArmElevationDeg <= 72;

    if (isFrontalCalibrationPose && trueShoulderWidth > 24) {
      const lr = this.model.sampleCount < 10 ? 0.22 : 0.08;
      const measuredDeltoid = Math.max(1.22, Math.min(1.48, slices.deltoidSpan / trueShoulderWidth));
      const measuredChest = Math.max(1.18, Math.min(1.42, slices.chestWidth / trueShoulderWidth));
      const measuredWaist = Math.max(1.14, Math.min(1.38, slices.waistWidth / trueShoulderWidth));
      const measuredHip = Math.max(1.16, Math.min(1.42, slices.hipWidth / trueShoulderWidth));
      const measuredAspect = Math.max(0.48, Math.min(0.92, trueShoulderWidth / Math.max(1, torsoHeight)));

      this.model.deltoidToShoulderRatio += (measuredDeltoid - this.model.deltoidToShoulderRatio) * lr;
      this.model.chestToShoulderRatio += (measuredChest - this.model.chestToShoulderRatio) * lr;
      this.model.waistToShoulderRatio += (measuredWaist - this.model.waistToShoulderRatio) * lr;
      this.model.hipToShoulderRatio += (measuredHip - this.model.hipToShoulderRatio) * lr;
      this.model.torsoAspectRatio += (measuredAspect - this.model.torsoAspectRatio) * lr;
      this.model.sampleCount += 1;
      this.model.adaptationProgress = Math.min(100, Math.round((this.model.sampleCount / 24) * 100));
      this.model.isLocked = this.model.sampleCount >= 12;
    }

    // Classify the 4 core live body states requested: standing-still, turning-sideways, raising-arms, crossing-arms
    const yawDeg = Math.round((yaw * 180) / Math.PI);
    const pitchDeg = Math.round((pitch * 180) / Math.PI);
    const rollDeg = Math.round((roll * 180) / Math.PI);

    let posture: LiveBodyPostureKind = "standing-still";
    let postureLabel = "Standing Still · Frontal Fit";
    let wrapStrategy = "Multi-slice 3D cylinder wrap locked to calibrated deltoid, chest & waist contours";

    if (occlusionActive) {
      posture = "crossing-arms";
      postureLabel = `Crossing Arms (${occludingLimbs.join(" + ")})`;
      wrapStrategy = "Depth-aware arm segmentation mask + 3D torso lock (sleeves anchored to deltoids)";
    } else if (Math.abs(yawDeg) >= 22 || frame.isSideProfile) {
      posture = "turning-sideways";
      const dir = yawDeg > 0 ? "Right" : "Left";
      postureLabel = `Turning Sideways (${dir} ${Math.abs(yawDeg)}°)`;
      wrapStrategy = "Foreshortening-compensated 3D shell + closed side/back volume rotation";
    } else if (leftArmElevationDeg >= 68 || rightArmElevationDeg >= 68) {
      posture = "raising-arms";
      postureLabel = `Raising Arms (L ${leftArmElevationDeg}° · R ${rightArmElevationDeg}°)`;
      wrapStrategy = "Skeletal shoulder-to-elbow bone skinning + deltoid cap stabilization";
    }

    const shoulderScreenRatio = frame.projectedShoulderWidth / Math.max(1, frameWidth);
    const distanceLevel: BodyDistanceLevel =
      shoulderScreenRatio > 0.52 ? "too-close" : shoulderScreenRatio < 0.16 ? "step-back" : "optimal";

    const framingLevel: BodyFramingLevel =
      frame.hipCenter.y <= frameHeight * 0.94
        ? "full-torso"
        : origin.y <= frameHeight * 0.55
          ? "upper-chest"
          : "partial";

    // Blend live slice contour with online-calibrated body model so turning sideways or crossing arms
    // preserves the user's true calibrated body dimensions without collapsing or inflating
    const frontalWeight = Math.max(0, Math.cos(yaw)) * (occlusionActive ? 0.35 : 0.75);
    const modelChestHalf = trueShoulderWidth * this.model.chestToShoulderRatio * 0.5;
    const modelWaistHalf = trueShoulderWidth * this.model.waistToShoulderRatio * 0.5;
    const modelHipHalf = trueShoulderWidth * this.model.hipToShoulderRatio * 0.5;

    const liveChestHalf = slices.chestWidth * 0.5;
    const liveWaistHalf = slices.waistWidth * 0.5;
    const liveHipHalf = slices.hipWidth * 0.5;

    const chestHalfWidth = modelChestHalf * (1 - frontalWeight) + liveChestHalf * frontalWeight;
    const waistHalfWidth = modelWaistHalf * (1 - frontalWeight) + liveWaistHalf * frontalWeight;
    const hipHalfWidth = modelHipHalf * (1 - frontalWeight) + liveHipHalf * frontalWeight;

    return {
      posture,
      postureLabel,
      wrapStrategy,
      distanceLevel,
      framingLevel,
      centerNormX: Math.round((origin.x / Math.max(1, frameWidth)) * 100),
      centerNormY: Math.round((origin.y / Math.max(1, frameHeight)) * 100),
      yawDeg,
      pitchDeg,
      rollDeg,
      leftArmElevationDeg,
      rightArmElevationDeg,
      occlusionActive,
      occludingLimbs,
      slices,
      calibratedModel: { ...this.model },
      chestHalfWidth,
      waistHalfWidth,
      hipHalfWidth,
    };
  }
}
