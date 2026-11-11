import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEFAULT_PARAMS, fmtLen, createPlan, SHEET_SIZES, LUMBER_STOCK_CM } from './coop.js';
import { buildCoop } from './geometry.js';

const STORAGE_KEY = 'coop-designer-state';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_PARAMS };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore */ }
}

const state = loadState();

const canvas = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe8ef);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
camera.position.set(260, 200, 340);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 60, 0);
// Full 360° orbit (no polar limit)
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;

// Lights
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(600, 900, 400);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -800;
sun.shadow.camera.right = 800;
sun.shadow.camera.top = 800;
sun.shadow.camera.bottom = -800;
sun.shadow.camera.far = 3000;
scene.add(sun);

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshStandardMaterial({ color: 0x7fa066, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(4000, 40, 0xffffff, 0xffffff);
grid.material.transparent = true;
grid.material.opacity = 0.15;
grid.position.y = 0.05;
scene.add(grid);

let coopGroup = null;
const DEFAULT_LAYERS = {
  base: true,
  deck: true,
  shell: true,
  bracing: true,
  roof: true,
  cover: true,
  nest: true,
  roost: true,
  step: true,
};

const layerStates = (() => {
  try {
    const raw = localStorage.getItem('coop-designer-layers');
    if (raw) return { ...DEFAULT_LAYERS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_LAYERS };
})();

function saveLayers() {
  try {
    localStorage.setItem('coop-designer-layers', JSON.stringify(layerStates));
  } catch (e) { /* ignore */ }
}

function disposeObject(root) {
  const mats = new Set();
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      arr.forEach((m) => mats.add(m));
    }
  });
  mats.forEach((m) => m.dispose());
}

function rebuild() {
  if (coopGroup) {
    scene.remove(coopGroup);
    disposeObject(coopGroup);
  }
  const { group, parts, summary } = buildCoop(state);
  coopGroup = group;
  scene.add(coopGroup);
  buildLabels(parts);
  applyLayers();
  renderParts(parts, summary);
  updateTotals(summary);
}

let showLabels = (() => {
  try {
    const raw = localStorage.getItem('coop-designer-labels');
    if (raw !== null) return raw === 'true';
  } catch (e) { /* ignore */ }
  return true;
})();

function saveLabels() {
  try {
    localStorage.setItem('coop-designer-labels', String(showLabels));
  } catch (e) { /* ignore */ }
}
const labelTexCache = new Map();

