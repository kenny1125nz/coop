import * as THREE from 'three';
import {
  DEFAULT_PARAMS, LUMBER_SIZES, PLYWOOD_SIZES, RIM, createPlan, DOOR_W,
  WALL_PROFILE, profileHeightAt, roofSections, frontOpenings, nestLayout, roostLayout,
} from './coop.js';

const UP = new THREE.Vector3(0, 1, 0);

// A slab spanning `depth` in Z (from outerZ inward) and `thick` in X, with the
// front and back faces having independent bottom/top heights (used for the front
// wall members and its beveled top rail so they meet at the roof angle).
function beveledSlab(C, add, mats, layer, cx, outerZ, depth, thick, y0o, y0i, y1o, y1i) {
  const shape = new THREE.Shape();
  shape.moveTo(0, y0o);
  shape.lineTo(depth, y0i);
  shape.lineTo(depth, y1i);
  shape.lineTo(0, y1o);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  const m = new THREE.Mesh(geo, mats.bracing);
  m.rotation.y = -Math.PI / 2;
  m.position.set(cx + thick / 2, 0, outerZ);
  return add(layer, m);
}

export function makeMaterials() {
  const base = new THREE.MeshStandardMaterial({ color: 0xb98a52, roughness: 0.8 });
  const deck = new THREE.MeshStandardMaterial({ color: 0x9c7a44, roughness: 0.9 });
  const shell = new THREE.MeshStandardMaterial({
    color: 0xd9c39a, roughness: 0.9, transparent: true, opacity: 0.42,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const bracing = new THREE.MeshStandardMaterial({ color: 0xd07a2a, roughness: 0.75 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.8 });
  const poly = new THREE.MeshStandardMaterial({
    color: 0xcfe6f0, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const roofPly = new THREE.MeshStandardMaterial({ color: 0xb08a52, roughness: 0.85 });
  const post = new THREE.MeshStandardMaterial({ color: 0x5c4a32, roughness: 0.9 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.45, metalness: 0.7 });

  return { base, deck, shell, bracing, roof, poly, roofPly, post, strap };
}

export function buildCoop(raw) {
  const p = { ...DEFAULT_PARAMS, ...raw };
  const lumber = LUMBER_SIZES[p.lumber];
  const floorLumber = LUMBER_SIZES[p.floorLumber];
  const floorPly = PLYWOOD_SIZES[p.floorPlywood];
  const wallPly = PLYWOOD_SIZES[p.wallPlywood];
  const thin = lumber.thin;
  const deep = lumber.deep;
  const floorThin = floorLumber.thin;
  const floorDeep = floorLumber.deep;
  const mats = makeMaterials();

  const root = new THREE.Group();
  root.name = 'coop';

  const floorTopY = p.floorHeight;
  const wallBotY = floorTopY;
  const profile = WALL_PROFILE;
  const frontH = profile[0].h;
  const backH = profile[profile.length - 1].h;

  let currentRef = null;
  const setRef = (r) => { currentRef = r; };

  const add = (layer, mesh) => {
    mesh.userData.layer = layer;
    if (currentRef && !mesh.userData.ref) mesh.userData.ref = currentRef;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const box = (layer, mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return add(layer, m);
  };
  const slopedBeam = (layer, mat, p1, p2, depth, thinSize, offsetY = 0) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const xAxis = dir.clone().normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, UP);
    if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1);
    zAxis.normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, depth, thinSize), mat);
    mid.addScaledVector(yAxis, offsetY);
    m.position.copy(mid);
    const mtx = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    m.quaternion.setFromRotationMatrix(mtx);
    return add(layer, m);
  };
  const corrugated = (layer, mat, p1, p2, width, amplitude, period) => {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const segs = Math.max(2, Math.round(width / period));
    const geo = new THREE.PlaneGeometry(width, len, segs, 1);
    const posAttr = geo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      posAttr.setZ(i, amplitude * Math.sin((x / period) * Math.PI * 2));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    const xAxis = new THREE.Vector3(1, 0, 0);
    const yAxis = dir.clone().normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    const mtx = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    m.quaternion.setFromRotationMatrix(mtx);
    m.position.copy(p1).addScaledVector(dir, 0.5);
    return add(layer, m);
  };

  function L() {
    const xSpacing = p.width / Math.max(1, p.xBays);
    const zSpacing = p.depth / Math.max(1, p.zBays);
    return { p, lumber, floorLumber, floorPly, wallPly, thin, deep, floorThin, floorDeep, mats, floorTopY, wallBotY, profile, frontH, backH, xSpacing, zSpacing, setRef };
  }

  buildBaseGeo({ ...L(), root, add, box });
  buildFloorGeo({ ...L(), root, add, box });
  buildFloorStrapsGeo({ ...L(), root, add, box, slopedBeam });
  buildWallsGeo({ ...L(), root, add, box, slopedBeam });
  buildRoofGeo({ ...L(), root, add, box, slopedBeam, corrugated });
  buildNestBoxesGeo({ ...L(), root, add, box });
  buildRoostingBarsGeo({ ...L(), root, add, box });
  buildStepsGeo({ ...L(), root, add, box, slopedBeam });

  const plan = createPlan(raw);
  return { group: root, parts: plan.parts, summary: plan };
}

