import * as THREE from 'three';

export const LUMBER_SIZES = {
  '42x42': { nominal: '42×42 mm', thin: 4.2, deep: 4.2, label: '42×42 mm (4.2 × 4.2 cm)' },
  '45x70': { nominal: '45×70 mm', thin: 4.5, deep: 7.0, label: '45×70 mm (4.5 × 7 cm)' },
  '75x50': { nominal: '75×50 mm', thin: 5.0, deep: 7.5, label: '75×50 mm (5 × 7.5 cm)', stock: 480 },
  '45x95': { nominal: '45×95 mm', thin: 4.5, deep: 9.5, label: '45×95 mm (4.5 × 9.5 cm)' },
  '45x145': { nominal: '45×145 mm', thin: 4.5, deep: 14.5, label: '45×145 mm (4.5 × 14.5 cm)' },
};

// Stock length (cm) of timber that can be bought, keyed by material name.
export const LUMBER_STOCK_CM = Object.values(LUMBER_SIZES)
  .filter((s) => s.stock)
  .reduce((m, s) => ({ ...m, [s.nominal]: s.stock }), {});

// Light rim batten for panel stiffening (roof lids)
export const RIM = { nominal: '25×25 mm', thin: 2.5, deep: 2.5 };


export const PLYWOOD_SIZES = {
  '7': { nominal: '7 mm', thick: 0.7, label: '7 mm (0.7 cm)' },
  '9': { nominal: '9 mm', thick: 0.9, label: '9 mm (0.9 cm)' },
  '12': { nominal: '12 mm', thick: 1.2, label: '12 mm (1.2 cm)' },
  '15': { nominal: '15 mm', thick: 1.5, label: '15 mm (1.5 cm)' },
  '18': { nominal: '18 mm', thick: 1.8, label: '18 mm (1.8 cm)' },
};

export const SHEET_SIZES = {
  '122x244': { w: 122, l: 244, label: '122 × 244 cm (1.2 × 2.4 m)' },
  '120x120': { w: 120, l: 120, label: '120 × 120 cm (1.2 × 1.2 m)' },
};

export const DOOR_W = 22;   // reasonable chicken door width (cm)
export const DOOR_BODY = 18; // rectangular body height below the arch (cm)

// Side wall height profile: (t = fraction along depth, h = wall height in cm).
// From the side, the wall drops 90 → 80 → 40 → 30 cm.
export const WALL_PROFILE = [
  { t: 0, h: 90 },
  { t: 1 / 3, h: 80 },
  { t: 2 / 3, h: 40 },
  { t: 1, h: 30 },
];

export const DEFAULT_PARAMS = {
  width: 120,     // cm
  depth: 120,
  floorHeight: 40,
  lumber: '75x50',
  floorLumber: '75x50',
  xBays: 2, // number of bays across the width
  zBays: 2, // number of bays across the depth
  floorPlywood: '9', // floor panel thickness (thicker than walls)
  wallPlywood: '7',  // wall panel thickness
  sheetSize: '120x120', // stock panel size (1.2 × 1.2 m)
};

export function fmtLen(cm) {
  if (cm < 0.05) return '0 cm';
  if (cm >= 100) return `${parseFloat((cm / 100).toFixed(2))} m`;
  return `${parseFloat(cm.toFixed(1))} cm`;
}

// Height of the wall profile at a position z (0 = front, depth = back).
export function profileHeightAt(profile, depth, z) {
  const t = Math.max(0, Math.min(1, z / depth));
  if (t <= profile[0].t) return profile[0].h;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    if (t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return a.h + f * (b.h - a.h);
    }
  }
  return profile[profile.length - 1].h;
}

// Total length of the profile's top edge (for top rails following the slope).
export function profilePathLength(profile, depth) {
  let len = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const dz = (profile[i + 1].t - profile[i].t) * depth;
    const dh = profile[i + 1].h - profile[i].h;
    len += Math.hypot(dz, dh);
  }
  return len;
}

// Area under the profile (side wall area, cm²).
export function profileArea(profile, depth) {
  let area = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const dz = (profile[i + 1].t - profile[i].t) * depth;
    area += ((profile[i].h + profile[i + 1].h) / 2) * dz;
  }
  return area;
}

