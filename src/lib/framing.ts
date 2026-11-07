import type { NormalizedLandmark } from "./garment";

export type FramingStatus = "no-person" | "step-back" | "come-closer" | "center" | "ready";

export const FRAMING_PROMPTS: Record<FramingStatus, string> = {
  "no-person": "Step into frame",
  "step-back": "Step back",
  "come-closer": "Move closer",
  center: "Center yourself",
  ready: "Locked & tracking",
};

function isVisible(landmark: NormalizedLandmark | undefined, minConfidence = 0.5): landmark is NormalizedLandmark {
  return Boolean(
    landmark &&
      Number.isFinite(landmark.x) &&
      Number.isFinite(landmark.y) &&
      (landmark.visibility ?? landmark.presence ?? 1) >= minConfidence,
  );
}

export function getFramingStatus(landmarks: NormalizedLandmark[] | null | undefined): FramingStatus {
  if (!landmarks || landmarks.length < 13) return "no-person";
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  if (!isVisible(leftShoulder) || !isVisible(rightShoulder)) {
    return "no-person";
  }

  const shoulderWidth = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y);
  const centerX = (leftShoulder.x + rightShoulder.x) / 2;
  const centerY = (leftShoulder.y + rightShoulder.y) / 2;
  const nose = landmarks[0];

  if (shoulderWidth > 0.52 || centerY > 0.62 || (isVisible(nose, 0.4) && nose.y < 0.05)) {
    return "step-back";
  }
  if (shoulderWidth < 0.18) {
    return "come-closer";
  }
  if (Math.abs(centerX - 0.5) > 0.22) {
    return "center";
  }
  return "ready";
}