// ---------------------------------------------------------------- Base + floor
function buildBaseGeo(C) {
  const { p, box, mats, floorThin, floorDeep, floorTopY } = C;
  const W = p.width;
  const D = p.depth;
  const deckBottom = floorTopY - C.floorPly.thick;
  const frameBot = deckBottom - floorDeep;
  const midY = frameBot + floorDeep / 2;

  C.setRef('Rim board (front/back)');
  box('base', mats.base, W, floorDeep, floorThin, 0, midY, -D / 2 + floorThin / 2);
  box('base', mats.base, W, floorDeep, floorThin, 0, midY, D / 2 - floorThin / 2);

  C.setRef('Rim board (sides)');
  box('base', mats.base, floorThin, floorDeep, D - 2 * floorThin, -W / 2 + floorThin / 2, midY, 0);
  box('base', mats.base, floorThin, floorDeep, D - 2 * floorThin, W / 2 - floorThin / 2, midY, 0);

  C.setRef('Floor support batten');
  for (let x = C.xSpacing; x < W - floorThin; x += C.xSpacing) {
    box('base', mats.base, floorThin, floorDeep, D - 2 * floorThin, x - W / 2, midY, 0);
  }

  if (p.floorHeight > 0) {
    C.setRef('Support post (9×9 cm)');
    const postH = floorTopY - floorDeep - C.floorPly.thick;
    const halfPost = 4.5;
    const xs = W > 180 ? [-W / 2 + halfPost, -W / 4, W / 4, W / 2 - halfPost] : [-W / 2 + halfPost, W / 2 - halfPost];
    const zs = D > 120 ? [-D / 2 + halfPost, 0, D / 2 - halfPost] : [-D / 2 + halfPost, D / 2 - halfPost];
    for (const px of xs) for (const pz of zs) {
      box('base', mats.post, 9, postH, 9, px, postH / 2, pz);
    }
  }
  C.setRef(null);
}

function buildFloorGeo(C) {
  const { p, box, mats, floorTopY } = C;
  C.setRef('Floor panel');
  box('deck', mats.deck, p.width, C.floorPly.thick, p.depth, 0, floorTopY - C.floorPly.thick / 2, 0);
  C.setRef(null);
}

function buildFloorStrapsGeo(C) {
  const { p, mats, slopedBeam, wallBotY, wallPly, thin, deep } = C;
  const x = p.width / 2 - (wallPly.thick + thin / 2);
  const z = p.depth / 2 - (wallPly.thick + deep / 2);
  const y = wallBotY + 0.05;

  C.setRef('Diagonal floor strap (X-brace)');
  slopedBeam('bracing', mats.strap, new THREE.Vector3(-x, y, -z), new THREE.Vector3(x, y, z), 0.1, 3);
  slopedBeam('bracing', mats.strap, new THREE.Vector3(x, y, -z), new THREE.Vector3(-x, y, z), 0.1, 3);
  C.setRef(null);
}

