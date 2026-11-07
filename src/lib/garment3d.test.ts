import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyGarment3DTransform,
  buildDrapedGarment3DGroupFromCanvas,
  buildGarment3DGroupFromGlb,
  computeGarment3DTransform,
  createGarmentGlbBuffer,
  fitGarmentDepthToBodyProxy,
  GarmentRenderer3D,
  syncGarmentOccludingCapsules,
  updateGeneratedTorsoFit,
  validateGlbBuffer,
  validateGlbFile,
} from "./garment3d";
import type { GarmentPlacement, NormalizedLandmark } from "./garment";
import { constructBodyProxy3D, estimateBodyFrame3D } from "./body3d";

describe("3D GLB validation and generation", () => {
  it("accepts valid .glb file metadata and rejects invalid extensions or oversized files", () => {
    expect(validateGlbFile({ name: "jacket.glb", type: "model/gltf-binary", size: 2048 })).toBeNull();
    expect(validateGlbFile({ name: "shirt.GLB", type: "", size: 4096 })).toBeNull();
    expect(validateGlbFile({ name: "shirt.obj", type: "text/plain", size: 1024 })).toContain(".glb");
    expect(validateGlbFile({ name: "empty.glb", type: "model/gltf-binary", size: 0 })).toContain("empty");
    expect(validateGlbFile({ name: "huge.glb", type: "model/gltf-binary", size: 16 * 1024 * 1024 })).toContain("15 MB");
  });

  it("validates binary GLB headers and rejects corrupted or external-URI GLB payloads", () => {
    const validGlb = createGarmentGlbBuffer("soft-tee");
    expect(validateGlbBuffer(validGlb)).toBeNull();

    const tooShort = new ArrayBuffer(12);
    expect(validateGlbBuffer(tooShort)).toContain("valid binary GLB");

    // Craft a GLB with an external buffer URI to verify privacy/SSRF rejection
    const evilJson = JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ uri: "https://example.com/leak.bin", byteLength: 16 }],
    });
    const jsonBytes = new TextEncoder().encode(evilJson.padEnd(Math.ceil(evilJson.length / 4) * 4, " "));
    const evilGlb = new ArrayBuffer(20 + jsonBytes.byteLength);
    const view = new DataView(evilGlb);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, evilGlb.byteLength, true);
    view.setUint32(12, jsonBytes.byteLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(evilGlb, 20).set(jsonBytes);

    expect(validateGlbBuffer(evilGlb)).toContain("external");
  });

  it("parses generated .glb garment presets into Three.js groups with Torso, SleeveLeft, and SleeveRight nodes", async () => {
    for (const preset of ["soft-tee", "denim-jacket", "linen-shirt"] as const) {
      const buffer = createGarmentGlbBuffer(preset);
      const group = await buildGarment3DGroupFromGlb(buffer);
      expect(group.getObjectByName("Torso")).toBeDefined();
      expect(group.getObjectByName("SleeveLeft")).toBeDefined();
      expect(group.getObjectByName("SleeveRight")).toBeDefined();
    }
  });


  it("maps 2D/3D pose landmarks to 3D torso position, scale, yaw, and articulated sleeve rotations", async () => {
    const placement: GarmentPlacement = {
      shoulderLeft: { x: 350, y: 260 },
      shoulderRight: { x: 650, y: 260 },
      hipLeft: { x: 380, y: 620 },
      hipRight: { x: 620, y: 620 },
      elbowLeft: { x: 250, y: 400 },   // angled down-left
      elbowRight: { x: 780, y: 180 },  // raised up-right
      torsoRotationY: -0.28,
    };

    const tee = await buildGarment3DGroupFromGlb(createGarmentGlbBuffer("soft-tee"));
    const bounds = new THREE.Box3().setFromObject(tee);
    const frontPlacement = { ...placement, torsoRotationY: 0 };
    const fitTransform = computeGarment3DTransform(frontPlacement, 1000, 800, bounds);
    applyGarment3DTransform(tee, fitTransform);
    tee.updateMatrixWorld(true);
    const fittedBounds = new THREE.Box3().setFromObject(tee.getObjectByName("Torso")!);
    expect(fittedBounds.max.y).toBeCloseTo(400 - 260 + 300 * 0.26, 1);
    expect(fittedBounds.min.y).toBeCloseTo(400 - 620, 1);
    expect(fitTransform.scale.x).toBeLessThan(300);

    const transform = computeGarment3DTransform(placement, 1000, 800, bounds);
    expect(transform.position.x).toBeCloseTo(0);
    expect(transform.rotationY).toBeCloseTo(-0.28);
    // Raised right elbow should rotate SleeveRight upward relative to lowered SleeveLeft
    expect(transform.rightSleeveAngleZ).toBeGreaterThan(0.2);

    const contourAngles = computeGarment3DTransform({
      ...frontPlacement,
      elbowLeft: undefined,
      elbowRight: undefined,
      segArmAngleLeft: 1.2,
      segArmAngleRight: 1.25,
    }, 1000, 800, bounds);
    expect(contourAngles.leftSleeveAngleZ).toBeCloseTo(1.2);
    expect(contourAngles.rightSleeveAngleZ).toBeCloseTo(-1.25);

    const group = await buildGarment3DGroupFromGlb(createGarmentGlbBuffer("denim-jacket"));
    applyGarment3DTransform(group, transform);
    expect(group.rotation.y).toBeCloseTo(-0.28);
    expect(group.getObjectByName("SleeveRight")!.rotation.z).toBeCloseTo(transform.rightSleeveAngleZ);
  });

  it("fits the generated torso loops around measured chest, waist, and hip widths", async () => {
    const group = await buildGarment3DGroupFromGlb(createGarmentGlbBuffer("soft-tee"));
    const placement: GarmentPlacement = {
      shoulderLeft: { x: 350, y: 240 },
      shoulderRight: { x: 650, y: 240 },
      hipLeft: { x: 390, y: 620 },
      hipRight: { x: 610, y: 620 },
      chestHalfWidth: 145,
      waistHalfWidth: 120,
      hipHalfWidth: 105,
    };
    const transform = computeGarment3DTransform(placement, 1000, 800, new THREE.Box3().setFromObject(group));
    const torso = group.getObjectByName("Torso") as THREE.Mesh;
    const base = Float32Array.from(torso.geometry.attributes.position.array as ArrayLike<number>);
    applyGarment3DTransform(group, transform);
    expect(updateGeneratedTorsoFit(group, placement, transform, base)).toBe(true);

    const fitted = torso.geometry.attributes.position;
    const chestRingRadius = Math.max(...Array.from({ length: 33 }, (_, segment) => Math.abs(fitted.getX(3 * 33 + segment)))) * transform.scale.x;
    const waistRingRadius = Math.max(...Array.from({ length: 33 }, (_, segment) => Math.abs(fitted.getX(5 * 33 + segment)))) * transform.scale.x;
    expect(chestRingRadius).toBeCloseTo(145 + 300 * 0.035, 2);
    expect(waistRingRadius).toBeCloseTo(120 + 300 * 0.035, 2);
  });

  it("uses segmented torso contours to shape the shell rings and follow an off-center waist", async () => {
    const group = await buildGarment3DGroupFromGlb(createGarmentGlbBuffer("soft-tee"));
    const placement: GarmentPlacement = {
      shoulderLeft: { x: 350, y: 240 },
      shoulderRight: { x: 650, y: 240 },
      hipLeft: { x: 390, y: 620 },
      hipRight: { x: 610, y: 620 },
      chestHalfWidth: 145,
      waistHalfWidth: 120,
      hipHalfWidth: 105,
      segRowLeftX: new Array(33).fill(385),
      segRowRightX: new Array(33).fill(625),
    };
    const transform = computeGarment3DTransform(placement, 1000, 800, new THREE.Box3().setFromObject(group));
    const torso = group.getObjectByName("Torso") as THREE.Mesh;
    const base = Float32Array.from(torso.geometry.attributes.position.array as ArrayLike<number>);
    applyGarment3DTransform(group, transform);
    expect(updateGeneratedTorsoFit(group, placement, transform, base)).toBe(true);

    const fitted = torso.geometry.attributes.position;
    const chestRingX = Array.from({ length: 33 }, (_, segment) => fitted.getX(3 * 33 + segment));
    const chestCenterX = (chestRingX.reduce((sum, x) => sum + x, 0) / chestRingX.length) * transform.scale.x;
    const chestHalfWidth = ((Math.max(...chestRingX) - Math.min(...chestRingX)) / 2) * transform.scale.x;
    const centeredGroup = await buildGarment3DGroupFromGlb(createGarmentGlbBuffer("soft-tee"));
    const centeredTorso = centeredGroup.getObjectByName("Torso") as THREE.Mesh;
    const centeredBase = Float32Array.from(centeredTorso.geometry.attributes.position.array as ArrayLike<number>);
    applyGarment3DTransform(centeredGroup, transform);
    updateGeneratedTorsoFit(centeredGroup, { ...placement, segRowLeftX: undefined, segRowRightX: undefined }, transform, centeredBase);
    const centeredRingX = Array.from({ length: 33 }, (_, segment) => centeredTorso.geometry.attributes.position.getX(3 * 33 + segment));
    const centeredMeanX = (centeredRingX.reduce((sum, x) => sum + x, 0) / centeredRingX.length) * transform.scale.x;
    const centeredHalfWidth = ((Math.max(...centeredRingX) - Math.min(...centeredRingX)) / 2) * transform.scale.x;
    expect(chestCenterX - centeredMeanX).toBeGreaterThan(3);
    expect(chestCenterX - centeredMeanX).toBeLessThan(4.5);
    expect(chestHalfWidth).toBeLessThan(centeredHalfWidth);
    expect(chestHalfWidth).toBeGreaterThan(120);
  });

  it("fits the garment shell outside the tracked torso depth so the wearer sits inside the wrap", () => {
    const pose: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0,
    }));
    pose[11] = { x: 0.34, y: 0.28, z: 0, visibility: 1 };
    pose[12] = { x: 0.66, y: 0.28, z: 0, visibility: 1 };
    pose[23] = { x: 0.39, y: 0.76, z: 0, visibility: 1 };
    pose[24] = { x: 0.61, y: 0.76, z: 0, visibility: 1 };
    const proxy = constructBodyProxy3D(estimateBodyFrame3D(pose, 1000, 800)!);
    const garment = buildDrapedGarment3DGroupFromCanvas({ width: 480, height: 560 } as HTMLCanvasElement);
    const torso = garment.getObjectByName("Torso") as THREE.Mesh;
    const localDepth = Math.max(...Array.from({ length: torso.geometry.attributes.position.count }, (_, index) =>
      Math.abs(torso.geometry.attributes.position.getZ(index))));

    expect(fitGarmentDepthToBodyProxy(garment, proxy)).toBe(true);
    expect(garment.scale.z * localDepth).toBeCloseTo(proxy.torsoRadiusZ + proxy.frame.trueShoulderWidth * 0.025, 5);
    expect(garment.position.z).toBeCloseTo(proxy.torsoCenter.z, 5);
  });

  it("maps a 2D garment photo onto a torso tube with separate sleeve tubes", () => {
    const mockCanvas = { width: 480, height: 560 } as unknown as HTMLCanvasElement;
    const draped = buildDrapedGarment3DGroupFromCanvas(mockCanvas, 0.48, 0.5, 0.08);
    const torsoMesh = draped.getObjectByName("Torso") as THREE.Mesh;
    expect(torsoMesh).toBeDefined();
    expect(draped.getObjectByName("SleeveLeft")).toBeDefined();
    expect(draped.getObjectByName("SleeveRight")).toBeDefined();
    expect(torsoMesh.geometry.attributes.uv).toBeDefined();
    expect(torsoMesh.geometry.groups).toHaveLength(2);
    expect(draped.userData.fitcheckRasterGarment).toBe(true);
    expect(draped.userData.fitcheckTextureFlipY).toBe(true);
    expect(draped.userData.fitcheckSourceTopV).toBe(1);
    expect(draped.userData.fitcheckSourceBottomV).toBe(0);
    expect(draped.userData.fitcheckTextureMapping).toContain("front projection");
    const torsoUv = torsoMesh.geometry.attributes.uv;
    expect(torsoUv.getY(0)).toBeCloseTo(1);
    expect(torsoUv.getY(6 * 33)).toBeCloseTo(0);
    const torsoMaterials = torsoMesh.material as THREE.Material[];
    expect((torsoMaterials[0] as THREE.MeshStandardMaterial).map?.flipY).toBe(true);
    for (const sleeveName of ["SleeveLeft", "SleeveRight"]) {
      const sleeve = draped.getObjectByName(sleeveName)!.children[0] as THREE.Mesh;
      const sleeveUv = sleeve.geometry.attributes.uv;
      const ringStride = 33;
      expect(sleeve.geometry.attributes.position.count).toBe(5 * ringStride);
      expect(sleeveUv.getX(0)).toBeCloseTo(1);
      expect(sleeveUv.getX(16)).toBeCloseTo(0);
      expect(sleeveUv.getY(0)).toBeCloseTo(1);
      expect(sleeveUv.getY(ringStride)).toBeLessThan(sleeveUv.getY(0));
    }
    draped.updateMatrixWorld(true);
    const torsoBounds = new THREE.Box3().setFromObject(torsoMesh);
    const leftSleeveBounds = new THREE.Box3().setFromObject(draped.getObjectByName("LeftSleeveSurface")!);
    expect(leftSleeveBounds.max.x).toBeGreaterThan(torsoBounds.min.x);
    expect(leftSleeveBounds.min.x).toBeLessThan(torsoBounds.min.x);

    const placement: GarmentPlacement = {
      shoulderLeft: { x: 350, y: 240 },
      shoulderRight: { x: 650, y: 240 },
      hipLeft: { x: 380, y: 620 },
      hipRight: { x: 620, y: 620 },
      elbowLeft: { x: 240, y: 380 },
      elbowRight: { x: 780, y: 200 },
      torsoRotationY: -0.2,
    };

    const bounds = new THREE.Box3().setFromObject(draped);
    const transform = computeGarment3DTransform(placement, 1000, 800, bounds);
    const base = Float32Array.from(torsoMesh.geometry.attributes.position.array as ArrayLike<number>);
    applyGarment3DTransform(draped, transform);
    expect(updateGeneratedTorsoFit(draped, placement, transform, base)).toBe(true);
    draped.updateMatrixWorld(true);
    const fittedBounds = new THREE.Box3().setFromObject(draped);
    // In 3D orthographic space (+Y is up, shoulder line is at y = 400 - 240 = +160),
    // the top of the collar must rise well above +160 (above the shoulder line, toward the neck)
    expect(fittedBounds.max.y).toBeGreaterThan(160 + 60);
    // And horizontal span must cover the full outer chest and extended arms (> 300 * 1.4)
    expect(fittedBounds.max.x - fittedBounds.min.x).toBeGreaterThan(420);

    const renderer = new GarmentRenderer3D();
    renderer.setGarmentGroup(draped);
    renderer.releaseWebGLContext();
    renderer.dispose();
  });

  it("maintains a body-fitted tube profile at 60-88 degree side views", () => {
    const mockCanvas = { width: 480, height: 560 } as unknown as HTMLCanvasElement;
    const draped = buildDrapedGarment3DGroupFromCanvas(mockCanvas, 0.48, 0.5, 0.08);
    expect(draped.getObjectByName("Torso")).toBeDefined();

    // Near 85-degree side profile: 2D shoulder X projection is narrow (60px), but torsoRotationY is 1.45 rad
    const sidePlacement: GarmentPlacement = {
      shoulderLeft: { x: 470, y: 240 },
      shoulderRight: { x: 530, y: 240 },
      hipLeft: { x: 475, y: 620 },
      hipRight: { x: 525, y: 620 },
      torsoRotationY: 1.45,
    };

    const bounds = new THREE.Box3().setFromObject(draped);
    const transform = computeGarment3DTransform(sidePlacement, 1000, 800, bounds);
    const torso = draped.getObjectByName("Torso") as THREE.Mesh;
    const base = Float32Array.from(torso.geometry.attributes.position.array as ArrayLike<number>);
    applyGarment3DTransform(draped, transform);
    updateGeneratedTorsoFit(draped, sidePlacement, transform, base);
    draped.updateMatrixWorld(true);
    const fittedBounds = new THREE.Box3().setFromObject(draped);
    // Even when 2D shoulder X is only 60px apart, the 3D closed side profile maintains real chest depth width (> 170px)
    expect(fittedBounds.max.x - fittedBounds.min.x).toBeGreaterThan(150);
    expect(fittedBounds.max.z - fittedBounds.min.z).toBeGreaterThan(140);
  });

  it("creates 3D depth-buffer occluder capsules for forearms and hands in front of the torso", () => {
    const pose: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0,
    }));
    pose[11] = { x: 0.34, y: 0.30, z: 0, visibility: 0.98 };
    pose[12] = { x: 0.66, y: 0.30, z: 0, visibility: 0.98 };
    pose[23] = { x: 0.39, y: 0.78, z: 0, visibility: 0.92 };
    pose[24] = { x: 0.61, y: 0.78, z: 0, visibility: 0.92 };
    // Crossed left forearm and hand in front of chest (z = -0.18 in MP -> +180 in 3D)
    pose[13] = { x: 0.36, y: 0.52, z: -0.14, visibility: 0.96 };
    pose[15] = { x: 0.58, y: 0.48, z: -0.18, visibility: 0.96 };
    pose[19] = { x: 0.63, y: 0.47, z: -0.19, visibility: 0.96 };

    const frame = estimateBodyFrame3D(pose, 1000, 800)!;
    const proxy = constructBodyProxy3D(frame);
    const occluderGroup = syncGarmentOccludingCapsules(proxy, 1000, 800, true);
    expect(occluderGroup.children.length).toBeGreaterThanOrEqual(2);
    const activeCapsules = occluderGroup.children.filter((c) => c.visible);
    expect(activeCapsules.length).toBeGreaterThanOrEqual(2);
  });
});
