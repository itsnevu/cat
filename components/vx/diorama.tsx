"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useLoader, useThree, invalidate } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Diorama v3 — a fully procedural desert: a dune sea with sharp crescent
 * crests, Sphinx statues, pyramids on the horizon and a low sun, scrubbed by scroll.
 * Built the same way the reference site does it: PROCEDURAL peaks (displaced
 * cones, seeded sine-noise ridges) wearing the impressionist textures, under
 * a bright sky, with aerial-perspective fog, drifting mist sprites, particles,
 * birds, and a tilt-shift depth-of-field post pass. Scroll flies the camera
 * along a spline through the range — every scroll offset is a camera frame.
 * The sky/fog grade from warm desert light to Sphynx dusk as you descend.
 *
 * ssr:false — import via next/dynamic from the client page.
 */

const BASE = "/experience/";
const TEX = {
  fog: BASE + "fog.webp",
  fogFlow: BASE + "fog_flow.webp",
  bird: BASE + "BIRD_ALPHA.webp",
  birdTex: BASE + "BIRD_TEXTURE_01.webp",
};

type RefN = React.RefObject<number>;
type Ref2 = React.RefObject<{ x: number; y: number }>;

/* ── colour script: sky/fog/dim stops across the scroll journey ────────── */
/* One continuous flight over the 1370vh runway (the painted chapters are gone):
   A (s 0 → ~0.37)   — the 3D dune flight, warm desert light.
   ⬛ blackout #1 at the Built-For seam (s ≈ 0.372)
   B (s ~0.41 → 0.65) — the aerial dune-field flyover (generated panels).
   ⬛ blackout #2 at the You-Decide seam (s ≈ 0.650)
   C (s ~0.68 → 1)   — the dune-sea aerial finale; `dim` grades it to dusk. */
const SKY_STOPS = [
  // desert dusk: deep umber zenith → hot sand-gold horizon (fog matches `bot`)
  { s: 0.0,  top: [0.09, 0.06, 0.07],  bot: [0.66, 0.44, 0.18],  fog: [0.62, 0.42, 0.18],  dim: 0 },
  { s: 0.3,  top: [0.10, 0.07, 0.08],  bot: [0.70, 0.48, 0.20],  fog: [0.66, 0.45, 0.19],  dim: 0 },
  { s: 0.45, top: [0.09, 0.06, 0.07],  bot: [0.64, 0.42, 0.17],  fog: [0.60, 0.40, 0.17],  dim: 0.03 },
  { s: 0.75, top: [0.08, 0.05, 0.06],  bot: [0.56, 0.36, 0.15],  fog: [0.53, 0.35, 0.15],  dim: 0.06 },
  { s: 0.9,  top: [0.07, 0.05, 0.06],  bot: [0.48, 0.31, 0.13],  fog: [0.46, 0.30, 0.13],  dim: 0.16 },
  { s: 1.0,  top: [0.05, 0.04, 0.06],  bot: [0.30, 0.20, 0.10],  fog: [0.30, 0.20, 0.10],  dim: 0.34 }, // night falls on the Access chapter
];

/** Hard cuts to black between chapters, timed to section seams so each new
 *  title emerges from the dark. */
function blackoutAt(s: number): number {
  // one continuous 3D world — no chapter cut-to-dark
  void s;
  return 0;
}

/** Flight progress: the camera sweep is stretched over the WHOLE runway, so the
 *  desert is one continuous world from the hero to the footer. */
function chapterA(s: number): number {
  return Math.min(1, Math.max(0, s));
}

function skyAt(s: number) {
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (s >= SKY_STOPS[i].s && s <= SKY_STOPS[i + 1].s) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const t = b.s === a.s ? 0 : (s - a.s) / (b.s - a.s);
  const mix = (u: number[], v: number[]) => u.map((x, i) => x + (v[i] - x) * t);
  return { top: mix(a.top, b.top), bot: mix(a.bot, b.bot), fog: mix(a.fog, b.fog), dim: a.dim + (b.dim - a.dim) * t };
}

/* ── statue config (PeakCfg name kept — camera-corridor math reads r/h) ── */
type PeakCfg = {
  x: number; z: number; h: number; r: number;
  squash: number; rot: number; seed: number; tex: "mountain" | "ridge";
};

/* The camera flies the x≈0 corridor from z 4.5 → -26.5. Displacement can
   swell a peak's reach to ~1.9 × r in ANY direction (squash is pre-rotation),
   so every peak the camera passes keeps |x| ≥ r * 1.9 + 1. Peaks beyond the
   path's end (z < -34) are scenery only and may sit anywhere. */
const PEAKS: PeakCfg[] = [
  // THE hero Sphinx — the camera sweeps ~300° around this one
  { x: 2.5,  z: -16, h: 13.5, r: 3.6, squash: 0.85, rot: 0.3, seed: 11,  tex: "mountain" },
  // guardian pair beside the approach, facing the corridor
  { x: -14,  z: -4,  h: 8.5,  r: 2.6, squash: 0.8,  rot: 1.4, seed: 7,   tex: "ridge" },
  { x: 20,   z: -1,  h: 8.5,  r: 2.6, squash: 0.8,  rot: -1.3, seed: 19,  tex: "mountain" },
  // half-buried ancients further out
  { x: -20,  z: -30, h: 9.0,  r: 3.0, squash: 0.75, rot: 2.4, seed: 67,  tex: "ridge" },
  { x: 22,   z: -26, h: 9.0,  r: 3.0, squash: 0.75, rot: -2.1, seed: 113, tex: "mountain" },
];