// Roof base segments (no eaves). baseIdx 0 = high/front (polycarbonate),
// 1 = middle (cleaning), 2+ = rear (nest).
export function roofSections(profile, depth, wallBotY) {
  const secs = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    const z0 = a.t * depth;
    const z1 = b.t * depth;
    const y0 = wallBotY + a.h;
    const y1 = wallBotY + b.h;
    secs.push({ z0, y0, z1, y1, len: Math.hypot(z1 - z0, y1 - y0), baseIdx: i });
  }
  return secs;
}

// Arch-topped door openings placed dynamically in the front wall, one per bay.
export function frontOpenings(width, spacing, frontH, wallBotY) {
  const margin = 5;
  const stiff = [];
  for (let x = 0; x <= width + 1e-6; x += spacing) stiff.push(x);

  const openings = [];
  for (let i = 0; i < stiff.length - 1; i++) {
    const a = stiff[i];
    const b = stiff[i + 1];
    const w = Math.min(DOOR_W, (b - a) - margin * 2);
    if (w <= 2) continue;
    const s0 = (a + b - w) / 2;
    const y0 = wallBotY + 5;
    const body = Math.min(DOOR_BODY, frontH - 5 - w / 2);
    const y1 = y0 + body;
    openings.push({ s0, w, y0, y1, arched: true });
  }
  return openings;
}

// Nest boxes as evenly-spaced vertical panels in the rear (30–40 cm) section,
// splitting it into (bays across width × 2) cubes against the back wall.
export function nestLayout(L) {
  const p = L.p;
  const W = p.width;
  const D = p.depth;
  const t = L.wallPly.thick;
  const U = W - 2 * t; // interior clear width
  const depth = 30;
  const height = 25;
  const backZ = D / 2 - t;
  const z0 = backZ - depth;
  const z1 = backZ;
  const cubes = Math.max(2, p.xBays * 2);
  const panels = cubes - 1;
  const out = [];
  for (let i = 1; i <= panels; i++) {
    const x = -U / 2 + (U * i) / cubes;
    out.push({ x, z0, z1, depth, height });
  }
  return out;
}

// Two roosting bars spanning the interior width: a higher one near the front
// wall (with headroom to stand facing it) and a lower one on the middle stud.
export function roostLayout(L) {
  const p = L.p;
  const W = p.width;
  const wt = L.wallPly.thick;
  return [
    // front: higher, reaches the side walls at both ends
    { z: -30, length: W - 2 * wt, height: 45 },
    // rear: lower, fits between the side stiffeners (or rests on end supports)
    { z: 0, length: W - 2 * (wt + L.lumber.thin), height: 25 },
  ];
}

