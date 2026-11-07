import { describe, expect, it } from "vitest";
import type { NormalizedLandmark } from "./garment";
import {
  AdaptiveBodyCalibrator,
  BodyFrameSmoother,
  constructBodyProxy3D,
  estimateBodyFrame3D,
  measureBodySliceProfile,
} from "./body3d";

function makeBasePose(): NormalizedLandmark[] {
  const pose: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0,
  }));
  // Nose / head reference
  pose[0] = { x: 0.5, y: 0.14, z: -0.04, visibility: 0.98 };
  // Shoulders (facing camera, 0 deg yaw)
  pose[11] = { x: 0.34, y: 0.30, z: 0, visibility: 0.98 };
  pose[12] = { x: 0.66, y: 0.30, z: 0, visibility: 0.98 };
  // Elbows (relaxed at sides)
  pose[13] = { x: 0.26, y: 0.54, z: 0.02, visibility: 0.95 };
  pose[14] = { x: 0.74, y: 0.54, z: 0.02, visibility: 0.95 };
  // Wrists (relaxed at sides)
  pose[15] = { x: 0.24, y: 0.76, z: 0.01, visibility: 0.92 };
  pose[16] = { x: 0.76, y: 0.76, z: 0.01, visibility: 0.92 };
  // Index fingers
  pose[19] = { x: 0.23, y: 0.82, z: 0.01, visibility: 0.9 };
  pose[20] = { x: 0.77, y: 0.82, z: 0.01, visibility: 0.9 };
  // Hips
  pose[23] = { x: 0.39, y: 0.78, z: 0, visibility: 0.92 };
  pose[24] = { x: 0.61, y: 0.78, z: 0, visibility: 0.92 };
  return pose;
}