/* ── procedural desert textures — no painted assets, the sand is generated ── */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** value noise on a small lattice, bilinear, tileable at `n` */
function makeNoise(seed: number, n: number) {
  const rnd = mulberry(seed);
  const lat = new Float32Array(n * n);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  return (u: number, v: number) => {
    const x = ((u % 1) + 1) % 1 * n, y = ((v % 1) + 1) % 1 * n;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

/** fine sand: grain + wind ripples. Grey-scale luminance × vertex colour. */
function makeSandTexture(seed: number, ripple = 0.1, size = 512): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const px = img.data;
  const n1 = makeNoise(seed, 16), n2 = makeNoise(seed + 7, 64), n3 = makeNoise(seed + 13, 8);
  const rnd = mulberry(seed + 99);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // wind ripples: sine bands warped by low-freq noise
      const warp = n3(u, v) * 2.2;
      const rip = 0.5 + 0.5 * Math.sin((u * 46 + v * 9 + warp) * Math.PI);
      const l = 0.36 + n1(u, v) * 0.2 + n2(u, v) * 0.12 + Math.pow(rip, 3) * ripple + (rnd() - 0.5) * 0.05;
      const i = (y * size + x) * 4;
      // warm sand ramp: shadow #A67C33 → #E8B85A → #F3D48A
      const t = Math.min(1, Math.max(0, l));
      const r = 166 + (232 - 166) * t + Math.max(0, t - 0.8) * 55;
      const g = 124 + (184 - 124) * t + Math.max(0, t - 0.8) * 140;
      const b = 51 + (90 - 51) * t + Math.max(0, t - 0.8) * 240;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* ── the dune sea: displaced ground plane with sharp crescent crests ─────── */
const MASSIF = { x: 2.5, z: -16 }; // the point the camera orbits (hero Sphinx)
const SUN = new THREE.Vector3(-0.55, 0.6, 0.58).normalize(); // front-left, low
/* film-style split tone: sunlit sand goes warm, shadows fall cool & slightly
   violet — the classic desert-at-golden-hour look. Writes r,g,b for one vertex. */
function shade(out: Float32Array, i: number, lit: number, base: number, extra = 0) {
  const l = Math.min(1.15, Math.max(0.16, base + lit + extra));
  const warmth = Math.min(1, Math.max(0, (l - 0.3) / 0.6)); // 0 in shadow → 1 in full sun
  out[i * 3] = l * (0.82 + 0.2 * warmth);
  out[i * 3 + 1] = l * (0.8 + 0.16 * warmth);
  out[i * 3 + 2] = l * (0.98 - 0.22 * warmth);
}

function duneHeight(x: number, z: number, warp: (u: number, v: number) => number): { h: number; crest: number } {
  // amplitude grows away from the camera corridor so the flight stays clear
  const dx = x - MASSIF.x, dz = z - MASSIF.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const amp = 0.45 + 5.2 * THREE.MathUtils.smoothstep(d, 15, 40);
  const wv = (warp(x * 0.012, z * 0.012) - 0.5) * 9;
  let h = 0, crest = 0;
  // three dune systems at different bearings/scales
  const sys: [number, number, number, number][] = [
    [0.35, 0.052, 1.0, 0.72], // [bearing, freq, weight, asymmetry split]
    [1.9, 0.11, 0.42, 0.66],
    [-0.9, 0.23, 0.16, 0.7],
  ];
  for (const [th, k, wgt, split] of sys) {
    const u = x * Math.cos(th) + z * Math.sin(th) + wv;
    const ph = ((u * k) % 1 + 1) % 1;
    const dcr = ph < split ? ph / split : 1 - (ph - split) / (1 - split);
    const shaped = Math.pow(dcr, 1.35);
    h += shaped * wgt;
    crest = Math.max(crest, dcr * wgt);
  }
  // the oasis sits in a shallow basin
  const od = Math.hypot(x - OASIS.x, z - OASIS.z);
  const basin = 1 - THREE.MathUtils.smoothstep(od, OASIS.r * 0.6, OASIS.r * 2.6);
  return { h: (h * amp - 0.4) * (1 - basin) + basin * -0.55, crest: crest * (1 - basin) };
}

function buildDunes(): THREE.BufferGeometry {
  const SIZE = 260, SEG = 170;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const warp = makeNoise(31337, 8);
  const hAt = (x: number, z: number) => duneHeight(x, z, warp).h;
  const colors = new Float32Array(pos.count * 3);
  const E = 0.6;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i) - 18;
    const { h, crest } = duneHeight(x, z, warp);
    pos.setY(i, h);
    // finite-difference normal → painted sun shading, grey-scale
    const nx = hAt(x - E, z) - hAt(x + E, z);
    const nz = hAt(x, z - E) - hAt(x, z + E);
    const n = new THREE.Vector3(nx, 2 * E, nz).normalize();
    const lit = Math.max(0, n.dot(SUN));
    // troughs sit in ambient occlusion; crest lines catch a rim of sun
    const ao = 0.85 + 0.15 * THREE.MathUtils.smoothstep(h, -0.4, 2.5);
    shade(colors, i, Math.pow(lit, 1.3) * 0.78 * ao, 0.18, Math.pow(crest, 6) * 0.32);
    uv.setXY(i, (x / SIZE) * 26, (z / SIZE) * 26);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* ── pyramids on the horizon — the Giza trio, sun-lit face vs shadow face ── */
type PyramidCfg = { x: number; z: number; base: number; h: number; rot: number };
const PYRAMIDS: PyramidCfg[] = [
  { x: -16, z: -50, base: 20, h: 13, rot: 0.35 },
  { x: 2,   z: -56, base: 26, h: 17, rot: 0.35 },
  { x: 20,  z: -47, base: 15, h: 10, rot: 0.35 },
  { x: 34,  z: -30, base: 9,  h: 6,  rot: 0.9 },
  { x: -34, z: -22, base: 8,  h: 5,  rot: -0.4 },
];

/* the processional avenue: paired small sphinxes flanking the flight-in, all
   facing the corridor (rot ±π/2). Kept ≥ 5 units off the x≈0 path. */
const AVENUE: PeakCfg[] = [
  { x: -7.0, z: 8,   h: 3.0, r: 0.95, squash: 0.85, rot:  Math.PI / 2, seed: 300, tex: "ridge" },
  { x:  7.0, z: 8,   h: 3.0, r: 0.95, squash: 0.85, rot: -Math.PI / 2, seed: 301, tex: "ridge" },
  { x: -7.5, z: 2.5, h: 3.0, r: 0.95, squash: 0.85, rot:  Math.PI / 2, seed: 302, tex: "ridge" },
  { x:  6.8, z: 2.5, h: 3.0, r: 0.95, squash: 0.85, rot: -Math.PI / 2, seed: 303, tex: "ridge" },
  // the path bends left here → the left statue steps out wider
  { x: -10.5, z: -3, h: 3.0, r: 0.95, squash: 0.85, rot:  Math.PI / 2, seed: 304, tex: "ridge" },
  { x:  7.2, z: -3,  h: 3.0, r: 0.95, squash: 0.85, rot: -Math.PI / 2, seed: 305, tex: "ridge" },
];

/* fallen masonry scattered around the hero — toppled blocks half-sunk in sand */
type RubbleCfg = { x: number; z: number; w: number; h: number; d: number; ry: number; rz: number; y: number };
const RUBBLE: RubbleCfg[] = (() => {
  const rnd = mulberry(77);
  const out: RubbleCfg[] = [];
  for (let k = 0; k < 26; k++) {
    const a = rnd() * Math.PI * 2, R = 6.4 + rnd() * 3.4; // inside the orbit ring (path ≥ 11.7 from MASSIF)
    const x = MASSIF.x + Math.sin(a) * R, z = MASSIF.z + Math.cos(a) * R;
    if (Math.abs(x) < 4.5 && z > -28) continue; // keep the corridor clear
    const w = 0.6 + rnd() * 1.2;
    out.push({ x, z, w, h: 0.4 + rnd() * 0.9, d: 0.5 + rnd() * 1.0, ry: rnd() * Math.PI, rz: (rnd() - 0.5) * 0.5, y: -0.15 - rnd() * 0.3 });
  }
  return out;
})();

function buildRubble(): THREE.BufferGeometry {
  const parts = RUBBLE.map((r) => {
    const g = new THREE.BoxGeometry(r.w, r.h, r.d, 2, 2, 2).toNonIndexed();
    g.rotateZ(r.rz); g.rotateY(r.ry); g.translate(r.x, r.y + r.h / 2, r.z);
    return g;
  });
  const geo = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    shade(colors, i, Math.max(0, n.dot(SUN)) * 0.6, 0.24);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* gate obelisks — the camera flies between this pair at the very start */
type ObeliskCfg = { x: number; z: number; h: number };
const OBELISKS: ObeliskCfg[] = [
  { x: -8.5, z: 4.5, h: 9.5 },
  { x: 8.5, z: 4.5, h: 9.5 },
];
function buildObelisks(): THREE.BufferGeometry {
  const parts = OBELISKS.map((o) => {
    const w = o.h * 0.11;
    const base = taperedBox(w * 2.2, o.h * 0.06, w * 2.2, 0.85, 0.85, -0.15, o.x, o.z);
    const shaft = taperedBox(w, o.h * 0.84, w, 0.64, 0.64, o.h * 0.06 - 0.15, o.x, o.z);
    const tip = new THREE.ConeGeometry(w * 0.64 * Math.SQRT1_2 * 1.02, o.h * 0.1, 4, 1).toNonIndexed();
    tip.rotateY(Math.PI / 4); tip.translate(o.x, o.h * 0.9 + o.h * 0.05 - 0.15, o.z);
    return mergeGeometries([base, shaft, tip], false)!;
  });
  const geo = mergeGeometries(parts, false)!;
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    const t = pos.getY(i) / 9.5;
    // the gilded pyramidion catches the sun
    shade(colors, i, Math.max(0, n.dot(SUN)) * 0.6, 0.24, t > 0.88 ? 0.35 : t * 0.08);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* oasis — a pool of dark water ringed by low-poly date palms, off to the
   east where the orbit never passes (≥ 5 units clear of the path) */
const OASIS = { x: 24, z: -12, r: 3.2 };
function buildPalms(): { fronds: THREE.BufferGeometry; trunks: THREE.BufferGeometry } {
  const rnd = mulberry(1234);
  const trunkParts: THREE.BufferGeometry[] = [];
  const frondParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rnd() * 0.5, R = OASIS.r + 0.6 + rnd() * 2.2;
    const x = OASIS.x + Math.cos(a) * R, z = OASIS.z + Math.sin(a) * R;
    const h = 3.2 + rnd() * 2.6, lean = (rnd() - 0.5) * 0.35, leanDir = rnd() * Math.PI * 2;
    // trunk: stacked tapered rings, each ring nudged along the lean → a gentle curve
    const segs = 7;
    for (let sgm = 0; sgm < segs; sgm++) {
      const t0 = sgm / segs, t1 = (sgm + 1) / segs;
      const r0 = 0.22 * (1 - t0 * 0.45);
      const cyl = new THREE.CylinderGeometry(r0 * (1 - 0.45 / segs), r0, h / segs, 6, 1).toNonIndexed();
      const off = Math.pow(t0, 1.6) * lean * h;
      cyl.translate(x + Math.cos(leanDir) * off, -0.15 + (t0 + t1) / 2 * h, z + Math.sin(leanDir) * off);
      trunkParts.push(cyl);
    }
    const topOff = lean * h;
    const tx = x + Math.cos(leanDir) * topOff, tz = z + Math.sin(leanDir) * topOff, ty = -0.15 + h;
    // fronds: 8 drooping blades fanning from the crown
    for (let f = 0; f < 8; f++) {
      const fa = (f / 8) * Math.PI * 2 + rnd() * 0.4;
      const len = 1.9 + rnd() * 0.7;
      const blade = new THREE.PlaneGeometry(len, 0.55, 6, 1).toNonIndexed();
      const bp = blade.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bp.count; i++) {
        const u = (bp.getX(i) + len / 2) / len; // 0 crown → 1 tip
        bp.setX(i, u * len);
        bp.setY(i, bp.getY(i) * (1 - u * 0.7) + 0.35 * Math.sin(u * Math.PI) - u * u * 1.1); // arch up then droop
      }
      blade.rotateY(-fa);
      blade.translate(tx, ty, tz);
      frondParts.push(blade);
    }
  }
  const trunks = mergeGeometries(trunkParts, false)!;
  const fronds = mergeGeometries(frondParts, false)!;
  for (const g of [trunks, fronds]) {
    g.computeVertexNormals();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const n = new THREE.Vector3();
    const isFrond = g === fronds;
    for (let i = 0; i < pos.count; i++) {
      n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
      const lit = Math.abs(n.dot(SUN));
      const l = isFrond ? 0.14 + lit * 0.42 : 0.16 + lit * 0.3;
      // fronds: deep desert green; trunks: dark fibrous brown
      colors[i * 3] = l * (isFrond ? 0.46 : 0.62);
      colors[i * 3 + 1] = l * (isFrond ? 0.66 : 0.5);
      colors[i * 3 + 2] = l * (isFrond ? 0.3 : 0.36);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  return { fronds, trunks };
}

/* camel caravan — a line of silhouettes cresting a far dune, walking west */
function buildCaravan(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = mulberry(4321);
  const N = 7;
  for (let k = 0; k < N; k++) {
    const cx = -26 + k * 3.1 + rnd() * 0.6, cz = -40 + Math.sin(k * 0.9) * 1.2;
    const S = 0.9 + rnd() * 0.2;
    const body = new THREE.BoxGeometry(2.2 * S, 0.9 * S, 0.7 * S).toNonIndexed();
    body.translate(cx, 1.55 * S, cz);
    const hump = new THREE.SphereGeometry(0.5 * S, 6, 5).toNonIndexed();
    hump.scale(1.1, 1, 0.8); hump.translate(cx + 0.1 * S, 2.1 * S, cz);
    const neck = new THREE.BoxGeometry(0.35 * S, 1.3 * S, 0.35 * S).toNonIndexed();
    neck.rotateZ(0.55); neck.translate(cx - 1.25 * S, 2.2 * S, cz);
    const head = new THREE.BoxGeometry(0.6 * S, 0.32 * S, 0.3 * S).toNonIndexed();
    head.translate(cx - 1.75 * S, 2.75 * S, cz);
    parts.push(body, hump, neck, head);
    for (const [lx, lz] of [[-0.7, -0.22], [-0.7, 0.22], [0.7, -0.22], [0.7, 0.22]]) {
      const leg = new THREE.BoxGeometry(0.2 * S, 1.2 * S, 0.2 * S).toNonIndexed();
      leg.rotateZ((rnd() - 0.5) * 0.4); leg.translate(cx + lx * S, 0.6 * S, cz + lz * S);
      parts.push(leg);
    }
    if (k % 2 === 1) { // rider
      const rider = new THREE.BoxGeometry(0.4 * S, 0.7 * S, 0.4 * S).toNonIndexed();
      rider.translate(cx + 0.35 * S, 2.75 * S, cz);
      parts.push(rider);
    }
  }
  const geo = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { colors[i * 3] = 0.16; colors[i * 3 + 1] = 0.13; colors[i * 3 + 2] = 0.12; } // backlit silhouettes
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildPyramid(cfg: PyramidCfg): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(cfg.base / Math.SQRT2, cfg.h, 4, 1, false).toNonIndexed();
  g.rotateY(Math.PI / 4 + cfg.rot);
  g.translate(0, cfg.h / 2 - 0.3, 0);
  g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    const lit = Math.max(0, n.dot(SUN));
    const t = pos.getY(i) / cfg.h;
    shade(colors, i, lit * 0.62, 0.26, t * 0.1);
    // stone courses: stretch v so the sand grain reads as horizontal blocks
    uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * cfg.h * 0.5);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/* a box whose top face is scaled in (trapezoid prism) — the basic block of
   carved-stone forms: chests, headdresses, plinths */
function taperedBox(w: number, h: number, d: number, topX: number, topZ: number, y0: number, cx = 0, cz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + h / 2) / h; // 0 bottom → 1 top
    pos.setX(i, pos.getX(i) * (1 + (topX - 1) * t) + cx);
    pos.setZ(i, pos.getZ(i) * (1 + (topZ - 1) * t) + cz);
    pos.setY(i, pos.getY(i) + h / 2 + y0);
  }
  return g.toNonIndexed();
}

/* ── procedural Sphinx: a Giza-style recumbent lion body with a human head
   and nemes headdress, assembled from tapered stone blocks, then wind-eroded
   with seeded noise and sun-shaded into vertex colours. Local +z is the face.
   Footprint stays within 1.7 × r so the camera-corridor bound still holds. ── */
function buildPeak(cfg: PeakCfg): THREE.BufferGeometry {
  const L = cfg.r * 3.4; // nose → tail
  const H = cfg.h * 0.42; // ground → crown
  const W = H * 0.9 * cfg.squash; // shoulder width
  const parts: THREE.BufferGeometry[] = [];

  // plinth — the bedrock the statue was carved out of
  parts.push(taperedBox(W * 1.25, H * 0.07, L * 1.06, 0.94, 0.98, 0));
  // hind body (rump + haunches), slightly lower than the chest
  parts.push(taperedBox(W * 0.95, H * 0.46, L * 0.5, 0.78, 0.9, H * 0.07, 0, -L * 0.22));
  parts.push(taperedBox(W * 1.05, H * 0.3, L * 0.22, 0.7, 0.8, H * 0.07, 0, -L * 0.36)); // haunches
  // back / spine ridge
  parts.push(taperedBox(W * 0.7, H * 0.08, L * 0.42, 0.6, 0.95, H * 0.52, 0, -L * 0.14));
  // chest — tall block the head sits on
  parts.push(taperedBox(W * 0.92, H * 0.6, L * 0.3, 0.8, 0.8, H * 0.07, 0, L * 0.1));
  // forelegs + paws reaching forward
  for (const sx of [-1, 1]) {
    parts.push(taperedBox(W * 0.26, H * 0.2, L * 0.46, 0.85, 1, H * 0.07, sx * W * 0.33, L * 0.28));
    parts.push(taperedBox(W * 0.3, H * 0.12, L * 0.12, 0.8, 0.7, H * 0.07, sx * W * 0.33, L * 0.5)); // toes
  }
  // neck
  parts.push(taperedBox(W * 0.34, H * 0.08, W * 0.3, 1, 1, H * 0.64, 0, L * 0.15));
  // nemes headdress — sits BEHIND the face and flares down onto the shoulders
  const FZ = L * 0.17; // face-block centre (z); the face plane is at FZ + depth/2
  parts.push(taperedBox(W * 0.96, H * 0.3, W * 0.4, 0.5, 0.6, H * 0.68, 0, FZ - W * 0.2));
  // nemes lappets — the two flaps hanging beside the face onto the chest
  for (const sx of [-1, 1]) {
    parts.push(taperedBox(W * 0.13, H * 0.28, W * 0.18, 1.1, 0.9, H * 0.58, sx * W * 0.27, FZ + W * 0.02));
  }
  // head / face block — a clean, un-eroded block so the features read
  const FD = W * 0.3; // face depth
  parts.push(taperedBox(W * 0.38, H * 0.3, FD, 0.9, 0.85, H * 0.7, 0, FZ));
  const FACE = FZ + FD / 2; // z of the face plane
  // brow ridge across the top of the face
  parts.push(taperedBox(W * 0.36, H * 0.025, W * 0.05, 1, 1, H * 0.885, 0, FACE + W * 0.01));
  // eye sockets: shallow dark plates set just proud of the face plane (rendered dark below)
  for (const sx of [-1, 1]) parts.push(taperedBox(W * 0.1, H * 0.032, W * 0.02, 1, 1, H * 0.845, sx * W * 0.095, FACE + W * 0.005));
  // nose: a tapered wedge standing off the face
  parts.push(taperedBox(W * 0.07, H * 0.085, W * 0.06, 0.7, 1.6, H * 0.76, 0, FACE + W * 0.015));
  // lips
  parts.push(taperedBox(W * 0.14, H * 0.02, W * 0.02, 1, 1, H * 0.735, 0, FACE + W * 0.006));
  // brow band / crown cap over the nemes
  parts.push(taperedBox(W * 0.52, H * 0.05, W * 0.44, 0.75, 0.8, H * 0.985, 0, FZ - W * 0.08));
  // beard — hangs from the chin, slightly forward
  parts.push(taperedBox(W * 0.09, H * 0.13, W * 0.07, 0.8, 0.8, H * 0.6, 0, FACE + W * 0.005));

  const geo = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  const pos = geo.attributes.position as THREE.BufferAttribute;

  // deterministic per-statue randomness — millennia of wind erosion
  let seed = cfg.seed * 7919 + 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ph = Array.from({ length: 4 }, () => rnd() * Math.PI * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n =
      Math.sin(x * 2.1 + ph[0]) * Math.sin(z * 1.7 + ph[1]) * 0.5 +
      Math.sin(y * 3.3 + x * 1.1 + ph[2]) * 0.3 +
      Math.sin(z * 4.9 + y * 2.2 + ph[3]) * 0.2;
    const faceZone = y > H * 0.58 && z > L * 0.17 - W * 0.05 ? 0 : 1; // keep the face un-eroded
    const e = H * 0.035 * n * faceZone;
    pos.setX(i, x + e * Math.sign(x || 1));
    pos.setY(i, y + e * 0.6);
    pos.setZ(i, z + e * 0.4);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;

  // painted-sun shading baked into vertex colours: lit from the front-left,
  // brighter toward the crown, grey-scale so the ramped map carries the sand
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / H;
    n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
    const lit = Math.max(0, n.dot(SUN)) * 0.66;
    let extra = 0;
    // nemes stripes: alternating bands on the headdress flanks
    if (y > H * 0.66 && Math.abs(x) > W * 0.17 && z < L * 0.16) extra += (Math.sin(y * (22 / H) + Math.abs(x) * 3) > 0 ? 0.08 : -0.08);
    // carved features: eye sockets read dark, the brow throws a shadow line
    if (z > L * 0.17 + W * 0.12 && Math.abs(x) < W * 0.2) {
      const eye = Math.exp(-Math.pow((Math.abs(x) - W * 0.095) / (W * 0.05), 2)) * Math.exp(-Math.pow((y - H * 0.86) / (H * 0.022), 2));
      const brow = Math.exp(-Math.pow((y - H * 0.878) / (H * 0.012), 2)) * 0.5;
      const lip = Math.exp(-Math.pow(x / (W * 0.07), 2)) * Math.exp(-Math.pow((y - H * 0.732) / (H * 0.01), 2)) * 0.5;
      extra -= (eye * 0.55 + brow * 0.2 + lip * 0.25);
    }
    // sand drifted up against the flanks — the lower body reads half-buried
    const drift = THREE.MathUtils.smoothstep(t, 0.22, 0.0) * 0.1;
    shade(colors, i, lit, 0.22 + 0.34 * t, extra + drift);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* ── layered distant ridgelines: jagged silhouette curtains that replace the
   flat horizon band. Each ring is a thin strip whose TOP edge is 1-D ridged
   noise (abs-sine octaves over the angle), modulated by a slow angular
   envelope so some sectors read as tall massifs and others as low foothills,
   with the whole ring wobbled off-circle so distance-to-camera varies per
   angle. Feet sink below the ground plane; fog + a per-layer tint grade the
   far rings toward the horizon colour — so they stack into a real receding
   range with parallax across the 300° sweep, not a level painted wall. ───── */
type RidgeCfg = { rad: number; segs: number; baseH: number; ampH: number; seed: number; tint: number };

/* concentric to the point the camera orbits (the hero massif) so the rings
   frame the sweep; radii sit BEYOND every peak (peaks live within r≈31). */
const RIDGES: RidgeCfg[] = [
  { rad: 48, segs: 256, baseH: 1.2, ampH: 5.5, seed: 211, tint: 0.92 },
  { rad: 66, segs: 224, baseH: 1.8, ampH: 7.5, seed: 233, tint: 0.74 },
  { rad: 86, segs: 192, baseH: 2.4, ampH: 9.5, seed: 251, tint: 0.56 },
];

function buildRidge(cfg: RidgeCfg): THREE.BufferGeometry {
  let seed = cfg.seed * 7919 + 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fr = [2, 3, 5, 9, 17]; // low freqs → long dune swells, high → small crests
  const am = [1, 0.6, 0.32, 0.14, 0.06];
  const NORM = am.reduce((a, b) => a + b, 0);
  const ph = fr.map(() => rnd() * Math.PI * 2);
  const eph = rnd() * Math.PI * 2; // envelope phase — which sectors tower
  const wph = [rnd() * Math.PI * 2, rnd() * Math.PI * 2]; // radial-wobble phases
  const bottomY = -4; // sink the feet below the y≈-0.02 ground plane

  const N = cfg.segs;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    let n = 0;
    for (let k = 0; k < fr.length; k++) n += (0.5 + 0.5 * Math.sin(a * fr[k] + ph[k])) * am[k];
    n = Math.min(1, n / NORM);
    const env = 0.5 + 0.5 * Math.sin(a * 0.7 + eph); // tall-massif vs foothill sectors
    const top = cfg.baseH + n * cfg.ampH * (0.35 + 0.65 * env);
    // wobble the radius off-circle → distance-to-camera varies per angle → parallax
    const R = cfg.rad * (1 + 0.07 * Math.sin(a * 2 + wph[0]) + 0.035 * Math.sin(a * 5 + wph[1]));
    const x = MASSIF.x + Math.sin(a) * R;
    const z = MASSIF.z + Math.cos(a) * R;
    pos.push(x, bottomY, z, x, top, z);
    const crest = Math.min(0.7, 0.28 + 0.5 * n); // cap crest → controlled bloom
    const base = 0.1;
    col.push(base, base, base, crest, crest, crest);
    uv.push((i / N) * 8, 0, (i / N) * 8, 1); // u wraps 8× → strokes at reference scale
  }
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const a0 = i * 2, a1 = i * 2 + 1, b0 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
    idx.push(a0, b0, a1, a1, b0, b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g; // no normals — MeshBasicMaterial is unlit
}

/* ── tilt-shift depth-of-field post pass (sharp centre, soft edges) ────── */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uAmount: { value: 0.55 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uAmount, uTime;
    void main() {
      // heat shimmer: a faint wobble that lives only in the horizon band
      float horizon = exp(-pow((vUv.y - 0.42) / 0.09, 2.0));
      vec2 uv = vUv + vec2(sin(vUv.y * 140.0 + uTime * 2.1) * 0.0012, sin(vUv.x * 90.0 + uTime * 1.7) * 0.0008) * horizon;
      vec2 c = vec2(0.5, 0.47);
      vec2 d2 = vec2((uv.x - c.x) * 1.35, uv.y - c.y);
      float blur = smoothstep(0.13, 0.72, length(d2)) * uAmount;
      vec2 r = uTexel * (blur * 13.0);
      vec4 col = texture2D(tDiffuse, uv) * 0.2270;
      col += (texture2D(tDiffuse, uv + vec2( 1.0,  0.0) * r) + texture2D(tDiffuse, uv - vec2( 1.0,  0.0) * r)) * 0.1531;
      col += (texture2D(tDiffuse, uv + vec2( 0.0,  1.0) * r) + texture2D(tDiffuse, uv - vec2( 0.0,  1.0) * r)) * 0.1531;
      col += (texture2D(tDiffuse, uv + vec2( 0.7,  0.7) * r) + texture2D(tDiffuse, uv - vec2( 0.7,  0.7) * r)) * 0.0805;
      col += (texture2D(tDiffuse, uv + vec2( 0.7, -0.7) * r) + texture2D(tDiffuse, uv - vec2( 0.7, -0.7) * r)) * 0.0805;
      // golden-hour grade: lift warmth in the highlights, keep shadows cool, gentle S-curve.
      // Clamp first — bloom hands us HDR values and the curve flips >1 channels negative.
      col.rgb = clamp(col.rgb, 0.0, 1.0);
      float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
      col.rgb = mix(col.rgb, col.rgb * vec3(1.06, 0.98, 0.9), smoothstep(0.35, 0.9, lum));
      col.rgb = mix(col.rgb, col.rgb * vec3(0.94, 0.96, 1.08), 1.0 - smoothstep(0.1, 0.4, lum));
      col.rgb = col.rgb * col.rgb * (3.0 - 2.0 * col.rgb) * 0.25 + col.rgb * 0.75;
      // soft vignette
      col.rgb *= 1.0 - smoothstep(0.55, 1.15, length((vUv - 0.5) * vec2(1.2, 1.0))) * 0.42;
      gl_FragColor = col;
    }
  `,
};

function Effects() {
  const { gl, scene, camera, size } = useThree();
  const bits = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    // gentle bloom — only the brightest sand-gold highlights glow (high threshold)
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 0.9);
    composer.addPass(bloom);
    const tilt = new ShaderPass(TiltShiftShader);
    composer.addPass(tilt);
    return { composer, tilt, bloom };
  }, [gl, scene, camera]);

  useEffect(() => {
    const pr = gl.getPixelRatio();
    bits.composer.setPixelRatio(pr);
    bits.composer.setSize(size.width, size.height);
    // half-res bloom — much cheaper (keeps the scroll smooth), still glows fine
    bits.bloom.setSize(Math.max(1, Math.round(size.width / 2)), Math.max(1, Math.round(size.height / 2)));
    (bits.tilt.uniforms.uTexel.value as THREE.Vector2).set(1 / (size.width * pr), 1 / (size.height * pr));
  }, [bits, gl, size]);

  useEffect(() => () => bits.composer.dispose(), [bits]);

  useFrame((state) => {
    bits.tilt.uniforms.uTime.value = state.clock.elapsedTime;
    bits.composer.render();
  }, 1);

  return null;
}

/* ── full-screen clip-space quads: sky gradient behind, dusk dim in front ─ */
const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function SkyAndDim({ smooth }: { smooth: RefN }) {
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform vec3 uTop, uBot;
          uniform float uAspect, uSun;
          void main() {
            vec3 col = mix(uBot, uTop, smoothstep(0.12, 0.9, vUv.y));
            // low desert sun: hot core + wide warm halo hugging the horizon
            vec2 d = (vUv - vec2(0.64, 0.24)) * vec2(uAspect, 1.0);
            float r = length(d);
            float core = smoothstep(0.075, 0.055, r);
            float halo = exp(-r * r * 9.0) * 0.55 + exp(-r * r * 1.8) * 0.22;
            vec3 sunCol = vec3(1.0, 0.86, 0.58);
            col += (sunCol * core * 1.1 + sunCol * halo) * uSun;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        uniforms: { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uAspect: { value: 1 }, uSun: { value: 1 } },
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const dim = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform float uOpacity;
          void main() { gl_FragColor = vec4(vec3(0.09, 0.07, 0.05), uOpacity); }
        `,
        uniforms: { uOpacity: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useFrame((state) => {
    const s = smooth.current ?? 0;
    const g = skyAt(s);
    (sky.uniforms.uTop.value as THREE.Color).setRGB(g.top[0], g.top[1], g.top[2]);
    (sky.uniforms.uBot.value as THREE.Color).setRGB(g.bot[0], g.bot[1], g.bot[2]);
    sky.uniforms.uAspect.value = state.size.width / state.size.height;
    // the sun sinks as the journey dims toward dusk
    sky.uniforms.uSun.value = (1 - g.dim * 4) * (1 - 0.6 * band(s, 0.3, 0.55, 0.08)); // the storm veils the sun
    // dusk grade OR the inter-chapter blackout — whichever is deeper
    dim.uniforms.uOpacity.value = Math.max(g.dim, blackoutAt(s));
  });

  return (
    <>
      <mesh renderOrder={-10} frustumCulled={false} material={sky}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh renderOrder={990} frustumCulled={false} material={dim}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </>
  );
}

/* ── camera flight path, scrubbed by scroll, nudged by pointer ─────────── */
/* the flight path — approach the hero peak, then sweep ~300° AROUND it
   (vvvhound-style: directed, circling one mountain, not a slalom) */
const POS_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 4.0, 9),
  new THREE.Vector3(-1.5, 3.6, 0),
  new THREE.Vector3(-5, 3.3, -7),
  new THREE.Vector3(-10.5, 3.0, -16),
  new THREE.Vector3(-6, 2.8, -25.5),
  new THREE.Vector3(2.5, 2.6, -29.5),
  new THREE.Vector3(11, 2.5, -25),
  new THREE.Vector3(15, 2.45, -16),
  new THREE.Vector3(13.5, 2.4, -8),
]);
/* where the gaze locks during the sweep — the hero peak */
const PEAK_LOOK = new THREE.Vector3(2.5, 3.2, -16);

function Rig({ smooth, pointer }: { smooth: RefN; pointer: Ref2 }) {
  const { camera } = useThree();
  const pos = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const peak = useMemo(() => new THREE.Vector3(), []);
  const soft = useRef({ x: 0, y: 0 });

  useFrame(() => {
    const sA = chapterA(smooth.current ?? 0);
    POS_CURVE.getPoint(sA, pos);
    POS_CURVE.getPoint(Math.min(1, sA + 0.07), ahead);
    ahead.y += 0.15;
    // approach: look down the path; sweep: lock the gaze on the hero peak
    const lockOn = THREE.MathUtils.smoothstep(sA, 0.14, 0.32);
    peak.set(PEAK_LOOK.x, PEAK_LOOK.y - sA * 1.3, PEAK_LOOK.z);
    look.lerpVectors(ahead, peak, lockOn);
    const px = pointer.current?.x ?? 0;
    const py = pointer.current?.y ?? 0;
    soft.current.x += (px - soft.current.x) * 0.04;
    soft.current.y += (py - soft.current.y) * 0.04;
    const bank = THREE.MathUtils.clamp((ahead.x - pos.x) * -0.12 - soft.current.x * 0.04, -0.2, 0.2);
    camera.up.set(Math.sin(bank), Math.cos(bank), 0);
    camera.position.set(pos.x + soft.current.x * 0.5, pos.y - soft.current.y * 0.25, pos.z);
    camera.lookAt(look.x + soft.current.x * 1.1, look.y - soft.current.y * 0.7, look.z);
  });
  return null;
}

/* ── the painted world: peaks, ground, horizon ring ────────────────────── */
function World() {
  const { peakMeshes, pyramidMeshes, duneGeo, groundMat, ridgeMeshes, rubbleGeo, rubbleMat, obeliskGeo, palms, caravanGeo, flatMat, poolMat } = useMemo(() => {
    const sand = makeSandTexture(1, 0.12); // wind-rippled dune sand
    const stone = makeSandTexture(2, 0.02); // weathered limestone — grain, no ripples

    const peakMeshes = [...PEAKS, ...AVENUE].map((cfg) => {
      const geo = buildPeak(cfg);
      const map = stone.clone();
      map.needsUpdate = true;
      map.repeat.set(0.3, 0.3); // broad weathered-stone grain per block face
      const mat = new THREE.MeshBasicMaterial({ map, fog: true, vertexColors: true });
      return { cfg, geo, mat };
    });

    const pyramidMeshes = PYRAMIDS.map((cfg) => {
      const geo = buildPyramid(cfg);
      const map = stone.clone();
      map.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map, fog: true, vertexColors: true });
      return { cfg, geo, mat };
    });

    const rubbleGeo = buildRubble();
    const obeliskGeo = buildObelisks();
    const palms = buildPalms();
    const caravanGeo = buildCaravan();
    const flatMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide });
    // still water: a dark mirror-tinted disc that catches the sky colour via fog
    const poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.09, 0.16, 0.19), fog: true, transparent: true, opacity: 0.92 });
    const rubbleMat = new THREE.MeshBasicMaterial({ map: stone, fog: true, vertexColors: true });

    // the dune sea — sharp crescent crests, sun-shaded, wind-rippled sand
    const duneGeo = buildDunes();
    const groundMat = new THREE.MeshBasicMaterial({ map: sand, vertexColors: true, fog: true });

    // distant range: three concentric soft dune swells, fogged + tinted so far
    // layers recede into aerial perspective
    const ridgeMeshes = RIDGES.map((rc) => {
      const geo = buildRidge(rc);
      const map = sand.clone();
      map.needsUpdate = true;
      map.repeat.set(3, 0.5);
      const mat = new THREE.MeshBasicMaterial({
        map,
        vertexColors: true,
        fog: true,
        color: new THREE.Color(rc.tint, rc.tint, rc.tint), // far layers desaturate toward fog
        side: THREE.DoubleSide, // the sweep views the ring from every angle
      });
      return { geo, mat };
    });

    return { peakMeshes, pyramidMeshes, duneGeo, groundMat, ridgeMeshes, rubbleGeo, rubbleMat, obeliskGeo, palms, caravanGeo, flatMat, poolMat };
  }, []);

  return (
    <>
      {/* sphinx statues */}
      {peakMeshes.map(({ cfg, geo, mat }, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={mat}
          position={[cfg.x, -0.15, cfg.z]}
          rotation={[0, cfg.rot, 0]}
        />
      ))}
      {/* pyramids on the horizon */}
      {pyramidMeshes.map(({ cfg, geo, mat }, i) => (
        <mesh key={`pyr-${i}`} geometry={geo} material={mat} position={[cfg.x, 0, cfg.z]} />
      ))}
      {/* gate obelisks, oasis, caravan */}
      <mesh geometry={obeliskGeo} material={rubbleMat} />
      <mesh geometry={palms.trunks} material={flatMat} />
      <mesh geometry={palms.fronds} material={flatMat} />
      <mesh material={poolMat} rotation={[-Math.PI / 2, 0, 0]} position={[OASIS.x, -0.5, OASIS.z]}>
        <circleGeometry args={[OASIS.r, 40]} />
      </mesh>
      <Caravan geo={caravanGeo} mat={flatMat} />
      {/* fallen masonry around the hero */}
      <mesh geometry={rubbleGeo} material={rubbleMat} />
      {/* the dune sea */}
      <mesh geometry={duneGeo} material={groundMat} position={[0, -0.02, -18]} />
      {/* far horizon: layered dune swells receding into fog */}
      {ridgeMeshes.map(({ geo, mat }, i) => (
        <mesh key={`ridge-${i}`} geometry={geo} material={mat} renderOrder={-3} frustumCulled={false} />
      ))}
    </>
  );
}