// ---------------------------------------------------------------- Walls (plywood shell) + bracing
function wallList(L) {
  const { p } = L;
  return [
    { dir: 'x', length: p.width, offset: -p.depth / 2, label: 'Front', out: -1 },
    { dir: 'x', length: p.width, offset: p.depth / 2, label: 'Back', out: 1 },
    { dir: 'z', length: p.depth, offset: -p.width / 2, label: 'Left', out: -1 },
    { dir: 'z', length: p.depth, offset: p.width / 2, label: 'Right', out: 1 },
  ];
}

function topFnOf(C, dir, offset) {
  const { p, wallBotY, profile, frontH, backH } = C;
  if (dir === 'x') {
    const isFront = offset < 0;
    return () => wallBotY + (isFront ? frontH : backH);
  }
  return (s) => wallBotY + profileHeightAt(profile, p.depth, s);
}

function buildWallsGeo(C) {
  const { p, mats, box, slopedBeam, wallBotY, frontH } = C;
  const walls = wallList(C);

  const openingsByWall = { Front: [], Back: [], Left: [], Right: [] };
  openingsByWall.Front = frontOpenings(p.width, C.xSpacing, frontH, wallBotY);

  for (const wall of walls) {
    const topFn = topFnOf(C, wall.dir, wall.offset);
    buildWallPanel(C, wall, topFn, openingsByWall[wall.label] || []);
    buildBracing(C, wall, topFn);
  }
}