function idFor(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

class PartList {
  constructor() {
    this.items = [];
  }
  add(part) {
    const key = part.key || [
      part.category,
      part.name,
      part.material,
      part.lengthIn,
      part.widthIn,
      part.depthIn,
      part.notes || '',
    ].join('|');
    const found = this.items.find((i) => i.key === key);
    if (found) {
      found.qty += part.qty;
    } else {
      // `ref` links a part to its meshes for on-model labelling; default to the name.
      this.items.push({ ...part, key, ref: part.ref || part.name, id: idFor(this.items.length) });
    }
  }
}

export function createPlan(raw) {
  const p = { ...DEFAULT_PARAMS, ...raw };
  const lumber = LUMBER_SIZES[p.lumber];
  const floorLumber = LUMBER_SIZES[p.floorLumber];
  const floorPly = PLYWOOD_SIZES[p.floorPlywood];
  const wallPly = PLYWOOD_SIZES[p.wallPlywood];
  const sheet = SHEET_SIZES[p.sheetSize];

  const parts = new PartList();
  const thin = lumber.thin;
  const deep = lumber.deep;
  const floorThin = floorLumber.thin;
  const floorDeep = floorLumber.deep;

  const floorTopY = p.floorHeight;
  const wallBotY = floorTopY;
  const profile = WALL_PROFILE;
  const frontH = profile[0].h;
  const backH = profile[profile.length - 1].h;

  const xSpacing = p.width / Math.max(1, p.xBays);
  const zSpacing = p.depth / Math.max(1, p.zBays);

  const summary = {
    floorAreaM2: (p.width * p.depth) / 10000,
    wallAreaM2: 0,
    roofAreaM2: 0,
    volumeL: 0,
    timberPieces: 0,
    sheets: 0,
  };

  const L = { p, lumber, floorLumber, floorPly, wallPly, sheet, thin, deep, floorThin, floorDeep, floorTopY, wallBotY, profile, frontH, backH, xSpacing, zSpacing, parts, summary };

  buildFoundation(L);
  buildBaseFrame(L);
  buildFloor(L);
  buildWallPanels(L);
  buildInternalBracing(L);
  buildFloorStraps(L);
  buildRoof(L);
  buildNestBoxes(L);
  buildRoostingBars(L);
  buildSteps(L);
  addHardware(L);

  let volumeL = 0;
  let plyArea = 0;
  for (const it of parts.items) {
    if (it.category === 'Hardware') continue;
    if (it.widthIn > 0 && it.depthIn > 0 && it.lengthIn > 0) {
      volumeL += (it.qty * it.lengthIn * it.widthIn * it.depthIn) / 1000;
    }
    if (it.plyArea) plyArea += it.qty * it.plyArea;
  }
  summary.volumeL = volumeL;
  summary.sheets = Math.ceil(plyArea / (sheet.w * sheet.l));
  summary.plyAreaM2 = plyArea / 10000;

  summary.parts = parts.items;
  summary.area = {
    floor: summary.floorAreaM2,
    walls: summary.wallAreaM2,
    roof: summary.roofAreaM2,
  };
  return summary;
}

function addHardware(L) {
  const { parts, summary } = L;
  const screws = Math.ceil(summary.timberPieces * 6 + summary.sheets * 12);
  parts.add({
    category: 'Hardware',
    name: 'Structural screws (65 mm)',
    material: 'Galvanized',
    qty: screws,
    lengthIn: 6.5,
    widthIn: 0,
    depthIn: 0,
    notes: 'shell panels + battens',
  });
}

// ---------------------------------------------------------------- Foundation
function buildFoundation(L) {
  const { p, parts, floorTopY, floorDeep } = L;
  if (p.floorHeight > 0) {
    const postCount = p.width > 180 ? 6 : 4;
    parts.add({
      category: 'Foundation',
      name: 'Support post (9×9 cm)',
      material: '9×9 cm PT',
      qty: postCount,
      lengthIn: floorTopY - floorDeep - 0.5,
      widthIn: 9,
      depthIn: 9,
      notes: 'pressure-treated, set in ground',
    });
  }
}

// ---------------------------------------------------------------- Base frame
function buildBaseFrame(L) {
  const { p, floorLumber, floorThin, floorDeep, parts, summary } = L;
  const W = p.width;
  const D = p.depth;
  parts.add({
    category: 'Base frame',
    name: 'Rim board (front/back)',
    material: floorLumber.nominal,
    qty: 2,
    lengthIn: W,
    widthIn: floorThin,
    depthIn: floorDeep,
    notes: 'anchors wall panels',
  });
  parts.add({
    category: 'Base frame',
    name: 'Rim board (sides)',
    material: floorLumber.nominal,
    qty: 2,
    lengthIn: D - 2 * floorThin,
    widthIn: floorThin,
    depthIn: floorDeep,
  });

  const battens = [];
  for (let x = L.xSpacing; x < W - floorThin; x += L.xSpacing) battens.push(x);
  parts.add({
    category: 'Base frame',
    name: 'Floor support batten',
    material: floorLumber.nominal,
    qty: battens.length,
    lengthIn: D - 2 * floorThin,
    widthIn: floorThin,
    depthIn: floorDeep,
    notes: `${fmtLen(L.xSpacing)} O.C.`,
  });
  summary.timberPieces += 4 + battens.length;
}

// ---------------------------------------------------------------- Floor
function buildFloor(L) {
  const { p, parts } = L;
  parts.add({
    category: 'Floor',
    name: 'Floor panel',
    material: `Plywood ${L.floorPly.nominal}`,
    qty: 1,
    lengthIn: p.width,
    widthIn: p.depth,
    depthIn: L.floorPly.thick,
    plyArea: p.width * p.depth,
    notes: `one ${fmtLen(p.width)} × ${fmtLen(p.depth)} panel`,
  });
}

// ---------------------------------------------------------------- Walls (plywood shell)
function wallList(L) {
  const { p } = L;
  return [
    { dir: 'x', length: p.width, offset: -p.depth / 2, label: 'Front', out: -1 },
    { dir: 'x', length: p.width, offset: p.depth / 2, label: 'Back', out: 1 },
    { dir: 'z', length: p.depth, offset: -p.width / 2, label: 'Left', out: -1 },
    { dir: 'z', length: p.depth, offset: p.width / 2, label: 'Right', out: 1 },
  ];
}

function wallTopFn(L, dir, offset) {
  const { p, wallBotY, profile, frontH, backH } = L;
  if (dir === 'x') {
    const isFront = offset < 0;
    return () => wallBotY + (isFront ? frontH : backH);
  }
  return (s) => wallBotY + profileHeightAt(profile, p.depth, s);
}

function buildWallPanels(L) {
  const { p, parts, summary, wallBotY } = L;
  for (const wall of wallList(L)) {
    const topFn = wallTopFn(L, wall.dir, wall.offset);
    const maxH = Math.max(topFn(0), topFn(wall.length));
    const height = maxH - wallBotY;
    const length = wall.dir === 'x' ? wall.length - 2 * L.wallPly.thick : wall.length;
    const actualArea = wall.dir === 'x' ? length * height : profileArea(L.profile, p.depth);
    let notes;
    if (wall.label === 'Front') notes = `${p.xBays} arched door openings`;
    else if (wall.label === 'Back') notes = 'rear panel';
    else notes = `profiled panel (${L.profile.map((pt) => pt.h).join('→')}); two nest on one sheet`;

    // Profiled side panels: describe the non-rectangular outline so the cut plan
    // can nest them (two identical pieces tile one sheet).
    let shape;
    if (wall.dir === 'z') {
      shape = [[0, 0], [wall.length, 0]];
      for (let i = L.profile.length - 1; i >= 0; i--) {
        shape.push([L.profile[i].t * wall.length, L.profile[i].h]);
      }
    }

    parts.add({
      category: 'Wall panels',
      name: `Wall panel — ${wall.label}`,
      material: `Plywood ${L.wallPly.nominal}`,
      qty: 1,
      lengthIn: length,
      widthIn: height,
      depthIn: L.wallPly.thick,
      plyArea: actualArea,
      shape,
      notes,
    });
    summary.wallAreaM2 += actualArea / 10000;
  }
}

// ---------------------------------------------------------------- Internal bracing (stiffening)
function buildInternalBracing(L) {
  const { p, lumber, thin, deep, parts, summary, wallBotY, frontH, backH } = L;

  // Corner battens: taller at the front corners, shorter at the rear.
  parts.add({
    category: 'Internal bracing',
    name: 'Corner batten (front)',
    material: lumber.nominal,
    qty: 2,
    lengthIn: frontH - thin,
    widthIn: thin,
    depthIn: deep,
    notes: 'supports the top rail at the front corners',
  });
  parts.add({
    category: 'Internal bracing',
    name: 'Corner batten (rear)',
    material: lumber.nominal,
    qty: 2,
    lengthIn: backH - thin / 2,
    widthIn: thin,
    depthIn: deep,
    notes: 'supports the top rail at the rear corners',
  });

  let ribCount = 0;
  for (const wall of wallList(L)) {
    const spacing = wall.dir === 'x' ? L.xSpacing : L.zSpacing;
    const topFn = wallTopFn(L, wall.dir, wall.offset);
    const isFront = wall.dir === 'x' && wall.offset < 0;
    const ribPositions = [];
    for (let s = spacing; s < wall.length - spacing / 2; s += spacing) ribPositions.push(s);
    for (const s of ribPositions) {
      const h = isFront
        ? frontH - thin
        : Math.round((topFn(s) - thin / 2 - wallBotY) * 2) / 2;
      parts.add({
        category: 'Internal bracing',
        name: `Vertical stiffener (${wall.label})`,
        material: lumber.nominal,
        qty: 1,
        lengthIn: h,
        widthIn: thin,
        depthIn: deep,
        notes: isFront
          ? 'supports the (beveled) top rail'
          : 'supports the top rail; top cut to the profile',
      });
      ribCount++;
    }
    // Top rail: flat for front/back
    if (wall.dir === 'x') {
      parts.add({
        category: 'Internal bracing',
        name: `Top rail (${wall.label})`,
        material: lumber.nominal,
        qty: 1,
        lengthIn: wall.offset < 0 ? wall.length - 2 * L.wallPly.thick : wall.length,
        widthIn: thin,
        depthIn: deep,
        notes: wall.offset < 0 ? 'beveled to the roof slope' : 'continuous ring at wall top',
      });
    }
  }

  summary.timberPieces += 4 + ribCount + 2;
}

// ---------------------------------------------------------------- Floor straps
function buildFloorStraps(L) {
  const { p, parts, wallPly, thin, deep } = L;
  const dx = p.width - 2 * (wallPly.thick + thin / 2);
  const dz = p.depth - 2 * (wallPly.thick + deep / 2);
  const length = Math.hypot(dx, dz);

  parts.add({
    category: 'Hardware',
    name: 'Diagonal floor strap (X-brace)',
    material: 'Galvanized steel strap (30×1 mm)',
    qty: 2,
    lengthIn: length,
    widthIn: 3,
    depthIn: 0.1,
    notes: 'connects the four corner studs; screw to the wall panels',
  });
}

// ---------------------------------------------------------------- Roof (sectioned: corrugated polycarbonate high, plywood hinged middle + rear)
function buildRoof(L) {
  const { p, lumber, thin, deep, parts, summary } = L;
  const W = p.width;
  const D = p.depth;

  const secs = roofSections(L.profile, D, L.wallBotY);
  const seg0 = secs[0];

  // Cross battens at the interior pitch breaks (hinge/rest for the plywood lids)
  const crossBattens = L.profile.length - 2;
  if (crossBattens > 0) {
    parts.add({
      category: 'Roof structure',
      name: 'Roof batten (cross)',
      material: lumber.nominal,
      qty: crossBattens,
      lengthIn: W - 2 * L.wallPly.thick,
      widthIn: thin,
      depthIn: deep,
      notes: 'hinge/rest support for plywood lids, screwed directly to the side walls',
    });
    summary.timberPieces += crossBattens;
  }

  const polyArea = seg0.len * W;
  const cleaningArea = secs[1].len * W;
  const nestArea = secs[2].len * W;

  // Corrugated polycarbonate only on the high (front) section
  parts.add({
    category: 'Roofing',
    name: 'Corrugated polycarbonate sheet (high section)',
    material: 'Corrugated polycarbonate (clear)',
    qty: 1,
    lengthIn: W,
    widthIn: seg0.len,
    depthIn: 0.1,
    notes: 'translucent, fixed onto battens',
  });
  parts.add({
    category: 'Hardware',
    name: 'Polycarbonate fixings (rubber washer)',
    material: 'Galvanized',
    qty: Math.ceil((polyArea / 10000) * 8),
    lengthIn: 0,
    widthIn: 0,
    depthIn: 0,
    notes: 'high section, anti-uplift',
  });

  // Hinged plywood lids over the middle (cleaning) and rear (nest) sections
  parts.add({
    category: 'Roofing',
    name: 'Roof lid — cleaning access (hinged)',
    material: `Plywood ${L.wallPly.nominal}`,
    qty: 1,
    lengthIn: W,
    widthIn: secs[1].len,
    depthIn: L.wallPly.thick,
    plyArea: cleaningArea,
    notes: 'hinged, lift to clean the coop',
  });
  parts.add({
    category: 'Roofing',
    name: 'Roof lid — nest access (hinged)',
    material: `Plywood ${L.wallPly.nominal}`,
    qty: 1,
    lengthIn: W,
    widthIn: secs[2].len,
    depthIn: L.wallPly.thick,
    plyArea: nestArea,
    notes: 'hinged, check eggs over the nest area',
  });
  parts.add({
    category: 'Hardware',
    name: 'Hinges',
    material: 'Steel',
    qty: 4,
    lengthIn: 0,
    widthIn: 0,
    depthIn: 0,
    notes: 'roof lids (2 per lid)',
  });

  // Thin inner rim (25×25) on each lid: flush with the lid edges, inset along the slope
  parts.add({
    category: 'Roofing',
    name: 'Roof lid rim — side rail (cleaning)',
    material: RIM.nominal,
    qty: 2,
    lengthIn: secs[1].len - 2 * RIM.thin,
    widthIn: RIM.thin,
    depthIn: RIM.deep,
    notes: 'inner rim (underside)',
  });
  parts.add({
    category: 'Roofing',
    name: 'Roof lid rim — side rail (nest)',
    material: RIM.nominal,
    qty: 2,
    lengthIn: secs[2].len - 2 * RIM.thin,
    widthIn: RIM.thin,
    depthIn: RIM.deep,
    notes: 'inner rim (underside)',
  });
  parts.add({
    category: 'Roofing',
    name: 'Roof lid rim — cross rail',
    material: RIM.nominal,
    qty: 2,
    lengthIn: W - 2 * (L.wallPly.thick + thin),
    widthIn: RIM.thin,
    depthIn: RIM.deep,
    notes: 'inner rim (underside), free end of each lid',
  });

  summary.roofAreaM2 += (polyArea + cleaningArea + nestArea) / 10000;
}

// ---------------------------------------------------------------- Nest boxes
function buildNestBoxes(L) {
  const { p, lumber, thin, deep, parts } = L;
  const panels = nestLayout(L);
  if (!panels.length) return;
  const t = L.wallPly.thick;
  const mat = `Plywood ${L.wallPly.nominal}`;
  parts.add({
    category: 'Nesting boxes',
    name: 'Nest box panel',
    material: mat,
    qty: panels.length,
    lengthIn: panels[0].depth,
    widthIn: panels[0].height,
    depthIn: t,
    plyArea: panels[0].depth * panels[0].height,
    notes: 'evenly spaced dividers → 4 nest cubes, back section',
  });
  parts.add({
    category: 'Nesting boxes',
    name: 'Nest box front rail',
    material: lumber.nominal,
    qty: 1,
    lengthIn: p.width - 2 * t,
    widthIn: thin,
    depthIn: deep,
    notes: 'connects the nest panels (front edge)',
  });
}

// ---------------------------------------------------------------- Roosting bars
function buildRoostingBars(L) {
  const { p, parts, lumber, thin, deep } = L;
  const bars = roostLayout(L);
  // A middle side-wall stud only exists with an even number of depth bays.
  const rearNeedsSupports = p.zBays % 2 !== 0;
  const info = ['front, near front wall', rearNeedsSupports ? 'rear, on end studs' : 'rear, on middle stud'];
  bars.forEach((b, i) => {
    parts.add({
      category: 'Roosting',
      name: `Roosting bar — ${i === 0 ? 'front' : 'rear'}`,
      material: lumber.nominal,
      qty: 1,
      lengthIn: b.length,
      widthIn: thin,
      depthIn: deep,
      notes: `${b.height} cm above floor (${info[i]})`,
    });
    if (i === 0) {
      parts.add({
        category: 'Roosting',
        name: 'Roosting bar support',
        material: lumber.nominal,
        qty: 2,
        lengthIn: b.height,
        widthIn: thin,
        depthIn: deep,
        notes: 'support legs under the higher (front) bar',
      });
    }
    if (i === 1 && rearNeedsSupports) {
      parts.add({
        category: 'Roosting',
        name: 'Roosting bar support (rear)',
        material: lumber.nominal,
        qty: 2,
        lengthIn: b.height - thin / 2,
        widthIn: thin,
        depthIn: deep,
        notes: 'support studs under the rear bar ends',
      });
    }
  });
}

// ---------------------------------------------------------------- Access steps (a ramp panel to each door)
function buildSteps(L) {
  const { p, parts } = L;
  const doors = frontOpenings(p.width, L.xSpacing, L.frontH, L.wallBotY);
  if (!doors.length) return;
  const rise = L.wallBotY + 5;
  const run = 70;
  const len = Math.hypot(run, rise);
  const width = DOOR_W + 4;
  parts.add({
    category: 'Access',
    name: 'Step panel (door ramp)',
    material: `Plywood ${L.wallPly.nominal}`,
    qty: doors.length,
    lengthIn: len,
    widthIn: width,
    depthIn: L.wallPly.thick,
    plyArea: len * width,
    notes: `ramp to each of the ${doors.length} doors, with grip bars`,
  });
}

export { PartList };