/* ── the caravan plods west along its far dune, wrapping back unseen ──── */
function Caravan({ geo, mat }: { geo: THREE.BufferGeometry; mat: THREE.Material }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // 0.35 u/s west; the loop is 60u long so the wrap happens well outside the frame
    ref.current.position.x = -((t * 0.35) % 60) + 30;
    ref.current.position.y = Math.sin(t * 1.7) * 0.03; // the faintest gait bob
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo} material={mat} />
    </group>
  );
}

/* ── the hero Sphinx's eyes: two glow sprites in the eye sockets. Dim through
   the sandstorm, they wake as it clears — the gatekeeper noticing you. ───── */
function SphinxEyes({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const tex = useMemo(makePuffTexture, []);
  const mats = useMemo(() => [0, 1].map(() => new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1.0, 0.8, 0.45), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })), [tex]);
  // eye sockets in hero-local space (see buildPeak: W/H/L for r=3.6, h=13.5, squash=0.85), rotated by rot=0.3
  const positions = useMemo(() => {
    const hero = PEAKS[0];
    const L = hero.r * 3.4, H = hero.h * 0.42, W = H * 0.9 * hero.squash;
    const FACE = L * 0.17 + (W * 0.3) / 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hero.rot);
    return [-1, 1].map((sx) => new THREE.Vector3(sx * W * 0.095, H * 0.845, FACE + W * 0.06).applyQuaternion(q).add(new THREE.Vector3(hero.x, -0.15, hero.z)));
  }, []);
  const ref = useRef<THREE.Group>(null!);
  useFrame((state) => {
    const s = smooth.current ?? 0;
    const t = animate ? state.clock.elapsedTime : 0;
    const awake = 0.18 + 0.82 * band(s, 0.55, 0.72, 0.06); // wakes as the storm passes
    const flicker = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
    ref.current.children.forEach((c, i) => {
      const spr = c as THREE.Sprite;
      spr.position.copy(positions[i]);
      spr.scale.setScalar(0.55 + 0.35 * awake);
      (spr.material as THREE.SpriteMaterial).opacity = awake * flicker * 0.9;
    });
  });
  return (
    <group ref={ref}>
      {mats.map((m, i) => <sprite key={i} material={m} renderOrder={520} />)}
    </group>
  );
}

