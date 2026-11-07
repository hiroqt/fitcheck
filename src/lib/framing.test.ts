import { describe, expect, it } from "vitest";
import { getFramingStatus } from "./framing";
import type { NormalizedLandmark } from "./garment";

const pose = (overrides: Record<number, Partial<NormalizedLandmark>>) => {
  const p: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  for (const [i, v] of Object.entries(overrides)) p[Number(i)] = { x: 0.5, y: 0.5, visibility: 1, ...v };
  return p;
};

describe("framing guide", () => {
  it("asks the user to appear when no pose is detected", () => {
    expect(getFramingStatus(null)).toBe("no-person");
    expect(getFramingStatus(pose({}))).toBe("no-person");
  });

  it("asks to step back when shoulders fill too much of the frame", () => {
    expect(getFramingStatus(pose({ 0: { y: 0.2 }, 11: { x: 0.85, y: 0.7 }, 12: { x: 0.15, y: 0.7 } }))).toBe("step-back");
  });

  it("asks to come closer when shoulders are tiny", () => {
    expect(getFramingStatus(pose({ 0: { y: 0.3 }, 11: { x: 0.55, y: 0.4 }, 12: { x: 0.45, y: 0.4 } }))).toBe("come-closer");
  });

  it("asks to center when the body is off to one side", () => {
    expect(getFramingStatus(pose({ 0: { x: 0.15, y: 0.2 }, 11: { x: 0.3, y: 0.38 }, 12: { x: 0.02, y: 0.38 } }))).toBe("center");
  });

  it("is ready for a centered head-and-shoulders framing", () => {
    expect(getFramingStatus(pose({ 0: { y: 0.2 }, 11: { x: 0.65, y: 0.38 }, 12: { x: 0.35, y: 0.38 } }))).toBe("ready");
  });
});
