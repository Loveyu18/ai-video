/**
 * shell.js — 建築外殼：牆（含門窗開口）、地板、天花、門、窗、雨遮、柱子、天光與天花主燈。
 * 所有座標都來自 layout.js。各區家具不在這裡。
 */
import * as THREE from 'three';
import * as L from './layout.js';
import { M, TEXTURE_METERS } from './materials.js';

const H = L.CEILING_HEIGHT;
const DEFAULT_OPEN_ANGLE = 75;   // 度；個別門可在 layout.DOORS 用 openAngle 覆寫
const FRAME = 0.05;           // 門框／窗框寬
const LEAF_T = 0.04;          // 門片厚

function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** 沿某道牆放一塊方塊：along [a,b]、高度 [y0,y1]、牆線座標 c、厚 t */
function wallBox(axis, a, b, y0, y1, c, t, mat, name) {
  const len = b - a, h = y1 - y0;
  if (len <= 1e-4 || h <= 1e-4) return null;
  const mid = (a + b) / 2;
  const m = mesh(axis === 'x' ? new THREE.BoxGeometry(len, h, t) : new THREE.BoxGeometry(t, h, len), mat, name);
  m.position.set(axis === 'x' ? mid : c, y0 + h / 2, axis === 'x' ? c : mid);
  return m;
}

const wallLine = (w) => (L.wallAxis(w) === 'x' ? w.from[1] : w.from[0]);
const xz = (axis, along, c) => (axis === 'x' ? [along, c] : [c, along]);

// ═══════════════════════════════════════════════════════
// 牆
// ═══════════════════════════════════════════════════════
function buildWalls() {
  const g = new THREE.Group();
  g.name = 'walls';
  for (const [id, w] of Object.entries(L.WALLS)) {
    const axis = L.wallAxis(w);
    const k = axis === 'x' ? 0 : 1;
    const t = L.wallThickness(w);
    const c = wallLine(w);
    const lo = Math.min(w.from[k], w.to[k]) - t / 2;
    const hi = Math.max(w.from[k], w.to[k]) + t / 2;
    let cursor = lo;
    const add = (m) => m && g.add(m);
    for (const o of L.openingsOnWall(id)) {
      add(wallBox(axis, cursor, o.from, 0, H, c, t, M.wallPaint, `wall:${id}`));
      add(wallBox(axis, o.from, o.to, 0, o.sill, c, t, M.wallPaint, `wall:${id}:below:${o.id}`));
      add(wallBox(axis, o.from, o.to, o.head, H, c, t, M.wallPaint, `wall:${id}:above:${o.id}`));
      cursor = o.to;
    }
    add(wallBox(axis, cursor, hi, 0, H, c, t, M.wallPaint, `wall:${id}`));
  }
  return g;
}

// ═══════════════════════════════════════════════════════
// 地板／天花
// ═══════════════════════════════════════════════════════
const FLOOR_MAT = {
  wood: M.floorWood, tile: M.floorTile, stone: M.floorStone, outdoorTile: M.floorOutdoorTile,
  whiteTile: M.floorWhiteTile, darkTile: M.floorDarkTile, stoneTile: M.floorStoneTile,
};

function planeXZ(rect, y, faceUp) {
  const [w, d] = L.rectSize(rect);
  const geo = new THREE.PlaneGeometry(w, d);
  // UV 以公尺為單位，讓紋理在每間房比例一致
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * w + rect.x0) / TEXTURE_METERS, (uv.getY(i) * d + rect.z0) / TEXTURE_METERS);
  }
  geo.rotateX(faceUp ? -Math.PI / 2 : Math.PI / 2);
  geo.translate(rect.x0 + w / 2, y, rect.z0 + d / 2);
  return geo;
}

function buildFloorsAndCeilings() {
  const floors = new THREE.Group();
  floors.name = 'floors';
  const ceilings = new THREE.Group();
  ceilings.name = 'ceilings';
  for (const [id, r] of Object.entries(L.ROOMS)) {
    const mat = FLOOR_MAT[r.floor];
    if (mat) floors.add(mesh(planeXZ(r.rect, 0, true), mat, `floor:${id}`, { cast: false }));
    ceilings.add(mesh(planeXZ(r.rect, H, false), M.ceiling, `ceiling:${id}`));
  }
  return { floors, ceilings };
}

// ═══════════════════════════════════════════════════════
// 門
// ═══════════════════════════════════════════════════════
function doorFrame(axis, from, to, c, t, name) {
  const g = new THREE.Group();
  g.name = name;
  const ft = t + 0.02;
  g.add(wallBox(axis, from, from + FRAME, 0, L.DOOR_HEIGHT, c, ft, M.paintWhite, `${name}:jamb`));
  g.add(wallBox(axis, to - FRAME, to, 0, L.DOOR_HEIGHT, c, ft, M.paintWhite, `${name}:jamb`));
  g.add(wallBox(axis, from, to, L.DOOR_HEIGHT - FRAME, L.DOOR_HEIGHT, c, ft, M.paintWhite, `${name}:head`));
  return g;
}

