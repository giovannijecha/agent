import { createHash } from "node:crypto";

const EXPECTED_IDENTITY = Object.freeze({
  product: "agent",
  wordmark: ".agent",
});
const EXPECTED_SOURCE = Object.freeze({
  kind: "maintainer-provided-original",
  received: "2026-08-12",
  archiveSha256:
    "ddcd7fd1eeff44e9ae55d543cb9f2452cf52247f7da9fcfd2ed023406c2c43bf",
});
const EXPECTED_PALETTE = Object.freeze({
  canvas: "#0B0D10",
  darkSurfaceInk: "#FFFFFF",
  lightSurfaceInk: "#0B0D10",
});
const EXPECTED_ASSETS = Object.freeze([
  ["assets/brand/agent-auth-logo-1024.png", "image/png", 1024, 1024, "auth-mark", "canonical-raster"],
  ["assets/brand/agent-auth-logo-256.png", "image/png", 256, 256, "auth-mark", "canonical-raster"],
  ["assets/brand/agent-auth-logo-512.png", "image/png", 512, 512, "auth-mark", "canonical-raster"],
  ["assets/brand/agent-auth-logo.svg", "image/svg+xml", 1024, 1024, "auth-mark", "font-dependent-vector"],
  ["assets/brand/agent-wordmark-dark.png", "image/png", 1280, 320, "dark-wordmark", "canonical-raster"],
  ["assets/brand/agent-wordmark-dark.svg", "image/svg+xml", 1280, 320, "dark-wordmark", "font-dependent-vector"],
  ["assets/brand/agent-wordmark-transparent.png", "image/png", 1280, 320, "light-wordmark", "canonical-raster"],
  ["assets/brand/agent-wordmark-transparent.svg", "image/svg+xml", 1280, 320, "light-wordmark", "font-dependent-vector"],
]);
const REGISTERED_FILES = Object.freeze([
  "assets/brand/README.md",
  ...EXPECTED_ASSETS.map(([path]) => path),
  "assets/brand/manifest.json",
].sort());
const ASSET_KEYS = Object.freeze([
  "path",
  "mediaType",
  "width",
  "height",
  "role",
  "rendering",
  "sha256",
]);
const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

export class BrandPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "BrandPolicyError";
  }
}

function fail(message) {
  throw new BrandPolicyError(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) {
    fail(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    fail(label + " keys mismatch");
  }
}

function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label + " mismatch");
  }
}

function bytesFor(context, path) {
  const value = isRecord(context.files) ? context.files[path] : undefined;
  if (!(value instanceof Uint8Array)) {
    fail("registered brand file is missing");
  }
  return value;
}

function readUint32(bytes, offset) {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function validatePng(bytes, asset) {
  if (bytes.length < 24) {
    fail("brand PNG is truncated");
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      fail("brand PNG signature mismatch");
    }
  }
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk !== "IHDR") {
    fail("brand PNG header is missing");
  }
  if (
    readUint32(bytes, 16) !== asset.width ||
    readUint32(bytes, 20) !== asset.height
  ) {
    fail("brand PNG dimensions mismatch");
  }
}

function validateSvg(bytes, asset) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("brand SVG is not valid UTF-8");
  }
  const width = String(asset.width).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const height = String(asset.height).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (
    !/<svg\b/iu.test(text) ||
    !new RegExp("\\bwidth=[\"']" + width + "[\"']", "u").test(text) ||
    !new RegExp("\\bheight=[\"']" + height + "[\"']", "u").test(text) ||
    !new RegExp(
      "\\bviewBox=[\"']0 0 " + width + " " + height + "[\"']",
      "u",
    ).test(text) ||
    !text.includes(".agent")
  ) {
    fail("brand SVG contract mismatch");
  }
  if (
    /<(?:animate|animateMotion|animateTransform|discard|foreignObject|handler|image|script|set|style|use)\b/iu.test(
      text,
    ) ||
    /\b(?:href|xlink:href)\s*=/iu.test(text) ||
    /\bon[a-z][\w:.-]*\s*=/iu.test(text) ||
    /\bev:event\s*=/iu.test(text) ||
    /(?:data:|@import|url\s*\()/iu.test(text) ||
    /<!(?:DOCTYPE|ENTITY)\b/iu.test(text) ||
    /<\?xml-stylesheet\b/iu.test(text)
  ) {
    fail("brand SVG contains an unsafe capability");
  }
}

function validateAsset(asset, expected, context) {
  exactKeys(asset, ASSET_KEYS, "brand asset");
  same(
    [asset.path, asset.mediaType, asset.width, asset.height, asset.role, asset.rendering],
    expected,
    "brand asset descriptor",
  );
  if (!/^[a-f0-9]{64}$/u.test(asset.sha256)) {
    fail("brand asset digest is invalid");
  }
  const bytes = bytesFor(context, asset.path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== asset.sha256) {
    fail("brand asset bytes drifted");
  }
  if (asset.mediaType === "image/png") {
    validatePng(bytes, asset);
  } else {
    validateSvg(bytes, asset);
  }
}

/** Validates canonical brand identity, provenance, registry, and asset bytes. */
export function validateBrandPolicy(manifest, context) {
  exactKeys(
    manifest,
    ["schemaVersion", "identity", "source", "copyright", "license", "palette", "assets"],
    "brand manifest",
  );
  if (manifest.schemaVersion !== 1 || !isRecord(context)) {
    fail("unsupported brand manifest schema or context");
  }
  exactKeys(manifest.identity, Object.keys(EXPECTED_IDENTITY), "brand identity");
  exactKeys(manifest.source, Object.keys(EXPECTED_SOURCE), "brand source");
  exactKeys(manifest.palette, Object.keys(EXPECTED_PALETTE), "brand palette");
  same(manifest.identity, EXPECTED_IDENTITY, "brand identity");
  same(manifest.source, EXPECTED_SOURCE, "brand source");
  same(manifest.palette, EXPECTED_PALETTE, "brand palette");
  if (
    manifest.copyright !== "Copyright 2026 Giovanni Jecha" ||
    manifest.license !== "Apache-2.0"
  ) {
    fail("brand ownership contract mismatch");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== EXPECTED_ASSETS.length) {
    fail("brand asset registry mismatch");
  }
  same([...context.ownedPaths].sort(), REGISTERED_FILES, "brand file registry");
  for (let index = 0; index < EXPECTED_ASSETS.length; index += 1) {
    validateAsset(manifest.assets[index], EXPECTED_ASSETS[index], context);
  }
}