function buildWallPanel(C, wall, topFn, openings) {
  const { mats, add, wallBotY } = C;
  const thick = C.wallPly.thick;
  const length = wall.dir === 'x' ? wall.length - 2 * thick : wall.length;

  const shape = new THREE.Shape();
  const N = 12;
  shape.moveTo(-length / 2, wallBotY);
  shape.lineTo(-length / 2, topFn(0));
  for (let i = 1; i <= N; i++) {
    const s = (length * i) / N;
    shape.lineTo(s - length / 2, topFn(s));
  }
  shape.lineTo(length / 2, wallBotY);
  shape.closePath();

  for (const o of openings) {
    const hole = new THREE.Path();
    const s0 = o.s0 - (wall.dir === 'x' ? thick : 0);
    const x0 = s0 - length / 2;
    const x1 = s0 + o.w - length / 2;
    if (o.arched) {
      const r = o.w / 2;
      const cx = (x0 + x1) / 2;
      hole.moveTo(x0, o.y0);
      hole.lineTo(x1, o.y0);
      hole.lineTo(x1, o.y1);
      hole.absarc(cx, o.y1, r, 0, Math.PI, false);
      hole.lineTo(x0, o.y0);
    } else {
      hole.moveTo(x0, o.y0);
      hole.lineTo(x1, o.y0);
      hole.lineTo(x1, o.y1);
      hole.lineTo(x0, o.y1);
    }
    hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  const m = new THREE.Mesh(geo, mats.shell);
  m.userData.layer = 'shell';
  m.userData.ref = `Wall panel — ${wall.label}`;
  // Outer face flush with the floor edge; the panel thickness grows inwards
  if (wall.dir === 'x') {
    m.position.set(0, 0, wall.offset - (wall.out + 1) * thick / 2);
  } else {
    m.rotation.y = -Math.PI / 2;
    m.position.set(wall.offset + (1 - wall.out) * thick / 2, 0, 0);
  }
  add('shell', m);
}

function buildBracing(C, wall, topFn) {
  const { p, mats, add, box, slopedBeam, wallBotY, profile, frontH, backH, thin, deep } = C;
  const length = wall.length;
  // Battens sit against the inner face of the (inward-shifted) wall panel
  const inset = C.wallPly.thick + deep / 2;
  const across = wall.offset - wall.out * inset;
  const isFront = wall.dir === 'x' && wall.offset < 0;

  // Roof-slope bevel used on the front wall's members and top rail
  const slope = (profile[0].h - profile[1].h) / ((profile[1].t - profile[0].t) * p.depth);
  const drop = deep * slope;
  const topOuter = wallBotY + frontH - thin; // member top at the front face
  const topInner = topOuter - drop;
  const outerZ = across - deep / 2;

  const pos = (s) => (wall.dir === 'x' ? { x: s - length / 2, z: across } : { x: across, z: s - length / 2 });

  // Vertical stiffener ribs (interior), stopped below the top rail.
  // On the profiled (side) walls the top is cut at the profile angle.
  const spacing = wall.dir === 'x' ? C.xSpacing : C.zSpacing;
  const ribSs = [];
  for (let s = spacing; s < length - spacing / 2; s += spacing) ribSs.push(s);
  for (const s of ribSs) {
    C.setRef(`Vertical stiffener (${wall.label})`);
    if (wall.dir === 'z') {
      // Rotated 90°: the deep face runs along the wall, so only the thin (5 cm)
      // side protrudes into the coop (less obtrusive).
      const x0 = s - deep / 2;
      const x1 = s + deep / 2;
      const shape = new THREE.Shape();
      shape.moveTo(x0, wallBotY);
      shape.lineTo(x1, wallBotY);
      shape.lineTo(x1, topFn(x1) - thin / 2);
      shape.lineTo(x0, topFn(x0) - thin / 2);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: thin, bevelEnabled: false });
      const m = new THREE.Mesh(geo, mats.bracing);
      const acrossStiff = wall.offset - wall.out * (C.wallPly.thick + thin / 2);
      m.rotation.y = -Math.PI / 2;
      m.position.set(acrossStiff + thin / 2, 0, -length / 2);
      add('bracing', m);
    } else if (isFront) {
      const p0 = pos(s);
      const h = frontH - thin;
      box('bracing', mats.bracing, thin, h, deep, p0.x, wallBotY + h / 2, p0.z);
    } else {
      const h = topFn(s) - thin / 2 - wallBotY;
      const p0 = pos(s);
      box('bracing', mats.bracing, thin, h, deep, p0.x, wallBotY + h / 2, p0.z);
    }
  }

  // Top rail (flat front/back)
  if (isFront) {
    C.setRef('Top rail (Front)');
    // Bottom flat (members sit flush on it), top beveled to the sloping roof.
    // Shortened to fit between the side panels.
    beveledSlab(C, add, mats, 'bracing', 0, outerZ, deep, length - 2 * C.wallPly.thick, topOuter, topOuter, topOuter + thin, topInner + thin);
  } else if (wall.dir === 'x') {
    C.setRef('Top rail (Back)');
    const top = topFn(0);
    const p0 = pos(length / 2);
    box('bracing', mats.bracing, length, thin, deep, p0.x, top - thin / 2, p0.z);
  }

  // Corner battens (taller at the front, shorter at the rear; support the top rail)
  if (wall.label === 'Front') {
    const insetCx = C.wallPly.thick + thin / 2;
    const insetCz = C.wallPly.thick + deep / 2;
    const corners = [
      { x: -p.width / 2, z: -p.depth / 2, h: frontH },
      { x: p.width / 2, z: -p.depth / 2, h: frontH },
      { x: -p.width / 2, z: p.depth / 2, h: backH },
      { x: p.width / 2, z: p.depth / 2, h: backH },
    ];
    for (const c of corners) {
      C.setRef(c.z < 0 ? 'Corner batten (front)' : 'Corner batten (rear)');
      const bx = c.x - Math.sign(c.x) * insetCx;
      const bz = c.z - Math.sign(c.z) * insetCz;
      if (c.z < 0) {
        const h = frontH - thin;
        box('bracing', mats.bracing, thin, h, deep, bx, wallBotY + h / 2, bz);
      } else {
        const h = c.h - thin / 2;
        box('bracing', mats.bracing, thin, h, deep, bx, wallBotY + h / 2, bz);
      }
    }
  }
}