/* ── drifting sand-haze sprites — low sheets of blown sand ─────────────── */
/** Soft radial puff drawn at runtime — always smooth, no asset surprises. */
function makePuffTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function Mist({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const fogTex = useMemo(makePuffTexture, []);
  const group = useRef<THREE.Group>(null!);

  const puffs = useMemo(() => {
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 10 }, (_, i) => ({
      x: (rnd() - 0.5) * 26,
      y: 0.2 + rnd() * 1.4,
      z: -6 - rnd() * 32,
      sc: 9 + rnd() * 12,
      v: 0.12 + rnd() * 0.25,
      ph: rnd() * Math.PI * 2,
      base: 0.16 + rnd() * 0.2,
    }));
  }, []);

  const materials = useMemo(
    () =>
      puffs.map(
        () =>
          new THREE.SpriteMaterial({
            map: fogTex,
            transparent: true,
            depthWrite: false,
            color: new THREE.Color(0.95, 0.78, 0.42),
            opacity: 0,
          }),
      ),
    [puffs, fogTex],
  );

  const drift = useRef(0); // integrated wind travel — velocity changes stay smooth
  useFrame((state, delta) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    const storm = band(s, 0.3, 0.55, 0.08);
    const boost = 0.55 + 0.5 * band(s, 0.05, 0.85, 0.15) + 1.4 * storm; // haze + the mid-sweep sandstorm
    // wind speed ramps with the storm; integrate it so a speed change never teleports a sheet
    if (animate) drift.current += Math.min(delta, 0.05) * (1.2 + 5.5 * storm);
    group.current.children.forEach((child, i) => {
      const p = puffs[i];
      const spr = child as THREE.Sprite;
      const wind = ((drift.current + p.ph * 7) % 36) - 18; // sheets race east in the storm, wrapping
      spr.position.set(p.x + Math.sin(t * p.v + p.ph) * 1.6 + wind, p.y + Math.sin(t * 0.3 + p.ph) * 0.25, p.z);
      spr.scale.set(p.sc, p.sc * 0.28, 1); // flat sheets of blown sand
      (spr.material as THREE.SpriteMaterial).opacity = p.base * boost;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((_, i) => (
        <sprite key={i} material={materials[i]} renderOrder={500} />
      ))}
    </group>
  );
}