function makeLabelSprite(text) {
  let tex = labelTexCache.get(text);
  if (!tex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15,20,26,0.85)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 56, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,166,58,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffd479';
    ctx.font = 'bold 38px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 35);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    labelTexCache.set(text, tex);
  }
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(13, 6.5, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function buildLabels(parts) {
  const refToId = new Map();
  for (const p of parts) if (!refToId.has(p.ref)) refToId.set(p.ref, p.id);
  coopGroup.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = 'labels';
  coopGroup.traverse((o) => {
    if (!o.userData || !o.userData.ref || !o.geometry) return;
    const id = refToId.get(o.userData.ref);
    if (!id) return;
    o.geometry.computeBoundingBox();
    const c = o.geometry.boundingBox.getCenter(new THREE.Vector3());
    o.localToWorld(c);
    const sprite = makeLabelSprite(id);
    sprite.position.copy(c);
    sprite.userData.layer = o.userData.layer;
    group.add(sprite);
  });
  group.visible = showLabels;
  coopGroup.add(group);
}

function applyLayers() {
  if (!coopGroup) return;
  coopGroup.traverse((o) => {
    if (o.userData && o.userData.layer) {
      o.visible = layerStates[o.userData.layer] !== false;
    }
  });
}

function frameCamera() {
  if (!coopGroup) return;
  const box = new THREE.Box3().setFromObject(coopGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  controls.target.copy(center);
  const dir = new THREE.Vector3(1, 0.8, 1.4).normalize();
  camera.position.copy(center).addScaledVector(dir, maxDim * 1.6);
  camera.near = maxDim / 100;
  camera.far = maxDim * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------------------------------------------------------------- UI schema
const LUMBER_OPTIONS = {
  '42x42': '42×42 mm',
  '45x70': '45×70 mm',
  '75x50': '75×50 mm',
  '45x95': '45×95 mm',
  '45x145': '45×145 mm',
};

const SECTIONS = [
  {
    title: 'Floor',
    controls: [
      { key: 'width', label: 'Width', type: 'number', min: 100, max: 400, step: 5, unit: 'len' },
      { key: 'depth', label: 'Depth', type: 'number', min: 60, max: 250, step: 5, unit: 'len' },
      { key: 'floorHeight', label: 'Floor height', type: 'number', min: 0, max: 100, step: 5, unit: 'len' },
      { key: 'floorPlywood', label: 'Floor panel thickness', type: 'select', options: { '7': '7 mm', '9': '9 mm', '12': '12 mm', '15': '15 mm', '18': '18 mm' } },
      { key: 'sheetSize', label: 'Panel stock size', type: 'select', options: { '122x244': '122 × 244 cm', '120x120': '120 × 120 cm' } },
    ],
  },
  {
    title: 'Wall',
    controls: [
      { key: 'wallPlywood', label: 'Wall panel thickness', type: 'select', options: { '7': '7 mm', '9': '9 mm', '12': '12 mm', '15': '15 mm', '18': '18 mm' } },
    ],
    info: 'Side profile: 90 → 80 → 40 → 30 cm',
  },
  {
    title: 'Roof',
    controls: [],
    info: 'High section: corrugated polycarbonate · middle + rear: hinged plywood lids',
  },
  {
    title: 'Structure',
    controls: [
      { key: 'lumber', label: 'Coop timber size (studs, rails)', type: 'select', options: LUMBER_OPTIONS },
      { key: 'floorLumber', label: 'Floor frame timber (rim, battens)', type: 'select', options: LUMBER_OPTIONS },
      { key: 'xBays', label: 'Bays across width', type: 'number', min: 1, max: 8, step: 1 },
      { key: 'zBays', label: 'Bays across depth', type: 'number', min: 1, max: 8, step: 1 },
    ],
  },
];

const LAYER_TOGGLES = [
  { key: 'base', label: 'Base frame' },
  { key: 'deck', label: 'Floor' },
  { key: 'shell', label: 'Wall panels' },
  { key: 'bracing', label: 'Bracing' },
  { key: 'roof', label: 'Roof structure' },
  { key: 'cover', label: 'Roof cover' },
  { key: 'nest', label: 'Nest boxes' },
  { key: 'roost', label: 'Roosting bars' },
  { key: 'step', label: 'Steps' },
];

function buildControls() {
  const panel = document.getElementById('controls');
  panel.innerHTML = '';
  for (const section of SECTIONS) {
    const sec = document.createElement('div');
    sec.className = 'section';
    const h = document.createElement('h3');
    h.textContent = section.title;
    sec.appendChild(h);

    if (section.info) {
      const info = document.createElement('p');
      info.className = 'section-info';
      info.textContent = section.info;
      sec.appendChild(info);
    }

    for (const c of section.controls) {
      const row = document.createElement('div');
      row.className = 'control';
      row.dataset.hideIf = c.hideIf ? JSON.stringify(c.hideIf) : '';
      const label = document.createElement('label');
      label.textContent = c.label;
      row.appendChild(label);

      if (c.type === 'select') {
        const sel = document.createElement('select');
        for (const [v, t] of Object.entries(c.options)) {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = t;
          sel.appendChild(opt);
        }
        sel.value = String(state[c.key]);
        sel.addEventListener('change', () => {
          state[c.key] = isNaN(Number(sel.value)) ? sel.value : Number(sel.value);
          onParamChange();
        });
        row.appendChild(sel);
      } else if (c.type === 'checkbox') {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!state[c.key];
        box.addEventListener('change', () => {
          state[c.key] = box.checked;
          onParamChange();
        });
        row.appendChild(box);
      } else {
        const inp = document.createElement('input');
        inp.type = 'number';
        if (c.min !== undefined) inp.min = c.min;
        if (c.max !== undefined) inp.max = c.max;
        inp.step = c.step ?? 1;
        inp.value = state[c.key];
        inp.addEventListener('change', () => {
          let v = Number(inp.value);
          if (Number.isNaN(v)) v = state[c.key];
          if (c.min !== undefined) v = Math.max(c.min, v);
          if (c.max !== undefined) v = Math.min(c.max, v);
          state[c.key] = v;
          inp.value = v;
          onParamChange();
        });
        const unit = document.createElement('span');
        unit.className = 'unit';
        unit.textContent = unitSuffix(c.unit);
        const wrap = document.createElement('div');
        wrap.className = 'number';
        wrap.appendChild(inp);
        wrap.appendChild(unit);
        row.appendChild(wrap);
      }
      sec.appendChild(row);
    }
    panel.appendChild(sec);
  }
  applyHideRules();
}

function unitSuffix(unit) {
  if (unit === 'len') return 'cm';
  if (unit === '°') return '°';
  return '';
}

function applyHideRules() {
  document.querySelectorAll('.control[data-hide-if]').forEach((row) => {
    const rule = JSON.parse(row.dataset.hideIf || '{}');
    let hide = false;
    for (const [k, v] of Object.entries(rule)) if (state[k] === v) hide = true;
    row.style.display = hide ? 'none' : '';
  });
}

function onParamChange() {
  applyHideRules();
  saveState();
  rebuild();
}

// ---------------------------------------------------------------- Parts list
const CATEGORY_ORDER = ['Foundation', 'Base frame', 'Floor', 'Wall panels', 'Internal bracing', 'Roof structure', 'Roofing', 'Nesting boxes', 'Roosting', 'Access', 'Openings', 'Hardware'];

const expandedCats = new Set();

function renderParts(parts, summary) {
  const el = document.getElementById('parts-list');
  el.innerHTML = '';

  const byCat = {};
  for (const p of parts) {
    (byCat[p.category] ||= []).push(p);
  }

  const cats = Object.keys(byCat).sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99)
  );

  for (const cat of cats) {
    const items = byCat[cat];
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const card = document.createElement('div');
    card.className = 'part-category';
    if (!expandedCats.has(cat)) card.classList.add('collapsed');

    const head = document.createElement('button');
    head.className = 'part-cat-head';
    head.innerHTML = `<span class="chev">▾</span><span class="cat-name">${cat}</span><span class="count">${items.length} part${items.length > 1 ? 's' : ''}</span>`;
    head.addEventListener('click', () => {
      if (expandedCats.has(cat)) expandedCats.delete(cat);
      else expandedCats.add(cat);
      card.classList.toggle('collapsed');
    });
    card.appendChild(head);

    const list = document.createElement('div');
    list.className = 'part-items';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'part';
      row.innerHTML = `
        <div class="part-top">
          <span class="pid">${it.id}</span>
          <span class="qty">${it.qty}×</span>
          <span class="name">${it.name}</span>
        </div>
        <div class="spec">${specString(it)}</div>
        <div class="notes">${it.notes || ''}</div>
      `;
      list.appendChild(row);
    }
    card.appendChild(list);
    el.appendChild(card);
  }
}

