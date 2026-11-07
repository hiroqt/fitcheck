import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  getOrComputeGarmentSilhouette,
  type GarmentPlacement,
  type GarmentSilhouetteProfile,
} from "./garment.ts";
import type { BodyProxy3D, Capsule3D } from "./body3d.ts";

export const MAX_GLB_BYTES = 15 * 1024 * 1024;
const MAX_GLB_TEXTURE_PIXELS = 4096 * 4096;
const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_JSON_CHUNK = 0x4e4f534a; // "JSON"
const GLB_BIN_CHUNK = 0x004e4942; // "BIN\0"
const GLB_TEXTURE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const JPEG_START_OF_FRAME_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const MAX_GLB_TEXTURES = 64;

export type Garment3DPreset = "soft-tee" | "denim-jacket" | "linen-shirt";

export interface Garment3DTransform {
  position: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  rotationZ: number;
  rotationY: number;
  leftSleeveAngleZ: number;
  rightSleeveAngleZ: number;
}

export interface DebugRenderOptions {
  showWireframe?: boolean;
  showAxes?: boolean;
  showBodyProxy?: boolean;
  showOccluders?: boolean;
  bodyProxy?: BodyProxy3D | null;
}

export function validateGlbFile(file: Pick<File, "name" | "type" | "size">): string | null {
  const isGlbName = file.name.toLowerCase().endsWith(".glb");
  const allowedMime = file.type === "" || file.type === "model/gltf-binary" || file.type === "application/octet-stream";
  if (!isGlbName || !allowedMime) {
    return "Choose a binary .glb 3D garment model (or a PNG, JPEG, or WebP image).";
  }
  if (file.size === 0) return "That 3D model file is empty.";
  if (file.size > MAX_GLB_BYTES) return "Choose a .glb model smaller than 15 MB.";
  return null;
}

export function validateGlbBuffer(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < 20) {
    return "File is not a valid binary GLB model.";
  }
  if (buffer.byteLength > MAX_GLB_BYTES) {
    return "Choose a .glb model smaller than 15 MB.";
  }
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const totalLength = view.getUint32(8, true);
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);

  if (magic !== GLB_MAGIC || version !== 2 || totalLength !== buffer.byteLength || jsonChunkType !== GLB_JSON_CHUNK) {
    return "File is not a valid binary GLB 2.0 model.";
  }
  if (20 + jsonChunkLength > buffer.byteLength || jsonChunkLength === 0) {
    return "Corrupted GLB chunk header.";
  }

  let gltfJson: {
    asset?: { version?: string };
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string; bufferView?: number; mimeType?: string }>;
    bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength?: number }>;
    textures?: Array<{ source?: number; sampler?: number; extensions?: { KHR_texture_basisu?: { source?: number } } }>;
  };
  try {
    const jsonText = new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLength));
    gltfJson = JSON.parse(jsonText) as typeof gltfJson;
  } catch {
    return "GLB JSON header could not be parsed.";
  }

  if (!gltfJson?.asset?.version?.startsWith("2.")) {
    return "Unsupported glTF asset version; glTF 2.0 is required.";
  }

  const hasExternalUri = [...(gltfJson.buffers ?? []), ...(gltfJson.images ?? [])].some(
    (entry) => typeof entry.uri === "string" && entry.uri.trim().length > 0 && !entry.uri.startsWith("data:"),
  );
  if (hasExternalUri) {
    return "Rejected GLB with external buffer or texture URI to keep processing strictly local.";
  }

  const binChunkOffset = 20 + jsonChunkLength;
  let binOffset = -1;
  let binLength = 0;
  for (let offset = binChunkOffset; offset + 8 <= buffer.byteLength;) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    if (offset + 8 + chunkLength > buffer.byteLength) return "Corrupted GLB chunk header.";
    if (chunkType === GLB_BIN_CHUNK) {
      binOffset = offset + 8;
      binLength = chunkLength;
      break;
    }
    offset += 8 + chunkLength;
  }

  const imagePixels: number[] = [];
  const imageCacheIds: number[] = [];
  const uriCacheIds = new Map<string, number>();
  const bufferViewCacheIds = new Map<number, number>();
  let nextImageCacheId = 0;
  for (const image of gltfJson.images ?? []) {
    let imageBytes: Uint8Array | undefined;
    let mimeType = image.mimeType;
    if (image.uri?.startsWith("data:")) {
      const comma = image.uri.indexOf(",");
      const header = comma >= 0 ? image.uri.slice(5, comma) : "";
      if (!header.endsWith(";base64")) return "GLB textures must use a supported base64 image.";
      mimeType = header.slice(0, -7).toLowerCase();
      if (!GLB_TEXTURE_MIME_TYPES.has(mimeType)) {
        return "GLB textures must be PNG, JPEG, or WebP.";
      }
      try {
        const decoded = atob(image.uri.slice(comma + 1));
        imageBytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      } catch {
        return "GLB texture data could not be decoded.";
      }
    } else if (image.bufferView !== undefined) {
      const bufferView = gltfJson.bufferViews?.[image.bufferView];
      const byteOffset = bufferView?.byteOffset ?? 0;
      const byteLength = bufferView?.byteLength ?? 0;
      if (
        !bufferView ||
        (bufferView.buffer !== undefined && bufferView.buffer !== 0) ||
        binOffset < 0 ||
        byteLength <= 0 ||
        byteOffset + byteLength > binLength
      ) {
        return "GLB texture buffer is invalid.";
      }
      imageBytes = new Uint8Array(buffer, binOffset + byteOffset, byteLength);
    } else {
      return "GLB textures must be embedded in the model.";
    }

    const dimensions = imageBytes && getEmbeddedImageDimensions(imageBytes, mimeType);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
      return "GLB contains an unsupported or invalid embedded texture.";
    }
    imagePixels.push(dimensions.width * dimensions.height);
    if (image.uri !== undefined) {
      let id = uriCacheIds.get(image.uri);
      if (id === undefined) {
        id = nextImageCacheId++;
        uriCacheIds.set(image.uri, id);
      }
      imageCacheIds.push(id);
    } else {
      const bufferView = image.bufferView!;
      let id = bufferViewCacheIds.get(bufferView);
      if (id === undefined) {
        id = nextImageCacheId++;
        bufferViewCacheIds.set(bufferView, id);
      }
      imageCacheIds.push(id);
    }
  }

  const textures = gltfJson.textures ?? [];
  if (textures.length > MAX_GLB_TEXTURES) return "Choose a GLB with no more than 64 textures.";
  let totalTexturePixels = 0;
  const textureCacheKeys = new Set<string>();
  for (const texture of textures) {
    const imageIndex = texture.source ?? texture.extensions?.KHR_texture_basisu?.source;
    if (imageIndex === undefined || imagePixels[imageIndex] === undefined) {
      return "GLB texture references an invalid embedded image.";
    }
    const cacheKey = `${imageCacheIds[imageIndex]}:${texture.sampler ?? -1}`;
    if (textureCacheKeys.has(cacheKey)) continue;
    textureCacheKeys.add(cacheKey);
    totalTexturePixels += imagePixels[imageIndex];
    if (totalTexturePixels > MAX_GLB_TEXTURE_PIXELS) {
      return "Choose a GLB whose combined textures stay within a 4096 × 4096 pixel budget.";
    }
  }

  return null;
}