/* ── floating dust/light particles ─────────────────────────────────────── */
function Particles({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    let seed = 999;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // a persistent ambient field — wider + taller volume so faint sand-gold
    // motes drift across EVERY section, not just the mountain moment
    const n = 140;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rnd() - 0.5) * 42;
      arr[i * 3 + 1] = 0.2 + rnd() * 11;
      arr[i * 3 + 2] = 4 - rnd() * 46;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  useFrame((state) => {
    if (!animate) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.03) * 0.05;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.11) * 0.35;
  });

  return (
    <points ref={ref} geometry={geo} renderOrder={400}>
      <pointsMaterial
        size={0.07}
        transparent
        opacity={0.62}
        color={new THREE.Color(0.98, 0.82, 0.48)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/* ── birds ────────────────────────────────────────────────────────────── */
function band(s: number, a: number, b: number, fade: number): number {
  const inN = THREE.MathUtils.smoothstep(s, a - fade, a + fade);
  const outN = 1 - THREE.MathUtils.smoothstep(s, b - fade, b + fade);
  return Math.min(inN, outN);
}



/* ── distant flock — a loose V of tiny gull silhouettes gliding ahead of
   the camera along the route. Small + far reads perfectly (no close-up
   geometry to look wrong). Hidden on the hero; fades in with the journey. ── */
function Flock({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const group = useRef<THREE.Group>(null!);
  const p = useMemo(() => new THREE.Vector3(), []);

  // classic gull "M" chevron: two triangles with a baked dihedral —
  // animating scale.y flaps the wing tips
  const { geo, mat } = useMemo(() => {
    const v = new Float32Array([
      // left wing
      -1, 0.3, -0.12, 0, 0, 0.14, 0, 0, -0.14,
      // right wing
      1, 0.3, -0.12, 0, 0, -0.14, 0, 0, 0.14,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(v, 3));
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.9, 0.84, 0.72),
      transparent: true,
      opacity: 0,
      fog: false,
      side: THREE.DoubleSide,
    });
    return { geo, mat };
  }, []);

  const BIRDS = useMemo(
    () => [
      { o: [0, 0, 0], ph: 0.0, sc: 0.34 },
      { o: [-0.9, 0.18, -0.8], ph: 1.7, sc: 0.3 },
      { o: [0.95, 0.12, -0.9], ph: 3.1, sc: 0.31 },
      { o: [-1.8, 0.34, -1.7], ph: 4.4, sc: 0.27 },
      { o: [1.9, 0.26, -1.8], ph: 5.6, sc: 0.28 },
    ],
    [],
  );

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    const sA = chapterA(s);
    POS_CURVE.getPoint(Math.min(1, sA + 0.13), p);
    // in once the journey starts, thin out toward the night finale
    mat.opacity =
      THREE.MathUtils.smoothstep(s, 0.03, 0.08) * (1 - THREE.MathUtils.smoothstep(s, 0.86, 0.97));
    group.current.children.forEach((child, i) => {
      const b = BIRDS[i];
      child.position.set(
        p.x + b.o[0] + Math.sin(t * 0.5 + b.ph) * 0.25,
        p.y + 1.1 + b.o[1] + Math.sin(t * 1.1 + b.ph) * 0.16,
        p.z + b.o[2],
      );
      const flap = 0.55 + 0.45 * Math.sin(t * 7 + b.ph);
      child.scale.set(b.sc, b.sc * flap, b.sc);
    });
  });

  return (
    <group ref={group}>
      {BIRDS.map((_, i) => (
        <mesh key={i} geometry={geo} material={mat} />
      ))}
    </group>
  );
}