function specString(it) {
  const dims = [];
  if (it.lengthIn > 0) dims.push(`L ${fmtLen(it.lengthIn)}`);
  if (it.widthIn > 0) dims.push(`W ${fmtLen(it.widthIn)}`);
  if (it.depthIn > 0) dims.push(`T ${fmtLen(it.depthIn)}`);
  return `${it.material}${dims.length ? ' — ' + dims.join(' × ') : ''}`;
}

function updateTotals(summary) {
  document.getElementById('totals').innerHTML = `
    <div class="total"><span>Timber pieces</span><b>${summary.timberPieces}</b></div>
    <div class="total"><span>Timber volume</span><b>${summary.volumeL.toFixed(0)} L</b></div>
    <div class="total"><span>Sheet goods</span><b>${summary.sheets}</b></div>
    <div class="total"><span>Floor area</span><b>${summary.area.floor.toFixed(1)} m²</b></div>
    <div class="total"><span>Wall area</span><b>${summary.area.walls.toFixed(1)} m²</b></div>
    <div class="total"><span>Roof area</span><b>${summary.area.roof.toFixed(1)} m²</b></div>
  `;
}

// ---------------------------------------------------------------- Plywood cut plan
function packItems(items, sw, sl) {
  // First-fit shelf packing. Rectangular pieces default to their larger dimension
  // across the width; if that overflows, they flip to run along the sheet length.
  const norm = items.map((it) => {
    if (it.type === 'shaped') return { ...it };
    const a = Math.max(it.w, it.l);
    const b = Math.min(it.w, it.l);
    let w = a;
    let l = b;
    if (w > sw && a <= sl) { w = b; l = a; }
    return { ...it, w, l };
  });
  const sorted = norm.sort((a, b) => b.l - a.l || b.w - a.w);
  const sheets = [];
  for (const p of sorted) {
    let done = false;
    for (const sh of sheets) {
      for (const shelf of sh.shelves) {
        if (shelf.h >= p.l && shelf.cursorX + p.w <= sw) {
          sh.items.push({ ...p, x: shelf.cursorX, y: shelf.y });
          shelf.cursorX += p.w;
          done = true;
          break;
        }
      }
      if (done) break;
      const last = sh.shelves[sh.shelves.length - 1];
      const nextY = last.y + last.h;
      if (nextY + p.l <= sl) {
        sh.shelves.push({ y: nextY, h: p.l, cursorX: p.w });
        sh.items.push({ ...p, x: 0, y: nextY });
        done = true;
        break;
      }
    }
    if (!done) {
      sheets.push({ items: [{ ...p, x: 0, y: 0 }], shelves: [{ y: 0, h: p.l, cursorX: p.w }] });
    }
  }
  return sheets;
}