describe("3D body coordinate system and proxy (Phases 2, 4, 5, 7, 10)", () => {
  it("Scenario 1: facing camera (0 deg yaw) computes orthonormal axes and outer torso proxy covering deltoids and lats", () => {
    const pose = makeBasePose();
    const frame = estimateBodyFrame3D(pose, 1000, 1000);
    expect(frame).not.toBeNull();
    expect(Math.abs(frame!.yaw)).toBeLessThan(0.05);
    expect(frame!.projectedShoulderWidth).toBeCloseTo(320, 0);
    expect(frame!.trueShoulderWidth).toBeGreaterThanOrEqual(320);

    // Orthonormality check: right, up, forward unit vectors
    const dotRU =
      frame!.rightAxis.x * frame!.upAxis.x +
      frame!.rightAxis.y * frame!.upAxis.y +
      frame!.rightAxis.z * frame!.upAxis.z;
    const dotRF =
      frame!.rightAxis.x * frame!.forwardAxis.x +
      frame!.rightAxis.y * frame!.forwardAxis.y +
      frame!.rightAxis.z * frame!.forwardAxis.z;
    expect(Math.abs(dotRU)).toBeLessThan(1e-4);
    expect(Math.abs(dotRF)).toBeLessThan(1e-4);

    const proxy = constructBodyProxy3D(frame!);
    // Outer torso radius must exceed half the skeletal shoulder distance (160px) to cover outer deltoids/lats
    expect(proxy.torsoRadiusX).toBeGreaterThan(195);
    expect(proxy.torsoRadiusZ).toBeGreaterThan(95);
    expect(proxy.leftForearm?.isInFrontOfTorso).toBe(false);
    expect(proxy.rightForearm?.isInFrontOfTorso).toBe(false);
  });

  it("Scenario 2 & 3: turning 30 deg and 60 deg left/right preserves true 3D shoulder span without collapsing into a flat strip", () => {
    const pose0 = makeBasePose();
    const frame0 = estimateBodyFrame3D(pose0, 1000, 1000)!;

    // 30 deg turn: horizontal span cos(30 deg) = 0.866, depth sin(30 deg) = 0.5
    const pose30 = makeBasePose();
    const halfSpan = 0.16;
    pose30[11] = { x: 0.5 - halfSpan * Math.cos(Math.PI / 6), y: 0.30, z: -halfSpan * Math.sin(Math.PI / 6), visibility: 0.98 };
    pose30[12] = { x: 0.5 + halfSpan * Math.cos(Math.PI / 6), y: 0.30, z: halfSpan * Math.sin(Math.PI / 6), visibility: 0.98 };
    const frame30 = estimateBodyFrame3D(pose30, 1000, 1000)!;
    expect(Math.abs(frame30.yaw)).toBeGreaterThan(0.35);
    expect(Math.abs(frame30.yaw)).toBeLessThan(0.7);
    expect(frame30.trueShoulderWidth).toBeGreaterThan(frame0.trueShoulderWidth * 0.88);

    // 60 deg turn: horizontal span cos(60 deg) = 0.5, depth sin(60 deg) = 0.866
    const pose60 = makeBasePose();
    pose60[11] = { x: 0.5 - halfSpan * Math.cos(Math.PI / 3), y: 0.30, z: -halfSpan * Math.sin(Math.PI / 3), visibility: 0.98 };
    pose60[12] = { x: 0.5 + halfSpan * Math.cos(Math.PI / 3), y: 0.30, z: halfSpan * Math.sin(Math.PI / 3), visibility: 0.98 };
    const frame60 = estimateBodyFrame3D(pose60, 1000, 1000)!;
    expect(Math.abs(frame60.yaw)).toBeGreaterThan(0.85);
    // Projected 2D width shrank to 50%, but true 3D shoulder width stays within ~90% of frontal width
    expect(frame60.projectedShoulderWidth).toBeCloseTo(160, 0);
    expect(frame60.trueShoulderWidth).toBeGreaterThan(frame0.trueShoulderWidth * 0.85);
  });

  it("Scenario 4: near 90 deg side profile maintains profile depth and does not flip 180 deg when shoulder X coordinates nearly overlap", () => {
    const smoother = new BodyFrameSmoother();
    const halfSpan = 0.16;

    // Rotate smoothly through 0 deg -> 45 deg -> 85 deg -> 92 deg (slight X crossover jitter)
    const angles = [0, Math.PI / 4, (85 * Math.PI) / 180, (92 * Math.PI) / 180];
    let tick = 0;
    const frames = angles.map((angle) => {
      const pose = makeBasePose();
      pose[11] = { x: 0.5 - halfSpan * Math.cos(angle), y: 0.30, z: -halfSpan * Math.sin(angle), visibility: 0.95 };
      pose[12] = { x: 0.5 + halfSpan * Math.cos(angle), y: 0.30, z: halfSpan * Math.sin(angle), visibility: 0.95 };
      let current = smoother.update(pose, 1000, 1000, ++tick * 33)!;
      for (let step = 0; step < 3; step++) {
        current = smoother.update(pose, 1000, 1000, ++tick * 33)!;
      }
      return current;
    });

    const frame85 = frames[2];
    const frame92 = frames[3];
    expect(frame85.isSideProfile).toBe(true);
    expect(frame92.isSideProfile).toBe(true);
    // Yaw sign must stay consistent (no 180-degree sign flip when cos(92 deg) crosses zero)
    expect(Math.sign(frame85.yaw)).toBe(Math.sign(frame92.yaw));
    expect(Math.abs(frame92.yaw)).toBeGreaterThan(1.1);
    expect(frame92.trueShoulderWidth).toBeGreaterThan(260);
  });

  it("Scenario 5, 6, 7: detects raised arm, crossed arms in front of torso, and hands moving across chest", () => {
    // Scenario 5: Left arm raised high (elbow above shoulder)
    const raisedPose = makeBasePose();
    raisedPose[13] = { x: 0.18, y: 0.18, z: -0.02, visibility: 0.95 };
    raisedPose[15] = { x: 0.14, y: 0.08, z: -0.04, visibility: 0.95 };
    const raisedProxy = constructBodyProxy3D(estimateBodyFrame3D(raisedPose, 1000, 1000)!);
    expect(raisedProxy.leftUpperArm).not.toBeNull();
    expect(raisedProxy.leftUpperArm!.end.y).toBeLessThan(raisedProxy.leftUpperArm!.start.y);

    // Scenario 6 & 7: Arms crossed in front of torso / hands moving across chest
    const crossedPose = makeBasePose();
    crossedPose[13] = { x: 0.36, y: 0.52, z: -0.14, visibility: 0.96 };
    crossedPose[15] = { x: 0.58, y: 0.48, z: -0.18, visibility: 0.96 };
    crossedPose[19] = { x: 0.63, y: 0.47, z: -0.19, visibility: 0.96 };
    const crossedProxy = constructBodyProxy3D(estimateBodyFrame3D(crossedPose, 1000, 1000)!);
    expect(crossedProxy.leftForearm?.isInFrontOfTorso).toBe(true);
    expect(crossedProxy.leftHand?.isInFrontOfTorso).toBe(true);
  });

  it("Scenario 8: scales body proxy proportionally when user moves closer or farther from camera", () => {
    const farPose = makeBasePose();
    farPose[11] = { x: 0.40, y: 0.35, z: 0, visibility: 0.98 };
    farPose[12] = { x: 0.60, y: 0.35, z: 0, visibility: 0.98 };
    farPose[23] = { x: 0.43, y: 0.65, z: 0, visibility: 0.95 };
    farPose[24] = { x: 0.57, y: 0.65, z: 0, visibility: 0.95 };

    const closePose = makeBasePose();
    closePose[11] = { x: 0.25, y: 0.25, z: 0, visibility: 0.98 };
    closePose[12] = { x: 0.75, y: 0.25, z: 0, visibility: 0.98 };
    closePose[23] = { x: 0.32, y: 0.88, z: 0, visibility: 0.95 };
    closePose[24] = { x: 0.68, y: 0.88, z: 0, visibility: 0.95 };

    const farProxy = constructBodyProxy3D(estimateBodyFrame3D(farPose, 1000, 1000)!);
    const closeProxy = constructBodyProxy3D(estimateBodyFrame3D(closePose, 1000, 1000)!);

    expect(closeProxy.torsoRadiusX / farProxy.torsoRadiusX).toBeCloseTo(2.5, 1);
    expect(closeProxy.torsoHeight / farProxy.torsoHeight).toBeGreaterThan(2.0);
  });

  it("Scenario 9 & 10: holds last valid state briefly without scale jumps when confidence drops or user partially leaves frame", () => {
    const smoother = new BodyFrameSmoother();
    const validPose = makeBasePose();
    const first = smoother.update(validPose, 1000, 1000, 100)!;
    expect(first.confidence).toBeGreaterThan(0.8);

    // Sudden single-frame confidence drop / partial frame exit at t = 133ms
    const droppedPose = makeBasePose();
    droppedPose[11] = { x: -0.2, y: 0.3, z: 0, visibility: 0.1 };
    droppedPose[12] = { x: 0.95, y: 0.3, z: 0, visibility: 0.1 };
    const held = smoother.update(droppedPose, 1000, 1000, 133);
    expect(held).not.toBeNull();
    // Must hold previous valid shoulder width without jumping to the corrupted 1150px span
    expect(held!.trueShoulderWidth).toBeCloseTo(first.trueShoulderWidth, 1);
    expect(held!.confidence).toBeLessThan(first.confidence);

    // After prolonged tracking loss (> 500ms), returns null cleanly so UI can prompt framing
    const expired = smoother.update(droppedPose, 1000, 1000, 750);
    expect(expired).toBeNull();
  });

  it("online AdaptiveBodyCalibrator learns personal body slice ratios and classifies all 4 core live body states", () => {
    const calibrator = new AdaptiveBodyCalibrator();
    const maskW = 40;
    const maskH = 40;
    const categories = new Uint8Array(maskW * maskH).fill(0);
    // Populate segmented torso silhouette from col 10..29 (25%..75% width)
    for (let r = 8; r < 38; r++) {
      for (let c = 10; c <= 29; c++) {
        categories[r * maskW + c] = 2;
      }
    }

    // 1. Standing still: feed 14 frontal frames so online calibration locks onto the user's body
    const basePose = makeBasePose();
    const baseFrame = estimateBodyFrame3D(basePose, 1000, 1000)!;
    const baseProxy = constructBodyProxy3D(baseFrame);
    const baseSlices = measureBodySliceProfile(baseFrame, categories, maskW, maskH, 1000, 1000);
    let standingDiag = calibrator.analyzeAndAdapt(baseFrame, baseProxy, baseSlices, 1000, 1000);
    for (let i = 0; i < 14; i++) {
      standingDiag = calibrator.analyzeAndAdapt(baseFrame, baseProxy, baseSlices, 1000, 1000);
    }
    expect(standingDiag.posture).toBe("standing-still");
    expect(standingDiag.calibratedModel.isLocked).toBe(true);
    expect(standingDiag.chestHalfWidth).toBeGreaterThan(190);

    // 2. Turning sideways (45 deg): classifies turning-sideways and preserves calibrated chest width
    const sidePose = makeBasePose();
    sidePose[11] = { x: 0.39, y: 0.30, z: -0.12, visibility: 0.98 };
    sidePose[12] = { x: 0.61, y: 0.30, z: 0.12, visibility: 0.98 };
    const sideFrame = estimateBodyFrame3D(sidePose, 1000, 1000)!;
    const sideDiag = calibrator.analyzeAndAdapt(
      sideFrame,
      constructBodyProxy3D(sideFrame),
      measureBodySliceProfile(sideFrame, categories, maskW, maskH, 1000, 1000),
      1000,
      1000,
    );
    expect(sideDiag.posture).toBe("turning-sideways");
    expect(sideDiag.chestHalfWidth).toBeGreaterThan(185);

    // 3. Raising arms: classifies raising-arms and reports arm elevation angle >= 90 deg
    const raisedPose = makeBasePose();
    raisedPose[13] = { x: 0.14, y: 0.22, z: 0, visibility: 0.96 };
    const raisedFrame = estimateBodyFrame3D(raisedPose, 1000, 1000)!;
    const raisedDiag = calibrator.analyzeAndAdapt(
      raisedFrame,
      constructBodyProxy3D(raisedFrame),
      baseSlices,
      1000,
      1000,
    );
    expect(raisedDiag.posture).toBe("raising-arms");
    expect(raisedDiag.leftArmElevationDeg).toBeGreaterThan(90);

    // 4. Crossing arms: classifies crossing-arms and reports active foreground limb occlusion
    const crossedPose = makeBasePose();
    crossedPose[13] = { x: 0.36, y: 0.52, z: -0.14, visibility: 0.96 };
    crossedPose[15] = { x: 0.58, y: 0.48, z: -0.18, visibility: 0.96 };
    const crossedFrame = estimateBodyFrame3D(crossedPose, 1000, 1000)!;
    const crossedDiag = calibrator.analyzeAndAdapt(
      crossedFrame,
      constructBodyProxy3D(crossedFrame),
      baseSlices,
      1000,
      1000,
    );
    expect(crossedDiag.posture).toBe("crossing-arms");
    expect(crossedDiag.occlusionActive).toBe(true);
  });
});