/* ── low foreground haze: fills the near floor with drifting sand-gold fog ─ */
function GroundHaze({ smooth, animate }: { smooth: RefN; animate: boolean }) {
  const tex = useLoader(THREE.TextureLoader, BASE + "SMOKE.webp");
  const group = useRef<THREE.Group>(null!);

  const puffs = useMemo(() => {
    let seed = 7331;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 11 }, () => ({
      x: (rnd() - 0.5) * 32,
      y: -0.4 + rnd() * 1.8,
      z: 3 - rnd() * 28,
      sc: 11 + rnd() * 13,
      v: 0.05 + rnd() * 0.13,
      ph: rnd() * Math.PI * 2,
      base: 0.1 + rnd() * 0.16,
    }));
  }, []);

  const materials = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace;
    return puffs.map(
      () =>
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color(0.88, 0.7, 0.36),
          opacity: 0,
        }),
    );
  }, [puffs, tex]);

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    const s = smooth.current ?? 0;
    // present through chapter A, gone before blackout #1
    const boost = 0.5 + 0.6 * band(s, 0.02, 0.8, 0.12);
    group.current.children.forEach((child, i) => {
      const p = puffs[i];
      const spr = child as THREE.Sprite;
      spr.position.set(p.x + Math.sin(t * p.v + p.ph) * 2.4, p.y + Math.sin(t * 0.2 + p.ph) * 0.22, p.z);
      spr.scale.set(p.sc, p.sc * 0.5, 1);
      (spr.material as THREE.SpriteMaterial).opacity = p.base * boost;
    });
  });

  return (
    <group ref={group}>
      {puffs.map((_, i) => (
        <sprite key={i} material={materials[i]} renderOrder={470} />
      ))}
    </group>
  );
}