// ---------------------------------------------------------------- Roof (sectioned: corrugated polycarbonate high, plywood hinged middle + rear)
function buildRoofGeo(C) {
  const { p, mats, add, box, slopedBeam, corrugated, thin, deep } = C;
  const W = p.width;
  const D = p.depth;
  const profile = C.profile;

  const secs = roofSections(profile, D, C.wallBotY);
  const seg0 = secs[0];

  const p0 = new THREE.Vector3(0, seg0.y0, seg0.z0 - D / 2);
  const pEnd = new THREE.Vector3(0, seg0.y1, seg0.z1 - D / 2);

  // Corrugated polycarbonate high section, lifted to rest on the side top rails
  // (Q/U). This leaves a gap above the front rail (M) — a ventilation slot.
  const segDir = new THREE.Vector3().subVectors(pEnd, p0).normalize();
  const perp = new THREE.Vector3().crossVectors(segDir, new THREE.Vector3(1, 0, 0)).normalize();
  const lift = deep / 2; // roof rests on the (rotated) side rails
  const roofA = p0.clone().addScaledVector(perp, lift);
  const roofB = pEnd.clone().addScaledVector(perp, lift);
  C.setRef('Corrugated polycarbonate sheet (high section)');
  corrugated('cover', mats.poly, roofA, roofB, W, 0.6, 5);

  // Plywood lids (middle + rear), lifted onto the rails and hinged open a little.
  // Each lid gets a perimeter stiffening frame on its underside.
  const openAngle = -0.44; // ~25°
  for (let i = 1; i < secs.length; i++) {
    const s = secs[i];
    C.setRef(i === 1 ? 'Roof lid — cleaning access (hinged)' : 'Roof lid — nest access (hinged)');
    const sdir = new THREE.Vector3(0, s.y1 - s.y0, s.z1 - s.z0).normalize();
    const sperp = new THREE.Vector3().crossVectors(sdir, new THREE.Vector3(1, 0, 0)).normalize();
    const hinge = new THREE.Vector3(0, s.y0, s.z0 - D / 2).addScaledVector(sperp, deep / 2);
    const d = new THREE.Vector3(0, s.y1 - s.y0, s.z1 - s.z0).applyAxisAngle(new THREE.Vector3(1, 0, 0), openAngle);
    const free = hinge.clone().add(d);
    slopedBeam('cover', mats.roofPly, hinge, free, C.wallPly.thick, W, C.wallPly.thick / 2);

    // Thin inner rim (25×25) on the underside: 2 side rails + 1 cross rail at
    // the free end. Outer edges align with the inner face of the side rails.
    const rimT = RIM.thin;
    const rimHalf = W / 2 - C.wallPly.thick - thin - rimT / 2;
    const dirv = new THREE.Vector3().subVectors(free, hinge).normalize();
    const hIn = hinge.clone().addScaledVector(dirv, rimT);
    const fIn = free.clone().addScaledVector(dirv, -rimT);
    C.setRef(i === 1 ? 'Roof lid rim — side rail (cleaning)' : 'Roof lid rim — side rail (nest)');
    for (const sx of [-1, 1]) {
      slopedBeam('cover', mats.roof, hIn.clone().setX(sx * rimHalf), fIn.clone().setX(sx * rimHalf), rimT, rimT, -rimT / 2);
    }
    C.setRef('Roof lid rim — cross rail');
    const alpha = Math.atan2(-(fIn.y - hIn.y), fIn.z - hIn.z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 * rimHalf + rimT, rimT, rimT), mats.roof);
    m.position.set(0, fIn.y - Math.cos(alpha) * rimT / 2, fIn.z - Math.sin(alpha) * rimT / 2);
    m.rotation.x = alpha;
    add('cover', m);
  }

  // Cross battens at the interior pitch breaks, screwed directly to the side walls
  C.setRef('Roof batten (cross)');
  const crossLen = W - 2 * C.wallPly.thick;
  for (let i = 1; i < profile.length - 1; i++) {
    const pt = profile[i];
    const z = pt.t * D - D / 2;
    const y = C.wallBotY + pt.h;
    box('roof', mats.roof, crossLen, deep, thin, 0, y, z);
  }
  C.setRef(null);
}