// Non-rectangular pieces: two identical shapes tile one sheet (one rotated 180°).
function shapeBox(shape) {
  let w = 0;
  let l = 0;
  for (const [x, y] of shape) { w = Math.max(w, x); l = Math.max(l, y); }
  return { w, l };
}

function packShaped(pieces) {
  const groups = new Map();
  for (const p of pieces) {
    const sig = JSON.stringify(p.shape);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(p);
  }
  const units = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 2) {
      const box = shapeBox(group[i].shape);
      // second piece rotated 180° and shifted so the two profiles interlock
      const placed = [{ ...group[i], rot: 0, px: 0, py: 0 }];
      if (group[i + 1]) placed.push({ ...group[i + 1], rot: 180, px: 0, py: Math.max(0, box.w - box.l) });
      units.push({ shaped: true, pieces: placed, box });
    }
  }
  return units;
}

function drawShapedUnit(s, u, ox, oy, scale) {
  for (const pc of u.pieces) {
    const base = pc.rot === 180 ? pc.shape.map(([x, y]) => [u.box.w - x, u.box.l - y]) : pc.shape;
    const pts = base.map(([x, y]) => [x + pc.px, y + pc.py]);
    const d = pts.map(([x, y], k) => `${k === 0 ? 'M' : 'L'}${(ox + x * scale).toFixed(1)},${(oy + y * scale).toFixed(1)}`).join(' ') + ' Z';
    s += `<path d="${d}" fill="#d9c39a" stroke="#8a5c33" stroke-width="1"/>`;
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    s += `<text x="${ox + cx * scale}" y="${oy + cy * scale}" font-size="14" font-weight="700" fill="#5a3a1a" text-anchor="middle">${pc.id}</text>`;
    s += `<text x="${ox + cx * scale}" y="${oy + cy * scale + 13}" font-size="9.5" fill="#7a5a3a" text-anchor="middle">${pc.name}</text>`;
  }
  return s;
}

function drawRectPiece(s, pc, ox, oy, scale) {
  const x = ox + pc.x * scale;
  const y = oy + pc.y * scale;
  const w = pc.w * scale;
  const l = pc.l * scale;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${l}" fill="#d9c39a" stroke="#8a5c33" stroke-width="1"/>`;
  if (w > 20 && l > 14) {
    const fs = Math.max(9, Math.min(15, Math.min(w, l) / 3));
    s += `<text x="${x + w / 2}" y="${y + l / 2 + fs / 3}" font-size="${fs}" font-weight="700" fill="#5a3a1a" text-anchor="middle">${pc.id}</text>`;
    if (w > 90 && l > 34) {
      s += `<text x="${x + w / 2}" y="${y + l / 2 + fs / 3 + fs}" font-size="9.5" fill="#7a5a3a" text-anchor="middle">${pc.name}</text>`;
    }
  }
  return s;
}