/* ── drifting fog bands circling the massif (fog_flow.webp) — depth + never-empty ─ */
function FogRing({ animate }: { animate: boolean }) {
  const tex = useLoader(THREE.TextureLoader, TEX.fogFlow);
  const group = useRef<THREE.Group>(null!);
  const bands = useMemo(() => {
    let seed = 3113;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // a LOW, WIDE valley-fog belt nestled in the gap between the near peaks
    // (r≈31) and the nearest ridgeline (r≈44) — an aerial-perspective layer
    // break that separates foreground from range, not upright panels ringing
    // the hero
    return Array.from({ length: 16 }, (_, i) => ({
      a: (i / 16) * Math.PI * 2,
      rad: 33 + rnd() * 11,
      y: 0.4 + rnd() * 2.4,
      sc: 16 + rnd() * 14,
      v: 0.015 + rnd() * 0.05,
      ph: rnd() * Math.PI * 2,
      base: 0.05 + rnd() * 0.08,
    }));
  }, []);
  const materials = useMemo(() => {
    tex.colorSpace = THREE.NoColorSpace;
    return bands.map(
      () =>
        new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color(0.8, 0.62, 0.3),
          opacity: 0,
        }),
    );
  }, [bands, tex]);
  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    group.current.children.forEach((child, i) => {
      const b = bands[i];
      const spr = child as THREE.Sprite;
      const a = b.a + t * b.v;
      spr.position.set(2.5 + Math.sin(a) * b.rad, b.y + Math.sin(t * 0.15 + b.ph) * 0.4, -16 + Math.cos(a) * b.rad);
      spr.scale.set(b.sc, b.sc * 0.32, 1); // flatter banks — a haze belt, not standing panels
      (spr.material as THREE.SpriteMaterial).opacity = b.base;
    });
  });
  return (
    <group ref={group}>
      {bands.map((_, i) => (
        <sprite key={i} material={materials[i]} renderOrder={450} />
      ))}
    </group>
  );
}