function getEmbeddedImageDimensions(
  bytes: Uint8Array,
  mimeType?: string,
): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    mimeType === "image/png" &&
    bytes.byteLength >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(8) === 13 &&
    view.getUint32(12) === 0x49484452
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mimeType === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return undefined;
      const segmentLength = view.getUint16(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return undefined;
      if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
        if (segmentLength < 7) return undefined;
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += segmentLength;
    }
  }
  if (
    mimeType === "image/webp" &&
    bytes.byteLength >= 30 &&
    view.getUint32(0, true) === 0x46464952 &&
    view.getUint32(8, true) === 0x50424557
  ) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      return { width, height };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      const height = 1 + ((bytes[22] >> 6) & 0x03) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
      return { width, height };
    }
  }
  return undefined;
}

interface MeshGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  frontIndexCount: number;
  min: [number, number, number];
  max: [number, number, number];
}

function createLoftedTubeMesh(
  rings: Array<{ xCenter: number; y: number; zCenter?: number; rx: number; rz: number }>,
  radialSegments = 32,
  axis: "y" | "x" = "y",
): MeshGeometryData {
  const ringCount = rings.length;
  const vertexCount = ringCount * (radialSegments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const frontIndices: number[] = [];
  const backIndices: number[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  let vOffset = 0;
  for (let r = 0; r < ringCount; r++) {
    const ring = rings[r];
    const vRatio = r / Math.max(1, ringCount - 1);
    for (let s = 0; s <= radialSegments; s++) {
      const theta = (s / radialSegments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      let px: number;
      let py: number;
      let pz: number;
      let nx: number;
      let ny: number;
      let nz: number;
      if (axis === "y") {
        // Contoured neckline dip in front (+z), sloped trapezius shoulders, and natural drapery folds
        const collarDip = r <= 1 && sin > 0 ? Math.pow(sin, 1.5) * 0.08 * (1 - r * 0.4) : 0;
        const shoulderSlope = r >= 1 && r <= 3 ? Math.pow(Math.abs(cos), 1.5) * 0.05 : 0;
        const drapeWave = vRatio > 0.25 ? Math.sin(theta * 6) * 0.012 * vRatio : 0;
        px = ring.xCenter + cos * (ring.rx + drapeWave);
        py = ring.y - collarDip - shoulderSlope;
        pz = (ring.zCenter ?? 0) + sin * (ring.rz + drapeWave);
        nx = cos / Math.max(0.05, ring.rx);
        ny = r <= 2 ? 0.24 : 0.05;
        nz = sin / Math.max(0.05, ring.rz);
      } else {
        // Curved deltoid cap on inner sleeve ring (r === 0) so sleeves blend seamlessly into torso
        const capCurve = r === 0 && cos > 0 ? cos * 0.08 : 0;
        px = ring.xCenter + (ring.xCenter < 0 ? capCurve : -capCurve);
        py = ring.y + cos * ring.rx;
        pz = (ring.zCenter ?? 0) + sin * ring.rz;
        nx = ring.xCenter < 0 ? -0.15 : 0.15;
        ny = cos / Math.max(0.05, ring.rx);
        nz = sin / Math.max(0.05, ring.rz);
      }
      const nLen = Math.hypot(nx, ny, nz) || 1;
      positions[vOffset] = px;
      positions[vOffset + 1] = py;
      positions[vOffset + 2] = pz;
      normals[vOffset] = nx / nLen;
      normals[vOffset + 1] = ny / nLen;
      normals[vOffset + 2] = nz / nLen;
      const uvOffset = (r * (radialSegments + 1) + s) * 2;
      // Three.js CanvasTexture.flipY maps the source image's top row to V=1.
      uvs[uvOffset] = 1 - theta / Math.PI;
      uvs[uvOffset + 1] = 1 - vRatio;
      vOffset += 3;

      if (px < min[0]) min[0] = px;
      if (py < min[1]) min[1] = py;
      if (pz < min[2]) min[2] = pz;
      if (px > max[0]) max[0] = px;
      if (py > max[1]) max[1] = py;
      if (pz > max[2]) max[2] = pz;
    }
  }

  const stride = radialSegments + 1;
  for (let r = 0; r < ringCount - 1; r++) {
    for (let s = 0; s < radialSegments; s++) {
      const a = r * stride + s;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      const target = Math.sin(((s + 0.5) / radialSegments) * Math.PI * 2) > 0 ? frontIndices : backIndices;
      target.push(a, b, c, c, b, d);
    }
  }

  const indices = new Uint16Array([...frontIndices, ...backIndices]);
  return { positions, normals, uvs, indices, frontIndexCount: frontIndices.length, min, max };
}

function geometryFromTube(data: MeshGeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions.slice(), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals.slice(), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs.slice(), 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices.slice(), 1));
  geometry.addGroup(0, data.frontIndexCount, 0);
  geometry.addGroup(data.frontIndexCount, data.indices.length - data.frontIndexCount, 1);
  return geometry;
}

function mapGarmentTexture(
  source: HTMLCanvasElement,
  silhouette: GarmentSilhouetteProfile | undefined,
  region: "torso" | "left-sleeve" | "right-sleeve",
): HTMLCanvasElement {
  if (typeof source.getContext !== "function") return source;
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context || source.width < 2 || source.height < 2) return source;
  const image = context.getImageData(0, 0, source.width, source.height);
  const mapped = document.createElement("canvas");
  mapped.width = source.width;
  mapped.height = source.height;
  const output = mapped.getContext("2d");
  if (!output) return source;
  const leftProfile = silhouette?.torsoLeftU ?? [];
  const rightProfile = silhouette?.torsoRightU ?? [];
  const sample = (profile: number[], at: number, fallback: number) => {
    if (profile.length < 2) return fallback;
    const position = Math.max(0, Math.min(profile.length - 1, at * (profile.length - 1)));
    const low = Math.floor(position);
    const high = Math.min(profile.length - 1, low + 1);
    return profile[low] + (profile[high] - profile[low]) * (position - low);
  };
  if (region !== "torso") {
    let left = source.width;
    let top = source.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < source.height; y++) {
      const sourceV = y / Math.max(1, source.height - 1);
      const torsoLeft = sample(leftProfile, sourceV, 0.25) * source.width;
      const torsoRight = sample(rightProfile, sourceV, 0.75) * source.width;
      for (let x = 0; x < source.width; x++) {
        const inSleeve = region === "left-sleeve" ? x < torsoLeft : x > torsoRight;
        if (inSleeve && image.data[(y * source.width + x) * 4 + 3] >= 16) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    }
    if (right >= left && bottom >= top) {
      output.drawImage(source, left, top, right - left + 1, bottom - top + 1, 0, 0, source.width, source.height);
    }
    return mapped;
  }
  const out = output.createImageData(source.width, source.height);

  for (let y = 0; y < source.height; y++) {
    const v = y / (source.height - 1);
    const left = sample(leftProfile, v, 0.25);
    const right = sample(rightProfile, v, 0.75);
    for (let x = 0; x < source.width; x++) {
      const u = x / (source.width - 1);
      const keep = region === "torso" ? u >= left && u <= right : region === "left-sleeve" ? u < left : u > right;
      if (!keep) continue;
      const i = (y * source.width + x) * 4;
      out.data.set(image.data.subarray(i, i + 4), i);
    }
  }
  output.putImageData(out, 0, 0);
  return mapped;
}