function renderCutPlan(sheets) {
  const SW = 120;
  const SL = 240;
  const scale = Math.min(2.6, 700 / SL);
  const gap = 30;
  const pad = 26;
  const bandH = SW * scale;
  const totalW = SL * scale + pad * 2;
  const totalH = sheets.reduce((a) => a + bandH + gap, pad);
  let s = `<svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">`;
  let y = pad;
  sheets.forEach((sheet, si) => {
    const ox = pad;
    const oy = y;
    if (sheet.l === SL) {
      s += `<g transform="translate(${ox + SL * scale} ${oy}) rotate(90)">`;
      s += `<rect x="0" y="0" width="${SW * scale}" height="${SL * scale}" fill="#f3ead9" stroke="#8a7a66" stroke-width="2"/>`;
      for (const it of sheet.items) {
        if (it.type === 'shaped') s = drawShapedUnit(s, it.unit, it.x * scale, it.y * scale, scale);
        else s = drawRectPiece(s, it, 0, 0, scale);
      }
      s += `</g>`;
    } else {
      s += `<rect x="${ox}" y="${oy}" width="${SW * scale}" height="${SW * scale}" fill="#f3ead9" stroke="#8a7a66" stroke-width="2"/>`;
      for (const it of sheet.items) {
        if (it.type === 'shaped') s = drawShapedUnit(s, it.unit, ox + it.x * scale, oy + it.y * scale, scale);
        else s = drawRectPiece(s, it, ox, oy, scale);
      }
    }
    const kind = sheet.l === SL ? '1.2×2.4 m' : '1.2×1.2 m';
    s += `<text x="${ox}" y="${oy - 7}" font-size="12" fill="#8b98a6">Sheet ${si + 1} — ${kind} · ${sheet.t} mm</text>`;
    y += bandH + gap;
  });
  s += '</svg>';
  document.getElementById('cutplan-body').innerHTML = s;

  const polyArea = (shape) => {
    let ar = 0;
    for (let i = 0; i < shape.length; i++) {
      const [x1, y1] = shape[i];
      const [x2, y2] = shape[(i + 1) % shape.length];
      ar += x1 * y2 - x2 * y1;
    }
    return Math.abs(ar / 2);
  };
  let used = 0;
  for (const sheet of sheets) {
    for (const it of sheet.items) {
      if (it.type === 'shaped') used += it.unit.pieces.reduce((c, pc) => c + polyArea(pc.shape), 0);
      else used += it.w * it.l;
    }
  }
  const totalArea = sheets.reduce((a, p) => a + p.w * p.l, 0);
  const big = sheets.filter((p) => p.l === SL).length;
  const single = sheets.filter((p) => p.l !== SL).length;
  const parts = [];
  if (big) parts.push(`${big} × 1.2×2.4 m`);
  if (single) parts.push(`${single} × 1.2×1.2 m`);
  document.getElementById('cutplan-summary').textContent =
    `${parts.join(' + ')} · ${Math.round((used / Math.max(1, totalArea)) * 100)}% used`;
}