function swingDoor(id, d) {
  const w = L.WALLS[d.wall];
  const axis = L.wallAxis(w);
  const t = L.wallThickness(w);
  const c = wallLine(w);
  const g = doorFrame(axis, d.from, d.to, c, t, `door:${id}`);

  const hingeAtFrom = d.hinge === d.from;
  const hinge = hingeAtFrom ? d.from + FRAME : d.to - FRAME;
  const leafW = d.to - d.from - FRAME * 2;
  const leafH = L.DOOR_HEIGHT - FRAME - 0.01;
  const along = hingeAtFrom ? 1 : -1;                     // 關門時門片從鉸鏈往哪邊延伸
  const [rcx, rcz] = L.rectCenter(L.ROOMS[d.opensInto].rect);
  const side = Math.sign(axis === 'x' ? rcz - c : rcx - c); // 開向哪一側

  // 關門方向與房間法向量（xz）
  const closed = axis === 'x' ? [along, 0] : [0, along];
  const normal = axis === 'x' ? [0, side] : [side, 0];
  const ang = THREE.MathUtils.degToRad(d.openAngle ?? DEFAULT_OPEN_ANGLE);
  const dir = [
    closed[0] * Math.cos(ang) + normal[0] * Math.sin(ang),
    closed[1] * Math.cos(ang) + normal[1] * Math.sin(ang),
  ];

  const pivot = new THREE.Group();
  pivot.name = `door:${id}:pivot`;
  const [hx, hz] = xz(axis, hinge, c);
  pivot.position.set(hx + normal[0] * (t / 2), 0, hz + normal[1] * (t / 2));
  pivot.rotation.y = Math.atan2(-dir[1], dir[0]);           // 讓本地 +X 指向 dir

  const leafMat = id === 'front' ? M.doorCharcoal : M.paintWhite;
  const leaf = mesh(new THREE.BoxGeometry(leafW, leafH, LEAF_T), leafMat, `door:${id}:leaf`);
  leaf.position.set(leafW / 2, leafH / 2, 0);
  pivot.add(leaf);

  const handle = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 12), M.metalBrass, `door:${id}:handle`);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(leafW - 0.07, 1.0, 0);
  handle.scale.set(1, 1.0, 1);
  pivot.add(handle);
  if (id === 'front') {
    // 實拍：深色木紋大門＋直條溝紋＋電子鎖
    for (let k = 1; k < 12; k++) {
      const groove = mesh(new THREE.BoxGeometry(0.006, leafH - 0.1, LEAF_T + 0.004), M.paintCharcoal, `door:${id}:groove`);
      groove.position.set((leafW * k) / 12, leafH / 2, 0);
      pivot.add(groove);
    }
    for (const sgn of [1, -1]) {
      const lock = mesh(new THREE.BoxGeometry(0.07, 0.3, 0.03), M.plasticBlack, `door:${id}:lock`);
      lock.position.set(leafW - 0.09, 1.05, sgn * (LEAF_T / 2 + 0.015));
      pivot.add(lock);
    }
  }
  g.add(pivot);
  return g;
}

function slidingDoor(id, d) {
  const w = L.WALLS[d.wall];
  const axis = L.wallAxis(w);
  const t = L.wallThickness(w);
  const c = wallLine(w);
  const g = doorFrame(axis, d.from, d.to, c, t, `door:${id}`);
  const inner0 = d.from + FRAME, inner1 = d.to - FRAME;
  const panels = d.panels ?? 2;
  const pw = (inner1 - inner0) / panels + 0.03;
  const h = L.DOOR_HEIGHT - FRAME - 0.01;
  // 第一片關著，第二片滑開疊在第一片後面 60%
  const starts = [inner0, inner0 + pw * 0.4];
  starts.slice(0, panels).forEach((s, i) => {
    const off = (i === 0 ? -1 : 1) * 0.025;
    const panel = new THREE.Group();
    panel.name = `door:${id}:panel${i}`;
    const fr = 0.035;
    const pieces = [
      [s, s + fr, 0, h], [s + pw - fr, s + pw, 0, h],
      [s, s + pw, 0, fr], [s, s + pw, h - fr, h],
    ];
    for (const [a, b, y0, y1] of pieces) panel.add(wallBox(axis, a, b, y0, y1, c + off, 0.03, M.windowFrame, `door:${id}:frame`));
    const glass = wallBox(axis, s + fr, s + pw - fr, fr, h - fr, c + off, 0.008, d.glass ? M.glassBronze : M.paintWhite, `door:${id}:glass`);
    glass.castShadow = false;
    panel.add(glass);
    g.add(panel);
  });
  return g;
}