function sourceFabricColor(source: HTMLCanvasElement): THREE.Color {
  if (typeof source.getContext !== "function") return new THREE.Color(0x777777);
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context || source.width < 1 || source.height < 1) return new THREE.Color(0x777777);
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  for (const yRatio of [0.58, 0.5, 0.68, 0.4]) {
    const x = Math.floor(source.width / 2);
    const y = Math.floor(source.height * yRatio);
    const i = (y * source.width + x) * 4;
    if (pixels[i + 3] > 32) return new THREE.Color(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255);
  }
  return new THREE.Color(0x777777);
}

export function createGarmentGlbBuffer(preset: Garment3DPreset): ArrayBuffer {
  const style = {
    "soft-tee": {
      color: [0.34, 0.49, 0.43, 1.0],
      roughness: 0.78,
      metallic: 0.04,
      sleeveLength: 0.46,
      waistTaper: 0.64,
      hemWidth: 0.67,
    },
    "denim-jacket": {
      color: [0.27, 0.39, 0.54, 1.0],
      roughness: 0.65,
      metallic: 0.12,
      sleeveLength: 0.74,
      waistTaper: 0.66,
      hemWidth: 0.68,
    },
    "linen-shirt": {
      color: [0.88, 0.82, 0.71, 1.0],
      roughness: 0.82,
      metallic: 0.02,
      sleeveLength: 0.68,
      waistTaper: 0.65,
      hemWidth: 0.67,
    },
  }[preset];

  const torso = createLoftedTubeMesh(
    [
      { xCenter: 0, y: 0.34, rx: 0.25, rz: 0.18 }, // Ribbed collar rim hugging neck base
      { xCenter: 0, y: 0.26, rx: 0.48, rz: 0.24 }, // Upper trapezius slope
      { xCenter: 0, y: 0.15, rx: 0.69, rz: 0.29 }, // Outer shoulder seam / acromion
      { xCenter: 0, y: -0.06, rx: 0.70, rz: 0.32 }, // Full chest & outer deltoid blend
      { xCenter: 0, y: -0.32, rx: 0.66, rz: 0.29 }, // Mid-chest / lats
      { xCenter: 0, y: -0.64, rx: style.waistTaper, rz: 0.27 }, // Waist taper
      { xCenter: 0, y: -1.02, rx: style.hemWidth, rz: 0.28 }, // Lower hem
    ],
    32,
    "y",
  );

  const sleeveL = createLoftedTubeMesh(
    [
      { xCenter: 0.36, y: 0.02, rx: 0.22, rz: 0.24 },
      { xCenter: 0.16, y: 0.02, rx: 0.22, rz: 0.22 },
      { xCenter: -style.sleeveLength * 0.05, y: 0, rx: 0.20, rz: 0.20 },
      { xCenter: -style.sleeveLength * 0.52, y: -0.03, rx: 0.17, rz: 0.17 },
      { xCenter: -style.sleeveLength, y: -0.05, rx: 0.15, rz: 0.15 },
    ],
    32,
    "x",
  );

  const sleeveR = createLoftedTubeMesh(
    [
      { xCenter: -0.36, y: 0.02, rx: 0.22, rz: 0.24 },
      { xCenter: -0.16, y: 0.02, rx: 0.22, rz: 0.22 },
      { xCenter: style.sleeveLength * 0.05, y: 0, rx: 0.20, rz: 0.20 },
      { xCenter: style.sleeveLength * 0.52, y: -0.03, rx: 0.17, rz: 0.17 },
      { xCenter: style.sleeveLength, y: -0.05, rx: 0.15, rz: 0.15 },
    ],
    32,
    "x",
  );

  const parts = [
    { name: "Torso", mesh: torso, translation: [0, 0, 0] },
    { name: "SleeveLeft", mesh: sleeveL, translation: [-0.56, 0.08, 0] },
    { name: "SleeveRight", mesh: sleeveR, translation: [0.56, 0.08, 0] },
  ];

  const bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number; target: number }> = [];
  const accessors: Array<{
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }> = [];
  const meshes: Array<{
    name: string;
    primitives: Array<{ attributes: { POSITION: number; NORMAL: number }; indices: number; material: number }>;
  }> = [];

  const chunks: Uint8Array[] = [];
  let byteOffset = 0;
  const appendBytes = (bytes: Uint8Array, target: number) => {
    const pad = (4 - (bytes.byteLength % 4)) % 4;
    const viewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
    chunks.push(bytes);
    byteOffset += bytes.byteLength;
    if (pad > 0) {
      chunks.push(new Uint8Array(pad));
      byteOffset += pad;
    }
    return viewIndex;
  };

  for (const part of parts) {
    const posView = appendBytes(new Uint8Array(part.mesh.positions.buffer), 34962);
    const normView = appendBytes(new Uint8Array(part.mesh.normals.buffer), 34962);
    const idxView = appendBytes(new Uint8Array(part.mesh.indices.buffer), 34963);

    const posAccessor = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: part.mesh.positions.length / 3,
      type: "VEC3",
      min: part.mesh.min,
      max: part.mesh.max,
    });
    const normAccessor = accessors.length;
    accessors.push({
      bufferView: normView,
      componentType: 5126,
      count: part.mesh.normals.length / 3,
      type: "VEC3",
    });
    const idxAccessor = accessors.length;
    accessors.push({
      bufferView: idxView,
      componentType: 5123,
      count: part.mesh.indices.length,
      type: "SCALAR",
    });

    meshes.push({
      name: part.name,
      primitives: [
        {
          attributes: { POSITION: posAccessor, NORMAL: normAccessor },
          indices: idxAccessor,
          material: 0,
        },
      ],
    });
  }

  const gltf = {
    asset: { version: "2.0", generator: "FitCheck Browser 3D Generator" },
    scene: 0,
    scenes: [{ name: "GarmentScene", nodes: [0] }],
    nodes: [
      { name: "GarmentRoot", children: [1, 2, 3] },
      { name: "Torso", mesh: 0, translation: parts[0].translation },
      { name: "SleeveLeft", mesh: 1, translation: parts[1].translation },
      { name: "SleeveRight", mesh: 2, translation: parts[2].translation },
    ],
    materials: [
      {
        name: `${preset}-material`,
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: style.color,
          metallicFactor: style.metallic,
          roughnessFactor: style.roughness,
        },
      },
    ],
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonRaw = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonRaw.byteLength % 4)) % 4;
  const jsonChunkLength = jsonRaw.byteLength + jsonPad;
  const binChunkLength = byteOffset;
  const totalByteLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;

  const glb = new ArrayBuffer(totalByteLength);
  const view = new DataView(glb);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalByteLength, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, GLB_JSON_CHUNK, true);

  const bytes = new Uint8Array(glb);
  bytes.set(jsonRaw, 20);
  if (jsonPad > 0) bytes.fill(0x20, 20 + jsonRaw.byteLength, 20 + jsonChunkLength);

  const binHeaderOffset = 20 + jsonChunkLength;
  view.setUint32(binHeaderOffset, binChunkLength, true);
  view.setUint32(binHeaderOffset + 4, GLB_BIN_CHUNK, true);

  let writeCursor = binHeaderOffset + 8;
  for (const chunk of chunks) {
    bytes.set(chunk, writeCursor);
    writeCursor += chunk.byteLength;
  }

  return glb;
}