// ---------------------------------------------------------------- Nest boxes (3 evenly-spaced panels → 2 cubes)
function buildNestBoxesGeo(C) {
  const { p, mats, box, wallBotY, thin, deep } = C;
  const t = C.wallPly.thick;
  const panels = nestLayout(C);
  C.setRef('Nest box panel');
  for (const pan of panels) {
    const zc = (pan.z0 + pan.z1) / 2;
    box('nest', mats.roofPly, t, pan.height, pan.depth, pan.x, wallBotY + pan.height / 2, zc);
  }
  // Front rail connecting the panels, sitting on the floor
  C.setRef('Nest box front rail');
  box('nest', mats.roof, p.width - 2 * t, thin, deep, 0, wallBotY + thin / 2, panels[0].z0);
  C.setRef(null);
}

// ---------------------------------------------------------------- Roosting bars
function buildRoostingBarsGeo(C) {
  const { p, mats, box, wallBotY, thin, deep } = C;
  const bars = roostLayout(C);
  const rearNeedsSupports = p.zBays % 2 !== 0;
  bars.forEach((b, i) => {
    C.setRef(i === 0 ? 'Roosting bar — front' : 'Roosting bar — rear');
    box('roost', mats.roof, b.length, thin, deep, 0, wallBotY + b.height, b.z);
    if (i === 0) {
      // the higher (front) bar needs support legs at its ends
      C.setRef('Roosting bar support');
      for (const sx of [-1, 1]) {
        box('roost', mats.roof, thin, b.height, deep, sx * (b.length / 2 - thin / 2), wallBotY + b.height / 2, b.z);
      }
    }
    if (i === 1 && rearNeedsSupports) {
      C.setRef('Roosting bar support (rear)');
      const h = b.height - thin / 2;
      for (const sx of [-1, 1]) {
        box('roost', mats.roof, thin, h, deep, sx * (b.length / 2 - thin / 2), wallBotY + h / 2, b.z);
      }
    }
  });
  C.setRef(null);
}

// ---------------------------------------------------------------- Access steps (ramp panel + grip bars to each door)
function buildStepsGeo(C) {
  const { p, mats, add, slopedBeam, wallBotY } = C;
  const doors = frontOpenings(p.width, C.xSpacing, C.frontH, wallBotY);
  if (!doors.length) return;
  const D = p.depth;
  const rise = wallBotY + 5;
  const run = 70;
  const len = Math.hypot(run, rise);
  const theta = Math.atan2(rise, run);
  const zTop = -D / 2 - C.wallPly.thick;
  const width = DOOR_W + 4;
  const ny = run / len;
  const nz = -rise / len;
  const bar = 2.5; // small grip bar section (cm), not a structural member
  const barsPerRamp = Math.max(1, Math.floor(len / 15));
  for (const d of doors) {
    const cx = d.s0 + d.w / 2 - p.width / 2;
    const p1 = new THREE.Vector3(cx, 0, zTop - run);
    const p2 = new THREE.Vector3(cx, rise, zTop);
    C.setRef('Step panel (door ramp)');
    slopedBeam('step', mats.roofPly, p1, p2, C.wallPly.thick, width, C.wallPly.thick / 2);

    // Small grip bars across the ramp (not in the parts list)
    C.setRef(null);
    for (let i = 1; i <= barsPerRamp; i++) {
      const f = i / (barsPerRamp + 1);
      const off = C.wallPly.thick / 2 + bar / 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(width, bar, bar), mats.roof);
      m.position.set(cx, rise * f + ny * off, (zTop - run) + run * f + nz * off);
      m.rotation.x = -theta;
      add('step', m);
    }
  }
}