// ═══════════════════════════════════════════════════════
// 窗
// ═══════════════════════════════════════════════════════
function windowUnit(id, o) {
  const w = L.WALLS[o.wall];
  const axis = L.wallAxis(w);
  const t = L.wallThickness(w);
  const c = wallLine(w);
  const sill = o.sill ?? L.WINDOW.sill;
  const head = o.head ?? L.WINDOW.head;
  const g = new THREE.Group();
  g.name = `window:${id}`;

  if (o.railing) {
    // 陽台開口：女兒牆頂蓋＋金屬扶手
    g.add(wallBox(axis, o.from, o.to, sill, sill + 0.04, c, t + 0.04, M.concrete, `window:${id}:cap`));
    g.add(wallBox(axis, o.from, o.to, sill + 0.04, sill + 0.08, c, 0.05, M.metalAluminium, `window:${id}:rail`));
    return g;
  }

  const fr = FRAME;
  const fd = 0.06;
  const pieces = [
    [o.from, o.from + fr, sill, head], [o.to - fr, o.to, sill, head],
    [o.from, o.to, sill, sill + fr], [o.from, o.to, head - fr, head],
  ];
  const mid = (o.from + o.to) / 2;
  pieces.push([mid - fr / 2, mid + fr / 2, sill, head]); // 中間分隔
  for (const [a, b, y0, y1] of pieces) g.add(wallBox(axis, a, b, y0, y1, c, fd, M.windowFrame, `window:${id}:frame`));
  const glass = wallBox(axis, o.from + fr, o.to - fr, sill + fr, head - fr, c, 0.01, M.glass, `window:${id}:glass`);
  glass.castShadow = false;
  g.add(glass);
  const [rcx, rcz] = L.rectCenter(L.ROOMS[o.room].rect);
  const side = Math.sign(axis === 'x' ? rcz - c : rcx - c);
  if (o.blinds) g.add(blinds(id, axis, o.from + fr, o.to - fr, sill + fr, head - fr, c + side * (t / 2 + 0.05)));
  // 室內窗台
  if (sill > 0.3 && sill < 0.8) {
    // 低窗台：做成和臥榻同高的薄石材收邊，臥榻本體由各區做
  } else if (sill > 0.3) {
    g.add(wallBox(axis, o.from - 0.03, o.to + 0.03, sill - 0.03, sill, c + side * (t / 2 + 0.03), 0.06, M.stoneCountertop, `window:${id}:sill`));
  }
  return g;
}

/** 百葉簾（實拍）：葉片微開，夕陽透過會在地上留下條紋光影 */
function blinds(id, axis, a, b, y0, y1, c) {
  const g = new THREE.Group();
  g.name = `window:${id}:blinds`;
  const len = b - a;
  const pitch = 0.024;
  const n = Math.floor((y1 - y0 - 0.05) / pitch);
  const slat = new THREE.BoxGeometry(axis === 'x' ? len : 0.025, 0.002, axis === 'x' ? 0.025 : len);
  const inst = new THREE.InstancedMesh(slat, M.blindSlat, n);
  inst.name = `window:${id}:slats`;
  inst.castShadow = true;
  inst.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tilt = THREE.MathUtils.degToRad(35);
  q.setFromAxisAngle(axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), tilt);
  const mid = (a + b) / 2;
  for (let i = 0; i < n; i++) {
    const y = y1 - 0.05 - i * pitch;
    m.compose(new THREE.Vector3(axis === 'x' ? mid : c, y, axis === 'x' ? c : mid), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, m);
  }
  g.add(inst);
  g.add(wallBox(axis, a, b, y1 - 0.045, y1, c, 0.05, M.blindSlat, `window:${id}:headrail`));
  g.add(wallBox(axis, a, b, y1 - 0.05 - n * pitch - 0.012, y1 - 0.05 - n * pitch, c, 0.03, M.blindSlat, `window:${id}:bottomrail`));
  return g;
}