function computePlywoodSheets(plan) {
  const SW = 120;
  const SL = 240;
  // Group by thickness — a sheet is a single thickness of stock
  const byT = new Map();
  for (const p of plan.parts) {
    if (!String(p.material).startsWith('Plywood')) continue;
    if (!(p.lengthIn > 0 && p.widthIn > 0)) continue;
    const t = p.depthIn * 10;
    if (!byT.has(t)) byT.set(t, { rects: [], shaped: [] });
    const grp = byT.get(t);
    for (let i = 0; i < p.qty; i++) {
      const piece = { id: p.id, name: p.name, w: p.widthIn, l: p.lengthIn, shape: p.shape };
      if (p.shape) grp.shaped.push(piece); else grp.rects.push(piece);
    }
  }
  // Pack rects and interlocking shaped units together on 1.2×2.4 sheets.
  const sheets = [];
  for (const [t, grp] of byT) {
    const items = grp.rects.map((r) => ({ ...r, type: 'rect' }));
    for (const u of packShaped(grp.shaped)) {
      items.push({ type: 'shaped', w: u.box.w, l: u.box.w, unit: u });
    }
    for (const sh of packItems(items, SW, SL)) {
      let maxY = 0;
      for (const it of sh.items) maxY = Math.max(maxY, it.y + it.l);
      const l = maxY <= SW ? SW : SL;
      sheets.push({ w: SW, l, t, items: sh.items });
    }
  }
  return sheets;
}

function showCutPlan() {
  renderCutPlan(computePlywoodSheets(createPlan(state)));
  document.getElementById('cutplan-overlay').classList.remove('hidden');
}

// First-fit-decreasing packing into fixed stock lengths (cm).
function packStockLengths(pieces, stockCm) {
  const bins = [];
  for (const len of [...pieces].sort((a, b) => b - a)) {
    let placed = false;
    for (const bin of bins) {
      if (bin.used + len <= stockCm) {
        bin.used += len;
        bin.pieces.push(len);
        placed = true;
        break;
      }
    }
    if (!placed) bins.push({ used: len, pieces: [len] });
  }
  return bins;
}