/* ── starfield in the dune-dark sky ─────────────────────────────────────── */
function Stars({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    let seed = 777;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 460;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rnd() - 0.5) * 190;
      arr[i * 3 + 1] = 15 + rnd() * 52; // high band — above the peaks, in the dark sky
      arr[i * 3 + 2] = 24 - rnd() * 130;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);

  useFrame((state) => {
    if (!animate) return;
    const m = ref.current.material as THREE.PointsMaterial;
    m.opacity = 0.72 + Math.sin(state.clock.elapsedTime * 0.6) * 0.16; // slow twinkle
  });

  return (
    <points ref={ref} geometry={geo} renderOrder={-5}>
      <pointsMaterial
        size={0.34}
        transparent
        opacity={0.8}
        color={new THREE.Color(0.96, 0.92, 0.82)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        fog={false}
      />
    </points>
  );
}

/* ── first-frame signal: tells the page the world has actually painted, so the
   preloader can lift onto a live scene instead of a dark void ─────────────── */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const fired = useRef(false);
  const frames = useRef(0);
  useFrame(() => {
    if (fired.current) return;
    // let a couple of frames compose (bloom + tilt-shift render at priority 1)
    if (++frames.current >= 2) {
      fired.current = true;
      onReady?.();
    }
  });
  return null;
}

/* ── scene root: fog grading + everything wired to the smoothed scroll ─── */
function SceneRoot({ scroll, pointer, animate, onReady }: { scroll: RefN; pointer: Ref2; animate: boolean; onReady?: () => void }) {
  const { scene } = useThree();
  const smooth = useRef(0);

  const fog = useMemo(() => new THREE.Fog(new THREE.Color(0.42, 0.31, 0.15), 16, 54), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useFrame(() => {
    const raw = scroll.current ?? 0;
    // demand mode (reduced motion / offscreen) renders single frames on
    // scroll — snap instead of easing so the frame matches the position
    if (animate) smooth.current += (raw - smooth.current) * 0.075;
    else smooth.current = raw;
    const g = skyAt(smooth.current);
    // fog matches the sky's horizon colour exactly → seamless blend
    fog.color.setRGB(g.bot[0], g.bot[1], g.bot[2]);
    // a sandstorm rolls through mid-sweep: fog closes in, then clears
    const storm = band(smooth.current, 0.3, 0.55, 0.08);
    fog.near = 18 - 11 * storm;
    fog.far = 78 - smooth.current * 10 - 40 * storm;
  });

  return (
    <>
      <ReadySignal onReady={onReady} />
      <SkyAndDim smooth={smooth} />
      <Stars animate={animate} />
      <World />
      <SphinxEyes smooth={smooth} animate={animate} />
      <Mist smooth={smooth} animate={animate} />
      <GroundHaze smooth={smooth} animate={animate} />
      <FogRing animate={animate} />
      <Particles animate={animate} />
      <Flock smooth={smooth} animate={animate} />
      <Rig smooth={smooth} pointer={pointer} />
      <Effects />
    </>
  );
}

export default function Diorama({ onReady }: { onReady?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scroll = useRef(0);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const onMove = (e: MouseEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scroll.current = max > 0 ? window.scrollY / max : 0;
      // in demand mode (reduced motion / offscreen) request a frame so the
      // scene still tracks the scroll position; no-op while looping
      invalidate();
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    const el = wrap.current;
    let io: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)), {
        threshold: 0.01,
      });
      io.observe(el);
    }
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io?.disconnect();
    };
  }, []);

  const animate = inView && !reduced;

  return (
    <div className="vx-bg" ref={wrap} aria-hidden="true">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={animate ? "always" : "demand"}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        camera={{ fov: 50, near: 0.1, far: 120, position: [0, 3.3, 4.5] }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0.12, 0.09, 0.06), 1)}
      >
        <Suspense fallback={null}>
          <SceneRoot scroll={scroll} pointer={pointer} animate={animate} onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