// ═══════════════════════════════════════════════════════
// 室外：雨遮、柱子、天空
// ═══════════════════════════════════════════════════════
function buildExterior() {
  const g = new THREE.Group();
  g.name = 'exterior';
  for (const [id, a] of Object.entries(L.AWNINGS)) {
    const [w, d] = L.rectSize(a.rect);
    const [cx, cz] = L.rectCenter(a.rect);
    const m = mesh(new THREE.BoxGeometry(w, 0.08, d), M.concrete, `awning:${id}`);
    m.position.set(cx, a.y, cz);
    g.add(m);
  }
  for (const [id, col] of Object.entries(L.COLUMNS)) {
    const [w, d] = L.rectSize(col.rect);
    const [cx, cz] = L.rectCenter(col.rect);
    const m = mesh(new THREE.BoxGeometry(w, H + 0.3, d), M.concrete, `column:${id}`);
    m.position.set(cx, (H + 0.3) / 2 - 0.15, cz);
    g.add(m);
  }
  // 樓板（室外看起來不是浮在空中）
  const [bw, bd] = L.rectSize(L.BOUNDS);
  const [bcx, bcz] = L.rectCenter(L.BOUNDS);
  const slab = mesh(new THREE.BoxGeometry(bw + 2.4, 0.25, bd + 2.4), M.concrete, 'slab');
  slab.position.set(bcx, -0.13, bcz);
  g.add(slab);
  // 展示底座：鳥瞰時整間屋子像放在平台上的建築模型，接住房子的影子
  const plinth = mesh(new THREE.CylinderGeometry(14, 14.3, 0.4, 96), M.plinth, 'plinth', { cast: false });
  plinth.position.set(bcx, -0.26 - 0.2 - 1.2, bcz);
  g.add(plinth);
  const roof = slab.clone();
  roof.name = 'roof';
  roof.position.y = H + 0.13;
  g.add(roof);
  return g;
}

/** 傍晚天空：程式生成的漸層球（頂點色），不是貼圖 */
function buildSky() {
  const geo = new THREE.SphereGeometry(200, 32, 16);
  const top = new THREE.Color(0x3b3a5a);
  const mid = new THREE.Color(0xd98a5a);
  const horizon = new THREE.Color(0xffc489);
  const colors = [];
  const p = geo.attributes.position;
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const h = p.getY(i) / 200; // -1..1
    if (h > 0.25) col.copy(mid).lerp(top, Math.min(1, (h - 0.25) / 0.6));
    else col.copy(horizon).lerp(mid, Math.max(0, (h + 0.1) / 0.35));
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  sky.name = 'sky';
  const [cx, cz] = L.rectCenter(L.BOUNDS);
  sky.position.set(cx, 0, cz);
  return sky;
}

// ═══════════════════════════════════════════════════════
// 燈光（暖色）
// ═══════════════════════════════════════════════════════
function buildLights() {
  const g = new THREE.Group();
  g.name = 'lights';
  const { ambient, hemisphere, sun } = L.LIGHTING;
  g.add(new THREE.AmbientLight(ambient.color, ambient.intensity));
  g.add(new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity));

  const [cx, cz] = L.rectCenter(L.BOUNDS);
  const dir = new THREE.Vector3(...sun.direction).normalize();
  const dl = new THREE.DirectionalLight(sun.color, sun.intensity);
  dl.name = 'sun';
  dl.position.set(cx, 0, cz).addScaledVector(dir, -25);
  dl.target.position.set(cx, 0, cz);
  dl.castShadow = true;
  dl.shadow.mapSize.set(4096, 4096);
  const s = 9;
  Object.assign(dl.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
  dl.shadow.bias = -0.0004;
  dl.shadow.normalBias = 0.02;
  g.add(dl, dl.target);

  for (const l of L.roomCeilingLights()) {
    const pl = new THREE.PointLight(l.color, l.intensity, l.distance, 2);
    pl.name = `ceilingLight:${l.room}`;
    pl.position.set(...l.position);
    g.add(pl);
    // 嵌燈（實拍：平頂＋圓形嵌燈），只是燈具外觀
    for (const [x, z] of L.roomDownlights(l.room)) {
      const ring = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 24), M.paintWhite, `ceilingFixture:${l.room}:ring`, { cast: false });
      ring.position.set(x, H - 0.004, z);
      const lens = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 24), M.downlight, `ceilingFixture:${l.room}:lens`, { cast: false });
      lens.position.set(x, H - 0.01, z);
      g.add(ring, lens);
    }
  }
  return g;
}

// ═══════════════════════════════════════════════════════
export function buildShell() {
  const root = new THREE.Group();
  root.name = 'shell';
  root.add(buildWalls());
  const { floors, ceilings } = buildFloorsAndCeilings();
  root.add(floors, ceilings);

  const doors = new THREE.Group();
  doors.name = 'doors';
  for (const [id, d] of Object.entries(L.DOORS)) doors.add(d.kind === 'sliding' ? slidingDoor(id, d) : swingDoor(id, d));
  root.add(doors);

  const windows = new THREE.Group();
  windows.name = 'windows';
  for (const [id, o] of Object.entries(L.WINDOWS)) windows.add(windowUnit(id, o));
  root.add(windows);

  root.add(buildExterior(), buildSky(), buildLights());
  return root;
}