function exportCSV() {
  const plan = createPlan(state);
  const lines = [];

  // Cut list grouped by material + size
  lines.push(['ID', 'Material', 'Size', 'Qty', 'Parts']);
  const groups = new Map();
  for (const p of plan.parts) {
    const dims = [p.lengthIn, p.widthIn, p.depthIn].filter((v) => v > 0).map(fmtLen);
    const size = dims.length ? dims.join(' × ') : '—';
    const key = `${p.material}||${size}`;
    if (!groups.has(key)) groups.set(key, { id: p.id, material: p.material, size, qty: 0, names: new Set() });
    const g = groups.get(key);
    g.qty += p.qty;
    g.names.add(`${p.id} ${p.name}`);
  }
  for (const g of groups.values()) {
    lines.push([g.id, g.material, g.size, g.qty, [...g.names].join('; ')]);
  }

  // Material summary
  lines.push([]);
  lines.push(['Material summary']);
  lines.push(['Material', 'Total qty', 'Total length (m)', 'Total area (m²)', 'Total volume (L)', 'Stock lengths (4.8 m)']);
  const mats = new Map();
  for (const p of plan.parts) {
    if (!mats.has(p.material)) mats.set(p.material, { qty: 0, len: 0, area: 0, vol: 0, pieces: [] });
    const m = mats.get(p.material);
    m.qty += p.qty;
    if (p.lengthIn > 0) {
      m.len += p.qty * p.lengthIn;
      for (let i = 0; i < p.qty; i++) m.pieces.push(p.lengthIn);
    }
    if (p.lengthIn > 0 && p.widthIn > 0) m.area += p.qty * p.lengthIn * p.widthIn;
    if (p.lengthIn > 0 && p.widthIn > 0 && p.depthIn > 0) m.vol += p.qty * p.lengthIn * p.widthIn * p.depthIn;
  }
  for (const [name, m] of mats) {
    const stockCm = LUMBER_STOCK_CM[name];
    const stock = stockCm ? packStockLengths(m.pieces, stockCm).length : '';
    lines.push([
      name,
      m.qty,
      (m.len / 100).toFixed(2),
      (m.area / 10000).toFixed(3),
      (m.vol / 1000).toFixed(2),
      stock,
    ]);
  }

  const stockMats = Object.keys(LUMBER_STOCK_CM);
  if (stockMats.length) {
    lines.push([]);
    for (const name of stockMats) {
      lines.push([`Note: ${name} timber is bought in ${LUMBER_STOCK_CM[name] / 100} m stock lengths.`]);
    }
  }

  const csv = lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chicken-coop-cut-list.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------- Shopping list
function buildShoppingList(plan) {
  const timber = new Map();
  const hardware = [];
  const roofing = [];
  for (const p of plan.parts) {
    const mat = String(p.material);
    if (mat.startsWith('Plywood')) continue;
    if (mat === 'Corrugated polycarbonate (clear)') { roofing.push(p); continue; }
    if (p.category === 'Hardware') { hardware.push(p); continue; }
    if (p.widthIn > 0 && p.depthIn > 0) {
      if (!timber.has(mat)) timber.set(mat, { pieces: 0, len: 0, lengths: [], names: new Set() });
      const t = timber.get(mat);
      t.pieces += p.qty;
      t.len += p.qty * p.lengthIn;
      t.names.add(p.name);
      for (let i = 0; i < p.qty; i++) t.lengths.push(p.lengthIn);
    } else {
      hardware.push(p);
    }
  }

  const timbers = [];
  for (const [mat, t] of timber) {
    const stockCm = LUMBER_STOCK_CM[mat];
    const bins = stockCm ? packStockLengths(t.lengths, stockCm) : null;
    const byLen = new Map();
    for (const l of t.lengths) {
      const k = Math.round(l * 10) / 10;
      byLen.set(k, (byLen.get(k) || 0) + 1);
    }
    timbers.push({
      mat,
      pieces: t.pieces,
      metres: t.len / 100,
      stockCm,
      stockCount: bins ? bins.length : 0,
      waste: bins && bins.length ? 1 - t.len / (bins.length * stockCm) : 0,
      uses: [...t.names],
      cuts: [...byLen.entries()].sort((a, b) => b[0] - a[0]),
    });
  }

  const sheetGroups = new Map();
  for (const sh of computePlywoodSheets(plan)) {
    const kind = sh.l === 240 ? '1.2 × 2.4 m' : '1.2 × 1.2 m';
    const key = `${sh.t}|${kind}`;
    if (!sheetGroups.has(key)) sheetGroups.set(key, { t: sh.t, kind, count: 0, area: 0, names: new Set() });
    const g = sheetGroups.get(key);
    g.count += 1;
    g.area += (sh.w * sh.l) / 10000;
    for (const it of sh.items) g.names.add(it.name);
  }

  const sheets = [...sheetGroups.values()].map((g) => ({ ...g, uses: [...g.names] }));
  return { timbers, sheets, roofing, hardware, summary: plan };
}

function renderShoppingList(data) {
  const { timbers, sheets, roofing, hardware } = data;
  const H = [];
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  H.push('<div class="shop-paper">');
  H.push('<header class="shop-head">');
  H.push('<h1>Chicken Coop — Shopping list</h1>');
  H.push(`<div class="shop-sub">${fmtLen(state.width)} × ${fmtLen(state.depth)} footprint · floor ${fmtLen(state.floorHeight)} · generated ${date}</div>`);
  H.push('</header>');

  const section = (title, body) => H.push(`<section class="shop-section"><h2>${title}</h2>${body}</section>`);

  if (timbers.length) {
    let body = '';
    for (const t of timbers) {
      const buy = t.stockCm
        ? `<b>${t.stockCount} × ${fmtLen(t.stockCm)} lengths</b>${t.waste > 0.005 ? `<span class="shop-waste">~${Math.round(t.waste * 100)}% waste</span>` : ''}`
        : '<b>as required</b>';
      const cuts = t.cuts.map(([len, q]) => `<li><span>${q} ×</span><span>${fmtLen(len)}</span></li>`).join('');
      body += `<div class="shop-item">
        <div class="shop-item-head"><span class="shop-name">${t.mat}</span><span class="shop-buy">${buy}</span></div>
        <div class="shop-detail">${t.pieces} piece${t.pieces > 1 ? 's' : ''} · ${t.metres.toFixed(2)} m total</div>
        <div class="shop-uses">Used for: ${t.uses.join(', ')}</div>
        <ul class="shop-cuts">${cuts}</ul>
      </div>`;
    }
    section('Timber', body);
  }

  if (sheets.length) {
    let body = '';
    for (const g of sheets) {
      body += `<div class="shop-item">
        <div class="shop-item-head"><span class="shop-name">Plywood ${g.t} mm</span><span class="shop-buy"><b>${g.count} × ${g.kind} sheet${g.count > 1 ? 's' : ''}</b></span></div>
        <div class="shop-detail">${g.area.toFixed(2)} m² of stock</div>
        <div class="shop-uses">Used for: ${g.uses.join(', ')}</div>
      </div>`;
    }
    section('Sheet goods', body);
  }

  if (roofing.length) {
    let body = '';
    for (const p of roofing) {
      body += `<div class="shop-item">
        <div class="shop-item-head"><span class="shop-name">Corrugated polycarbonate (clear)</span><span class="shop-buy"><b>${p.qty} × ${fmtLen(p.lengthIn)} × ${fmtLen(p.widthIn)}</b></span></div>
        <div class="shop-detail">${p.notes || ''}</div>
      </div>`;
    }
    section('Roofing', body);
  }

  if (hardware.length) {
    const rows = hardware
      .map((p) => {
        const size = [p.lengthIn, p.widthIn].filter((v) => v > 0).map(fmtLen).join(' × ');
        return `<li><span>${p.name}${p.notes ? `<em>${p.notes}</em>` : ''}</span><span><b>${p.qty}</b>${size ? ` × ${size}` : ''}</span></li>`;
      })
      .join('');
    section('Fixings & hardware', `<ul class="shop-hw">${rows}</ul>`);
  }

  H.push('<p class="shop-foot">List derived from the current design. Buy a little extra timber for offcuts.</p>');
  H.push('</div>');
  return H.join('');
}

function showShoppingList() {
  const plan = createPlan(state);
  document.getElementById('shop-body').innerHTML = renderShoppingList(buildShoppingList(plan));
  document.getElementById('shop-summary').textContent =
    `${fmtLen(state.width)} × ${fmtLen(state.depth)} · ${plan.timberPieces} timber pieces`;
  document.getElementById('shop-overlay').classList.remove('hidden');
}

// ---------------------------------------------------------------- Layer toggles
function buildLayerToggles() {
  const wrap = document.getElementById('layer-toggles');
  wrap.innerHTML = '';
  for (const t of LAYER_TOGGLES) {
    const label = document.createElement('label');
    label.className = 'toggle';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = layerStates[t.key] !== false;
    box.addEventListener('change', () => {
      layerStates[t.key] = box.checked;
      saveLayers();
      applyLayers();
    });
    label.appendChild(box);
    label.appendChild(document.createTextNode(t.label));
    wrap.appendChild(label);
  }
}

// ---------------------------------------------------------------- Resize + loop
function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- Init
document.getElementById('reset-view').addEventListener('click', frameCamera);
document.getElementById('export').addEventListener('click', exportCSV);
document.getElementById('cutplan').addEventListener('click', showCutPlan);
document.getElementById('close-cutplan').addEventListener('click', () => {
  document.getElementById('cutplan-overlay').classList.add('hidden');
});
document.getElementById('cutplan-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'cutplan-overlay') document.getElementById('cutplan-overlay').classList.add('hidden');
});
document.getElementById('shopping').addEventListener('click', showShoppingList);
document.getElementById('print-shop').addEventListener('click', () => window.print());
window.addEventListener('beforeprint', () => {
  if (document.getElementById('shop-overlay').classList.contains('hidden')) showShoppingList();
});
document.getElementById('close-shop').addEventListener('click', () => {
  document.getElementById('shop-overlay').classList.add('hidden');
});
document.getElementById('shop-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'shop-overlay') document.getElementById('shop-overlay').classList.add('hidden');
});
document.getElementById('toggle-labels').addEventListener('click', (e) => {
  showLabels = !showLabels;
  saveLabels();
  const g = coopGroup && coopGroup.getObjectByName('labels');
  if (g) g.visible = showLabels;
  e.currentTarget.classList.toggle('active', showLabels);
});
document.getElementById('toggle-labels').classList.toggle('active', showLabels);

buildControls();
buildLayerToggles();
resize();
rebuild();
frameCamera();
animate();
if (location.hash === '#cutplan') showCutPlan();