export async function buildGarment3DGroupFromGlb(buffer: ArrayBuffer): Promise<THREE.Group> {
  const validationError = validateGlbBuffer(buffer);
  if (validationError) throw new Error(validationError);

  const loader = new GLTFLoader();
  return new Promise<THREE.Group>((resolve, reject) => {
    loader.parse(
      buffer,
      "",
      (gltf) => {
        const root = new THREE.Group();
        root.name = "GarmentContainer";
        if (gltf.parser.json.asset.generator === "FitCheck Browser 3D Generator") {
          root.userData.fitcheckTorsoRings = 7;
          root.userData.fitcheckTorsoRadialSegments = 32;
        }
        root.add(gltf.scene);
        if (!gltf.scene.getObjectByName("Torso")) {
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          const center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          const maxSpan = Math.max(size.x, size.y, 0.001);
          const normScale = 1.25 / maxSpan;
          gltf.scene.scale.multiplyScalar(normScale);
          gltf.scene.position.set(
            -center.x * normScale,
            -(box.max.y - size.y * 0.22) * normScale,
            -center.z * normScale,
          );
        }
        resolve(root);
      },
      (error) => reject(error instanceof Error ? error : new Error("Could not parse .glb 3D model.")),
    );
  });
}

export function buildDrapedGarment3DGroupFromCanvas(
  garmentCanvas: HTMLCanvasElement,
  hemWidthRatio = 1,
  necklineX = 0.5,
  necklineY = 0.08,
): THREE.Group {
  const garmentSilhouette = getOrComputeGarmentSilhouette(garmentCanvas);
  const backColor = sourceFabricColor(garmentCanvas);
  const frontMaterial = (region: "torso" | "left-sleeve" | "right-sleeve") => {
    const texture = new THREE.CanvasTexture(mapGarmentTexture(garmentCanvas, garmentSilhouette, region));
    texture.flipY = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.03, roughness: 0.78, side: THREE.DoubleSide });
  };
  const backMaterial = new THREE.MeshStandardMaterial({ color: backColor, roughness: 0.82, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = "TexturedGarment3D";
  group.userData = {
    hemWidthRatio,
    necklineX,
    necklineY,
    garmentSilhouette,
    fitcheckRasterGarment: true,
    fitcheckTorsoRings: 7,
    fitcheckTorsoRadialSegments: 32,
    fitcheckSleeveRings: 5,
    fitcheckSleeveRadialSegments: 32,
    fitcheckTextureFlipY: true,
    fitcheckSourceTopV: 1,
    fitcheckSourceBottomV: 0,
    fitcheckTextureMapping: "front projection onto procedural torso and sleeve tubes",
    fitcheckHiddenSurfaceMapping: "sampled fabric color; source photo is not a 3D garment scan",
  };

  const torsoData = createLoftedTubeMesh(
    [
      { xCenter: 0, y: 0.34, rx: 0.25, rz: 0.18 },
      { xCenter: 0, y: 0.26, rx: 0.48, rz: 0.24 },
      { xCenter: 0, y: 0.15, rx: 0.69, rz: 0.29 },
      { xCenter: 0, y: -0.06, rx: 0.70, rz: 0.32 },
      { xCenter: 0, y: -0.32, rx: 0.66, rz: 0.29 },
      { xCenter: 0, y: -0.64, rx: 0.64, rz: 0.27 },
      { xCenter: 0, y: -1.02, rx: 0.67, rz: 0.28 },
    ],
    32,
    "y",
  );
  const torso = new THREE.Mesh(geometryFromTube(torsoData), [frontMaterial("torso"), backMaterial]);
  torso.name = "Torso";
  group.add(torso);

  const sleeve = (side: "left" | "right") => {
    const sign = side === "left" ? -1 : 1;
    const data = createLoftedTubeMesh(
      [
        { xCenter: -sign * 0.36, y: 0.02, rx: 0.22, rz: 0.24 },
        { xCenter: -sign * 0.16, y: 0.02, rx: 0.22, rz: 0.22 },
        { xCenter: sign * 0.05, y: 0, rx: 0.20, rz: 0.20 },
        { xCenter: sign * 0.26, y: -0.03, rx: 0.17, rz: 0.17 },
        { xCenter: sign * 0.46, y: -0.05, rx: 0.15, rz: 0.15 },
      ],
      32,
      "x",
    );
    const mesh = new THREE.Mesh(geometryFromTube(data), [frontMaterial(`${side}-sleeve`), backMaterial.clone()]);
    mesh.name = `${side === "left" ? "Left" : "Right"}SleeveSurface`;
    const pivot = new THREE.Group();
    pivot.name = side === "left" ? "SleeveLeft" : "SleeveRight";
    pivot.position.set(sign * 0.56, 0.08, 0);
    pivot.add(mesh);
    return pivot;
  };
  group.add(sleeve("left"), sleeve("right"));
  return group;
}

export function syncGarmentOccludingCapsules(
  proxy: BodyProxy3D,
  frameWidth: number,
  frameHeight: number,
  visibleDebug = false,
  existingGroup?: THREE.Group,
): THREE.Group {
  const group = existingGroup ?? new THREE.Group();
  group.name = "ArmOccluderGroup";

  while (group.children.length > 0) {
    const child = group.children[0] as THREE.Mesh;
    group.remove(child);
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose();
  }

  const candidateCapsules: Array<{ name: string; capsule: Capsule3D | null }> = [
    { name: "LeftForearmOccluder", capsule: proxy.leftForearm },
    { name: "RightForearmOccluder", capsule: proxy.rightForearm },
    { name: "LeftHandOccluder", capsule: proxy.leftHand },
    { name: "RightHandOccluder", capsule: proxy.rightHand },
  ];

  for (const { name, capsule } of candidateCapsules) {
    if (!capsule || !capsule.isInFrontOfTorso) continue;

    const start3D = new THREE.Vector3(
      capsule.start.x - frameWidth / 2,
      frameHeight / 2 - capsule.start.y,
      Math.max(capsule.start.z, proxy.torsoRadiusZ * 1.15),
    );
    const end3D = new THREE.Vector3(
      capsule.end.x - frameWidth / 2,
      frameHeight / 2 - capsule.end.y,
      Math.max(capsule.end.z, proxy.torsoRadiusZ * 1.15),
    );
    const delta = new THREE.Vector3().subVectors(end3D, start3D);
    const segmentLength = Math.max(4, delta.length());
    const geometry = new THREE.CapsuleGeometry(capsule.radius, segmentLength, 8, 12);

    const material = visibleDebug
      ? new THREE.MeshBasicMaterial({
          color: 0x00f0ff,
          wireframe: true,
          transparent: true,
          opacity: 0.85,
        })
      : new THREE.MeshBasicMaterial({
          colorWrite: false,
          depthWrite: true,
        });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.renderOrder = visibleDebug ? 10 : -1;
    mesh.position.addVectors(start3D, end3D).multiplyScalar(0.5);
    const upVec = new THREE.Vector3(0, 1, 0);
    const dir = delta.clone().normalize();
    if (dir.lengthSq() > 0.0001) {
      mesh.quaternion.setFromUnitVectors(upVec, dir);
    }
    group.add(mesh);
  }

  return group;
}

export function computeGarment3DTransform(
  placement: GarmentPlacement,
  frameWidth: number,
  frameHeight: number,
  modelBounds = new THREE.Box3(
    new THREE.Vector3(-1.02, -1.02, -0.32),
    new THREE.Vector3(1.02, 0.34, 0.32),
  ),
): Garment3DTransform {
  const { shoulderLeft: sl, shoulderRight: sr, hipLeft: hl, hipRight: hr } = placement;
  const shoulderCenterX = (sl.x + sr.x) / 2;
  const shoulderCenterY = (sl.y + sr.y) / 2;
  const hipCenterX = (hl.x + hr.x) / 2;
  const hipCenterY = Math.min((hl.y + hr.y) / 2, frameHeight * 0.96);

  const projectedShoulderWidth = Math.max(12, Math.hypot(sr.x - sl.x, sr.y - sl.y));
  const torsoHeight = Math.max(
    projectedShoulderWidth * 1.05,
    Math.hypot(hipCenterX - shoulderCenterX, hipCenterY - shoulderCenterY),
  );
  const rotationY = placement.torsoRotationY ?? 0;
  const trueShoulderWidth = Math.max(
    projectedShoulderWidth / Math.max(0.28, Math.cos(rotationY)),
    torsoHeight * 0.62,
  );

  const rotationZ = -Math.atan2(sr.y - sl.y, Math.max(16, sr.x - sl.x));
  const modelSize = new THREE.Vector3();
  const modelCenter = new THREE.Vector3();
  modelBounds.getSize(modelSize);
  modelBounds.getCenter(modelCenter);
  const neckLift = trueShoulderWidth * 0.26;
  const modelWidth = Math.max(0.001, modelSize.x);
  const modelHeight = Math.max(0.001, modelSize.y);
  const modelDepth = Math.max(0.001, modelSize.z);
  const scaleX = (trueShoulderWidth * 1.75) / modelWidth;
  const scaleY = (torsoHeight + neckLift) / modelHeight;
  const scaleZ = (trueShoulderWidth * 0.55) / modelDepth;
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  let leftSleeveAngleZ = 0.52;
  if (placement.elbowLeft) {
    const dx = placement.elbowLeft.x - sl.x;
    const dy = placement.elbowLeft.y - sl.y;
    leftSleeveAngleZ = clamp(Math.atan2(dy, -dx) - rotationZ, -1.1, 1.35);
  } else if (Number.isFinite(placement.segArmAngleLeft)) {
    leftSleeveAngleZ = clamp(placement.segArmAngleLeft! - rotationZ, -1.1, 1.35);
  }

  let rightSleeveAngleZ = -0.52;
  if (placement.elbowRight) {
    const dx = placement.elbowRight.x - sr.x;
    const dy = placement.elbowRight.y - sr.y;
    rightSleeveAngleZ = clamp(Math.atan2(-dy, dx) - rotationZ, -1.35, 1.1);
  } else if (Number.isFinite(placement.segArmAngleRight)) {
    rightSleeveAngleZ = clamp(-placement.segArmAngleRight! - rotationZ, -1.35, 1.1);
  }

  return {
    position: {
      x: shoulderCenterX - frameWidth / 2 - modelCenter.x * scaleX,
      y: frameHeight / 2 - shoulderCenterY + neckLift - modelBounds.max.y * scaleY,
      z: 0,
    },
    scale: {
      x: scaleX,
      y: scaleY,
      z: scaleZ,
    },
    rotationZ,
    rotationY,
    leftSleeveAngleZ,
    rightSleeveAngleZ,
  };
}

export function applyGarment3DTransform(root: THREE.Object3D, transform: Garment3DTransform): void {
  root.position.set(transform.position.x, transform.position.y, transform.position.z);
  root.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
  root.rotation.set(0, transform.rotationY, transform.rotationZ);

  const sleeveLeft = root.getObjectByName("SleeveLeft");
  if (sleeveLeft) {
    sleeveLeft.rotation.set(0, 0, transform.leftSleeveAngleZ);
  }
  const sleeveRight = root.getObjectByName("SleeveRight");
  if (sleeveRight) {
    sleeveRight.rotation.set(0, 0, transform.rightSleeveAngleZ);
  }
}

export function updateGeneratedTorsoFit(
  group: THREE.Group,
  placement: GarmentPlacement,
  transform: Garment3DTransform,
  basePositions: Float32Array,
): boolean {
  if (group.userData.fitcheckTorsoRings !== 7 || group.userData.fitcheckTorsoRadialSegments !== 32) return false;
  const torso = group.getObjectByName("Torso");
  if (!(torso instanceof THREE.Mesh) || basePositions.length !== 7 * 33 * 3) return false;
  const position = torso.geometry.attributes.position;
  if (!position || position.count !== 7 * 33) return false;

  const shoulderWidth = Math.max(
    1,
    Math.hypot(
      placement.shoulderRight.x - placement.shoulderLeft.x,
      placement.shoulderRight.y - placement.shoulderLeft.y,
    ),
  );
  const shoulderCenterX = (placement.shoulderLeft.x + placement.shoulderRight.x) / 2;
  const hipCenterX = (placement.hipLeft.x + placement.hipRight.x) / 2;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const chest = clamp(placement.chestHalfWidth ?? shoulderWidth * 0.53, shoulderWidth * 0.4, shoulderWidth * 0.78);
  const waist = clamp(placement.waistHalfWidth ?? shoulderWidth * 0.46, shoulderWidth * 0.34, shoulderWidth * 0.72);
  const hip = clamp(placement.hipHalfWidth ?? shoulderWidth * 0.5, shoulderWidth * 0.34, shoulderWidth * 0.78);
  const ease = shoulderWidth * 0.035;
  const topRingY = basePositions[1];
  const bottomRingY = basePositions[(6 * 33) * 3 + 1];
  const radii = [
    shoulderWidth * 0.20,
    shoulderWidth * 0.44,
    shoulderWidth * 0.57 + ease,
    chest + ease,
    chest * 0.96 + ease,
    waist + ease,
    hip + ease,
  ];

  for (let ring = 0; ring < 7; ring++) {
    let radiusX = 0;
    for (let segment = 0; segment < 33; segment++) {
      const index = (ring * 33 + segment) * 3;
      radiusX = Math.max(radiusX, Math.abs(basePositions[index]));
    }
    let fittedRadius = radii[ring];
    let centerOffset = (hipCenterX - shoulderCenterX) * (ring / 6);
    if (ring >= 2 && placement.segRowLeftX && placement.segRowRightX) {
      const v = clamp((topRingY - basePositions[(ring * 33) * 3 + 1]) / Math.max(0.001, topRingY - bottomRingY), 0, 1);
      const sample = (profile: number[]) => {
        const position = v * (profile.length - 1);
        const low = Math.floor(position);
        const high = Math.min(profile.length - 1, low + 1);
        return profile[low] + (profile[high] - profile[low]) * (position - low);
      };
      const leftEdge = sample(placement.segRowLeftX);
      const rightEdge = sample(placement.segRowRightX);
      if (Number.isFinite(leftEdge) && Number.isFinite(rightEdge) && rightEdge > leftEdge) {
        const contourHalfWidth = clamp((rightEdge - leftEdge) / 2, shoulderWidth * 0.4, shoulderWidth * 0.78);
        fittedRadius = fittedRadius * 0.2 + (contourHalfWidth + ease) * 0.8;
        const spineCenter = shoulderCenterX + (hipCenterX - shoulderCenterX) * v;
        centerOffset = (spineCenter - shoulderCenterX)
          + clamp((leftEdge + rightEdge) / 2 - spineCenter, -shoulderWidth * 0.12, shoulderWidth * 0.12) * 0.8;
      }
    }
    const factor = fittedRadius / Math.max(0.001, radiusX * transform.scale.x);
    const centerShift = centerOffset / transform.scale.x;
    for (let segment = 0; segment < 33; segment++) {
      const index = (ring * 33 + segment) * 3;
      position.setXYZ(
        ring * 33 + segment,
        basePositions[index] * factor + centerShift,
        basePositions[index + 1],
        basePositions[index + 2] * factor,
      );
    }
  }
  position.needsUpdate = true;
  torso.geometry.computeVertexNormals();
  return true;
}

export function fitGarmentDepthToBodyProxy(group: THREE.Group, proxy: BodyProxy3D): boolean {
  const torso = group.getObjectByName("Torso");
  if (!(torso instanceof THREE.Mesh)) return false;
  const position = torso.geometry.attributes.position;
  if (!position || position.count === 0 || proxy.torsoRadiusZ <= 0) return false;

  let torsoDepthRadius = 0;
  for (let index = 0; index < position.count; index++) {
    torsoDepthRadius = Math.max(torsoDepthRadius, Math.abs(position.getZ(index)));
  }
  if (!Number.isFinite(torsoDepthRadius) || torsoDepthRadius <= 0) return false;

  // Keep the garment shell just outside the tracked torso volume so the wearer sits inside it.
  const fabricEase = proxy.frame.trueShoulderWidth * 0.025;
  group.scale.z = (proxy.torsoRadiusZ + fabricEase) / torsoDepthRadius;
  group.position.z = proxy.torsoCenter.z;
  return true;
}

export class GarmentRenderer3D {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-640, 640, 480, -480, -2500, 2500);
  private renderer: THREE.WebGLRenderer | null = null;
  private activeGroup: THREE.Group | null = null;
  private activeBounds: THREE.Box3 | null = null;
  private activeTorsoBasePositions: Float32Array | null = null;
  private occluderGroup = new THREE.Group();
  private debugGroup = new THREE.Group();

  constructor() {
    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x5c6458, 1.45);
    hemiLight.position.set(0, 400, 300);
    const keyLight = new THREE.DirectionalLight(0xfffaf0, 1.15);
    keyLight.position.set(220, 320, 500);
    const rimLight = new THREE.DirectionalLight(0xd9e8d4, 0.55);
    rimLight.position.set(-260, -120, -300);

    this.occluderGroup.name = "ArmOccluderGroup";
    this.debugGroup.name = "DebugVisualsGroup";
    this.scene.add(hemiLight, keyLight, rimLight, this.occluderGroup, this.debugGroup);
  }

  setGarmentGroup(group: THREE.Group): void {
    this.clearActiveGroup();
    this.activeGroup = group;
    this.activeBounds = new THREE.Box3().setFromObject(group);
    const torso = group.getObjectByName("Torso");
    const torsoPositions = torso instanceof THREE.Mesh ? torso.geometry.attributes.position : undefined;
    this.activeTorsoBasePositions =
      group.userData.fitcheckTorsoRings === 7 && torsoPositions
        ? Float32Array.from(torsoPositions.array as ArrayLike<number>)
        : null;
    this.scene.add(group);
  }

  renderToCanvas(
    targetContext: CanvasRenderingContext2D,
    placement: GarmentPlacement,
    width: number,
    height: number,
    debugOptions?: DebugRenderOptions,
  ): { renderMs: number } {
    if (!this.activeGroup || width <= 0 || height <= 0) return { renderMs: 0 };
    const startMs = performance.now();

    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    const canvas = this.renderer.domElement;
    if (canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.camera.left = -width / 2;
      this.camera.right = width / 2;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;
      this.camera.updateProjectionMatrix();
    }

    // Apply wireframe debug toggle to garment meshes
    const showWireframe = Boolean(debugOptions?.showWireframe);
    const yawAbs = Math.abs(placement.torsoRotationY ?? 0);
    this.activeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (child.name === "DrapedBackMesh") {
          child.visible = !showWireframe && yawAbs > 0.35;
        }
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if ("wireframe" in m) (m as THREE.MeshStandardMaterial).wireframe = showWireframe;
        }
      }
    });

    const transform = computeGarment3DTransform(placement, width, height, this.activeBounds ?? undefined);
    applyGarment3DTransform(this.activeGroup, transform);
    if (this.activeTorsoBasePositions) {
      updateGeneratedTorsoFit(this.activeGroup, placement, transform, this.activeTorsoBasePositions);
    }
    if (this.activeGroup.userData.fitcheckTorsoRings === 7 && debugOptions?.bodyProxy) {
      fitGarmentDepthToBodyProxy(this.activeGroup, debugOptions.bodyProxy);
    }

    // Update 3D debug visuals (in live rendering, foreground hand/forearm occlusion is handled
    // by the pixel-accurate feathered ImageSegmenter mask rather than un-segmented geometric capsules)
    this.clearDebugGroup();
    if (debugOptions?.bodyProxy) {
      if (debugOptions.showOccluders) {
        syncGarmentOccludingCapsules(
          debugOptions.bodyProxy,
          width,
          height,
          true,
          this.occluderGroup,
        );
      } else {
        while (this.occluderGroup.children.length > 0) {
          this.occluderGroup.remove(this.occluderGroup.children[0]);
        }
      }
      this.populateDebugVisuals(debugOptions.bodyProxy, width, height, debugOptions);
    } else {
      while (this.occluderGroup.children.length > 0) {
        this.occluderGroup.remove(this.occluderGroup.children[0]);
      }
    }

    this.renderer.render(this.scene, this.camera);
    targetContext.drawImage(canvas, 0, 0, width, height);
    return { renderMs: performance.now() - startMs };
  }

  private populateDebugVisuals(
    proxy: BodyProxy3D,
    width: number,
    height: number,
    options: DebugRenderOptions,
  ): void {
    const cx = proxy.torsoCenter.x - width / 2;
    const cy = height / 2 - proxy.torsoCenter.y;

    if (options.showBodyProxy) {
      const proxyGeom = new THREE.CylinderGeometry(
        proxy.torsoRadiusX,
        proxy.torsoRadiusX * 0.92,
        proxy.torsoHeight,
        20,
        6,
        true,
      );
      proxyGeom.scale(1, 1, proxy.torsoRadiusZ / Math.max(1, proxy.torsoRadiusX));
      const proxyMat = new THREE.MeshBasicMaterial({
        color: 0xf4b860,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
      });
      const proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
      proxyMesh.position.set(cx, cy, 0);
      proxyMesh.rotation.set(0, proxy.frame.yaw, -proxy.frame.roll);
      this.debugGroup.add(proxyMesh);

      for (const arm of [proxy.leftUpperArm, proxy.rightUpperArm]) {
        if (!arm) continue;
        const start3D = new THREE.Vector3(arm.start.x - width / 2, height / 2 - arm.start.y, arm.start.z);
        const end3D = new THREE.Vector3(arm.end.x - width / 2, height / 2 - arm.end.y, arm.end.z);
        const delta = new THREE.Vector3().subVectors(end3D, start3D);
        const armLen = Math.max(4, delta.length());
        const armGeom = new THREE.CapsuleGeometry(arm.radius * 1.15, armLen, 6, 10);
        const armMat = new THREE.MeshBasicMaterial({
          color: 0xf4b860,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
        });
        const armMesh = new THREE.Mesh(armGeom, armMat);
        armMesh.position.addVectors(start3D, end3D).multiplyScalar(0.5);
        const dir = delta.clone().normalize();
        if (dir.lengthSq() > 0.0001) {
          armMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        }
        this.debugGroup.add(armMesh);
      }
    }

    if (options.showAxes) {
      const axes = new THREE.AxesHelper(proxy.frame.trueShoulderWidth * 0.45);
      axes.position.set(
        proxy.frame.origin.x - width / 2,
        height / 2 - proxy.frame.origin.y,
        proxy.frame.torsoHeight * 0.4,
      );
      axes.rotation.set(proxy.frame.pitch, proxy.frame.yaw, -proxy.frame.roll);
      this.debugGroup.add(axes);
    }
  }

  private clearDebugGroup(): void {
    while (this.debugGroup.children.length > 0) {
      const child = this.debugGroup.children[0] as THREE.Mesh;
      this.debugGroup.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    }
  }

  private clearActiveGroup(): void {
    if (!this.activeGroup) return;
    this.scene.remove(this.activeGroup);
    this.activeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          if (mat && "map" in mat && mat.map instanceof THREE.Texture) {
            mat.map.dispose();
          }
          mat?.dispose();
        }
      }
    });
    this.activeGroup = null;
    this.activeBounds = null;
    this.activeTorsoBasePositions = null;
  }

  releaseWebGLContext(): void {
    this.clearDebugGroup();
    this.renderer?.dispose();
    this.renderer = null;
  }

  dispose(): void {
    this.clearActiveGroup();
    this.releaseWebGLContext();
  }
}
