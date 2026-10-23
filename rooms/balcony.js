/**
 * rooms/balcony.js — 陽台：工作陽台兼小花園
 *
 * 上牆（z0）：洗衣槽（附洗衣板）＋滾筒洗衣機、壁磚、層板、水龍頭、串燈
 * 右牆（x1）：戶外壁燈、洗衣籃、掃把
 * 天花：兩根升降式晾衣桿，掛 T 恤、毛巾、長褲、襪子夾
 * 女兒牆（x0）內側：琴葉榕、天竺葵、木層架＋多肉／羅勒、白鶴芋、虎尾蘭
 * 中間：朝夕陽的木折椅＋小圓凳、澆水壺、拖鞋
 *
 * 所有位置都由 layout.js 的房間內側邊界／開口／門掃掠區推出。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';

const ROOM = 'balcony';
const PI = Math.PI;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ───────────────────────────────────────────────────────
// 小工具
// ───────────────────────────────────────────────────────
const MAT_NAME = new Map(Object.entries(M).filter(([, v]) => v && v.isMaterial).map(([k, v]) => [v, k]));

function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
/** 對幾何直接套用 縮放→旋轉→平移 */
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], order = 'XYZ') {
  _e.set(r[0], r[1], r[2], order);
  _q.setFromEuler(_e);
  _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  geo.applyMatrix4(_m);
  return geo;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.01, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999);
const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const tube = (pts, r, segs = 16, radial = 6) =>
  new THREE.TubeGeometry(pts.length === 3 ? new THREE.QuadraticBezierCurve3(...pts) : new THREE.CatmullRomCurve3(pts), segs, r, radial);

function merge(geos) {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    n.clearGroups();
    return n;
  });
  return mergeGeometries(list, false);
}

/** 依材質收集幾何，最後每種材質合併成一個 mesh */
class Bucket {
  constructor() { this.map = new Map(); }
  add(mat, geo) {
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(geo);
    return this;
  }
  build(prefix, opts = {}) {
    const g = new THREE.Group();
    g.name = `${ROOM}:${prefix}`;
    for (const [mat, geos] of this.map) {
      const castOff = mat === M.glass || mat === M.lampBulb || mat === M.lampShade;
      g.add(mesh(merge(geos), mat, `${prefix}:${MAT_NAME.get(mat) ?? 'part'}`, { cast: !castOff && opts.cast !== false }));
    }
    return g;
  }
}

/** 點是否在多邊形內 */
function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * 有厚度的布片：u,v ∈ [0,1] 網格 → map(u,v) 給位置；mask(u,v) 決定該格要不要。
 * 正反兩面（材質是單面），中間隔 t。
 */
function clothSheet(nu, nv, map, mask, t = 0.004) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const p = map(i / nu, j / nv);
      pos.push(p.x, p.y, p.z);
      uv.push(i / nu, j / nv);
    }
  }
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      if (!mask((i + 0.5) / nu, (j + 0.5) / nv)) continue;
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  front.setIndex(idx);
  front.computeVertexNormals();
  const n = front.attributes.normal.array;
  const count = pos.length / 3;
  const allPos = new Float32Array(count * 6), allNor = new Float32Array(count * 6), allUv = new Float32Array(count * 4);
  for (let k = 0; k < count * 3; k++) {
    allPos[k] = pos[k] + n[k] * t * 0.5;
    allPos[count * 3 + k] = pos[k] - n[k] * t * 0.5;
    allNor[k] = n[k];
    allNor[count * 3 + k] = -n[k];
  }
  allUv.set(uv, 0);
  allUv.set(uv, count * 2);
  const backIdx = [];
  for (let k = 0; k < idx.length; k += 3) backIdx.push(idx[k] + count, idx[k + 2] + count, idx[k + 1] + count);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(allPos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(allNor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(allUv, 2));
  g.setIndex([...idx, ...backIdx]);
  return g;
}

// ───────────────────────────────────────────────────────
// 植物零件
// ───────────────────────────────────────────────────────
/**
 * 葉片：沿 +x 生長、寬度在 z、y 朝上。droop 讓葉尖下垂、fold 讓葉片沿中肋對折成 V。
 */
function leafGeo(len, wid, { droop = 0.2, fold = 0.25, shape = 'ellipse', segs = 6 } = {}) {
  const g = new THREE.PlaneGeometry(1, 1, 2, segs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const sx = p.getX(i) * 2;          // -1..1
    const t = p.getY(i) + 0.5;         // 0 基部 → 1 葉尖
    let prof;
    if (shape === 'round') prof = Math.pow(Math.sin(PI * (0.12 + 0.88 * t)), 0.55);
    else if (shape === 'obovate') prof = Math.pow(Math.sin(PI * t), 0.6) * (0.55 + 0.55 * t);
    else if (shape === 'blade') prof = Math.min(1, (1 - t) * 5) * (0.8 + 0.2 * Math.sin(PI * t));
    else prof = Math.pow(Math.sin(PI * t), 0.75);
    const half = (sx * wid * prof) / 2;
    const along = t * len;
    p.setXYZ(i, along, -droop * len * t * t + fold * Math.abs(half), half);
  }
  g.computeVertexNormals();
  return g;
}

/** 把葉片轉到 yaw（水平方向）、pitch（仰角）、roll，接在 base 上 */
const placeLeaf = (geo, base, yaw, pitch, roll = 0) => xf(geo, base, [roll, yaw, pitch], [1, 1, 1], 'YZX');
const dirOf = (yaw) => [Math.cos(yaw), -Math.sin(yaw)]; // 對應 placeLeaf 的 yaw → (x, z)

/** 陶盆（車床旋轉剖面，有盆緣）＋土＋水盤；回傳土面高度 */
function pot(b, { r, h, mat = M.terracotta, saucer = true }) {
  const pts = [
    [0, 0], [r * 0.72, 0], [r * 0.75, 0.01], [r * 0.95, h * 0.8], [r * 1.0, h * 0.81],
    [r * 1.04, h * 0.83], [r * 1.04, h], [r * 0.93, h], [r * 0.9, h * 0.86], [r * 0.7, h * 0.12], [0, h * 0.12],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const soilY = h * 0.88;
  b.add(mat, xf(new THREE.LatheGeometry(pts, 28), [0, saucer ? 0.018 : 0, 0]));
  b.add(M.soil, xf(cyl(r * 0.9, r * 0.9, 0.01, 24), [0, (saucer ? 0.018 : 0) + soilY - 0.005, 0]));
  if (saucer) b.add(mat, xf(cyl(r * 0.92, r * 0.82, 0.018, 24), [0, 0.009, 0]));
  return soilY + (saucer ? 0.018 : 0);
}

/** 散開的觀葉植物（白鶴芋／黃金葛類） */
function foliagePlant(b, rng, y0, { count = 16, h = 0.35, spread = 0.22, len = [0.12, 0.18], wid = 0.07, mats = [M.leafGreen, M.leafDark], shape = 'ellipse' }) {
  for (let i = 0; i < count; i++) {
    const yaw = (i / count) * 2 * PI + rng.jitter(0, 0.35);
    const [dx, dz] = dirOf(yaw);
    const rad = rng.range(0.25, 1) * spread * 0.55;
    const ty = y0 + rng.range(0.45, 1) * h;
    const top = V3(dx * rad, ty, dz * rad);
    b.add(M.stem, tube([V3(dx * 0.01, y0, dz * 0.01), V3(dx * rad * 0.15, (y0 + ty) / 2 + 0.05, dz * rad * 0.15), top], 0.0035, 6, 4));
    const L0 = rng.range(len[0], len[1]);
    b.add(rng.pick(mats), placeLeaf(leafGeo(L0, wid * rng.range(0.8, 1.15), { droop: rng.range(0.15, 0.4), fold: 0.3, shape }), [top.x, top.y, top.z], yaw + rng.jitter(0, 0.25), rng.range(-0.1, 0.55), rng.jitter(0, 0.3)));
  }
}

/** 多肉蓮座 */
function succulent(b, rng, base, { size = 1, mat = M.leafOlive } = {}) {
  const n = rng.int(12, 20);
  const golden = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const k = i / n;                        // 0 內 → 1 外
    const len = (0.018 + 0.028 * k) * size;
    const g = xf(new THREE.SphereGeometry(1, 7, 5), [len / 2, 0, 0], [0, 0, 0], [len / 2, 0.006 * size, (0.008 + 0.01 * k) * size]);
    b.add(mat, placeLeaf(g, [base[0], base[1] + 0.004, base[2]], i * golden + rng.jitter(0, 0.1), 1.25 - 1.1 * k));
  }
}

// ───────────────────────────────────────────────────────
// 主程式
// ───────────────────────────────────────────────────────
export function build() {
  const rng = rngFor(ROOM);
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;

  const I = L.roomInterior(ROOM);
  const { x0: X0, x1: X1, z0: Z0, z1: Z1 } = I;
  const H = L.CEILING_HEIGHT;
  const swing = L.doorSwingZone(ROOM);
  const rail = L.openingsOfRoom(ROOM).find((o) => o.category === 'window' && o.side === 'x0');
  const SILL = rail ? rail.sill : 1.1;

  const at = (obj, x, y, z, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y = ry; root.add(obj); return obj; };

  // ═════════════════ 上牆：壁磚 ═════════════════
  const WASH = { w: 0.6, d: 0.58, h: 0.85 };
  const washer = { x: X1 - 0.02 - WASH.w / 2, z: Z0 + 0.06 + WASH.d / 2 };
  const SINK = { w: 0.52, d: 0.46, top: 0.86 };
  const sink = { x: washer.x - WASH.w / 2 - 0.04 - SINK.w / 2, z: Z0 + SINK.d / 2 };
  {
    const b = new Bucket();
    const tx0 = sink.x - SINK.w / 2 - 0.08, tx1 = X1, ty1 = 1.35, T = 0.008;
    b.add(M.tileWallWhite, xf(box(tx1 - tx0, ty1, T), [(tx0 + tx1) / 2, ty1 / 2, Z0 + T / 2]));
    const grout = new Bucket();
    const TILE = 0.15;
    for (let y = TILE; y < ty1; y += TILE) grout.add(M.groutLight, xf(box(tx1 - tx0, 0.003, 0.002), [(tx0 + tx1) / 2, y, Z0 + T + 0.001]));
    for (let x = tx1 - TILE; x > tx0; x -= TILE) grout.add(M.groutLight, xf(box(0.003, ty1, 0.002), [x, ty1 / 2, Z0 + T + 0.001]));
    // 壁磚收邊條
    b.add(M.metalAluminium, xf(box(tx1 - tx0, 0.012, 0.014), [(tx0 + tx1) / 2, ty1 + 0.006, Z0 + 0.007]));
    root.add(b.build('backsplash', { cast: false }), grout.build('backsplashGrout', { cast: false }));
  }

  // ═════════════════ 滾筒洗衣機 ═════════════════
  {
    const g = new THREE.Group();
    g.name = `${ROOM}:washer`;
    const fz = WASH.d / 2; // 前面（本地 +z）
    const body = mesh(rbox(WASH.w, WASH.h - 0.02, WASH.d, 0.035, 3), M.plasticWhite, 'washer');
    body.position.y = 0.02 + (WASH.h - 0.02) / 2;
    g.add(body);
    const b = new Bucket();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(M.rubber, xf(cyl(0.025, 0.028, 0.02, 12), [sx * (WASH.w / 2 - 0.06), 0.01, sz * (WASH.d / 2 - 0.06)]));
    const doorY = 0.4;
    // 門圈、玻璃、滾筒
    b.add(M.metalChrome, xf(new THREE.TorusGeometry(0.19, 0.028, 14, 48), [0, doorY, fz + 0.03]));
    b.add(M.plasticBlack, xf(cyl(0.2, 0.215, 0.025, 48), [0, doorY, fz + 0.012], [PI / 2, 0, 0]));
    b.add(M.rubber, xf(new THREE.TorusGeometry(0.155, 0.014, 10, 40), [0, doorY, fz + 0.022]));
    b.add(M.metalBrushed, xf(cyl(0.15, 0.15, 0.004, 40), [0, doorY, fz + 0.026], [PI / 2, 0, 0]));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 2 * PI + 0.4;
      b.add(M.plasticWhite, xf(box(0.06, 0.02, 0.012), [Math.cos(a) * 0.12, doorY + Math.sin(a) * 0.12, fz + 0.032], [0, 0, a]));
    }
    // 滾筒裡的衣服
    b.add(M.fabricLinen, xf(new THREE.SphereGeometry(1, 14, 10), [0.02, doorY - 0.07, fz + 0.03], [0.3, 0, 0.2], [0.12, 0.06, 0.012]));
    b.add(M.fabricWhite, xf(new THREE.SphereGeometry(1, 14, 10), [-0.05, doorY - 0.1, fz + 0.034], [0, 0, -0.4], [0.08, 0.04, 0.01]));
    b.add(M.metalChrome, xf(rbox(0.035, 0.11, 0.03, 0.01), [0.215, doorY, fz + 0.025]));
    // 控制面板
    const py = WASH.h - 0.085;
    b.add(M.plasticWhite, xf(rbox(WASH.w - 0.04, 0.11, 0.02, 0.008), [0, py, fz + 0.002]));
    b.add(M.plasticWhite, xf(rbox(0.17, 0.075, 0.02, 0.006), [-0.19, py, fz + 0.012]));
    b.add(M.plasticBlack, xf(box(0.08, 0.01, 0.004), [-0.19, py - 0.022, fz + 0.022]));
    b.add(M.screenOff, xf(box(0.11, 0.045, 0.004), [0.06, py, fz + 0.013]));
    b.add(M.metalChrome, xf(cyl(0.035, 0.038, 0.03, 32), [0.2, py, fz + 0.02], [PI / 2, 0, 0]));
    b.add(M.plasticBlack, xf(box(0.006, 0.03, 0.006), [0.2, py + 0.015, fz + 0.037]));
    for (let k = 0; k < 4; k++) b.add(M.plasticBlack, xf(cyl(0.007, 0.007, 0.006, 10), [-0.02 + k * 0.035 - 0.02, py - 0.035, fz + 0.014], [PI / 2, 0, 0]));
    b.add(M.ledStrip, xf(box(0.02, 0.006, 0.003), [0.06, py + 0.034, fz + 0.013]));
    // 機頂：疊好的毛巾＋洗衣精量杯
    b.add(M.fabricWhite, xf(rbox(0.32, 0.05, 0.22, 0.02), [-0.08, WASH.h + 0.025, -0.02], [0, 0.08, 0]));
    b.add(M.fabricOat, xf(rbox(0.3, 0.045, 0.2, 0.02), [-0.07, WASH.h + 0.072, -0.03], [0, -0.05, 0]));
    b.add(M.plasticWhite, xf(cyl(0.035, 0.028, 0.06, 16), [0.18, WASH.h + 0.03, 0.12]));
    // 後方進水管＋排水管（排水管跨到洗衣槽裡）
    b.add(M.rubber, tube([V3(-WASH.w / 2 + 0.08, WASH.h - 0.1, -WASH.d / 2 - 0.02), V3(-WASH.w / 2 + 0.04, WASH.h + 0.12, -WASH.d / 2 + 0.02), V3(-WASH.w / 2 - 0.12, SINK.top + 0.04, -WASH.d / 2 + 0.12), V3(-WASH.w / 2 - 0.2, SINK.top - 0.06, -WASH.d / 2 + 0.16)], 0.011, 24, 8));
    b.add(M.paintWhite, tube([V3(0.2, WASH.h - 0.05, -WASH.d / 2 - 0.02), V3(0.2, WASH.h + 0.12, -WASH.d / 2 - 0.035), V3(0.22, 1.08, -WASH.d / 2 - 0.045)], 0.008, 12, 6));
    g.add(b.build('washerParts'));
    at(g, washer.x, 0, washer.z);
    // 水龍頭（洗衣機進水）
    const v = new Bucket();
    v.add(M.metalChrome, xf(cyl(0.012, 0.012, 0.05, 12), [washer.x + 0.22, 1.1, Z0 + 0.033], [PI / 2, 0, 0]));
    v.add(M.metalChrome, xf(cyl(0.015, 0.015, 0.03, 12), [washer.x + 0.22, 1.1, Z0 + 0.06]));
    v.add(M.metalChrome, xf(box(0.05, 0.008, 0.012), [washer.x + 0.22, 1.12, Z0 + 0.06]));
    root.add(v.build('washerTap'));
  }

  // ═════════════════ 洗衣槽（附洗衣板）＋架子 ═════════════════
  {
    const b = new Bucket();
    const { w, d, top } = SINK;
    const bh = 0.25, t = 0.03, y0 = top - bh;
    // 不鏽鋼腳架＋下層木板
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(M.metalChrome, xf(box(0.03, y0, 0.03), [sx * (w / 2 - 0.035), y0 / 2, sz * (d / 2 - 0.035)]));
    for (const sx of [-1, 1]) b.add(M.metalChrome, xf(box(0.02, 0.02, d - 0.07), [sx * (w / 2 - 0.035), 0.16, 0]));
    for (let k = 0; k < 5; k++) b.add(M.woodOak, xf(box(w - 0.06, 0.018, 0.065), [0, 0.18, -d / 2 + 0.07 + k * 0.08]));
    // 陶瓷槽體
    b.add(M.ceramicWhite, xf(rbox(w, t, d, 0.01), [0, y0 + t / 2, 0]));
    b.add(M.ceramicWhite, xf(rbox(w, bh, t, 0.012), [0, y0 + bh / 2, -d / 2 + t / 2]));
    b.add(M.ceramicWhite, xf(rbox(w, bh, t, 0.012), [0, y0 + bh / 2, d / 2 - t / 2]));
    for (const sx of [-1, 1]) b.add(M.ceramicWhite, xf(rbox(t, bh, d, 0.012), [sx * (w / 2 - t / 2), y0 + bh / 2, 0]));
    // 洗衣板：前半段斜面＋橫紋
    const wbLen = 0.22, ang = 0.62;
    const wb = [];
    wb.push(box(w - 2 * t, 0.02, wbLen));
    for (let k = 0; k < 9; k++) wb.push(xf(cyl(0.006, 0.006, w - 2 * t - 0.02, 8), [0, 0.012, -wbLen / 2 + 0.02 + k * 0.022], [0, 0, PI / 2]));
    const wbz = d / 2 - t - (wbLen * Math.cos(ang)) / 2, wby = top - 0.02 - (wbLen * Math.sin(ang)) / 2;
    for (const g of wb) b.add(M.ceramicWhite, xf(g, [0, wby, wbz], [-ang, 0, 0]));
    b.add(M.metalChrome, xf(cyl(0.025, 0.025, 0.004, 20), [0, y0 + t + 0.002, -d / 2 + 0.1]));
    b.add(M.paintCream, xf(rbox(0.08, 0.025, 0.05, 0.01), [0.08, wby + 0.03, wbz], [-ang, 0.3, 0])); // 肥皂
    // 刷子
    b.add(M.woodOak, xf(rbox(0.12, 0.025, 0.05, 0.01), [-w / 2 + 0.05, top + 0.035, 0.02], [0, 0.4, 0]));
    b.add(M.fabricOat, xf(box(0.11, 0.025, 0.045), [-w / 2 + 0.05, top + 0.012, 0.02], [0, 0.4, 0]));
    // 下層：水桶＋抹布
    const pail = [[0, 0], [0.1, 0], [0.12, 0.2], [0.125, 0.205], [0.112, 0.205], [0.092, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(M.plasticSage, xf(new THREE.LatheGeometry(pail, 24), [-0.08, 0.19, 0.02]));
    b.add(M.metalChrome, xf(new THREE.TorusGeometry(0.12, 0.003, 6, 24, PI), [-0.08, 0.395, 0.02], [0, 0.6, 0]));
    b.add(M.fabricOat, xf(rbox(0.16, 0.012, 0.12, 0.005), [0.14, 0.198, 0.04], [0, 0.3, 0]));
    // 壁掛水龍頭
    const fy = top + 0.24, fz0 = -d / 2;
    b.add(M.metalChrome, xf(cyl(0.028, 0.028, 0.012, 20), [0, fy, fz0 + 0.014], [PI / 2, 0, 0]));
    b.add(M.metalChrome, tube([V3(0, fy, fz0 + 0.01), V3(0, fy + 0.02, fz0 + 0.16), V3(0, fy - 0.08, fz0 + 0.17)], 0.011, 16, 10));
    b.add(M.metalChrome, xf(cyl(0.014, 0.011, 0.03, 12), [0, fy - 0.09, fz0 + 0.17]));
    b.add(M.metalChrome, xf(cyl(0.012, 0.012, 0.05, 12), [0, fy + 0.035, fz0 + 0.05]));
    b.add(M.metalChrome, xf(rbox(0.09, 0.012, 0.018, 0.005), [0, fy + 0.065, fz0 + 0.05]));
    const g = b.build('laundrySink');
    at(g, sink.x, 0, sink.z);
    // 地上排水孔
    const dr = new Bucket();
    dr.add(M.metalChrome, box(0.12, 0.004, 0.12));
    for (let k = -2; k <= 2; k++) dr.add(M.stoneDark, xf(box(0.09, 0.002, 0.008), [0, 0.002, k * 0.02]));
    at(dr.build('floorDrain', { cast: false }), sink.x - SINK.w / 2 - 0.02, 0.002, sink.z + SINK.d / 2 + 0.12);
  }

  // ═════════════════ 洗衣機上方層板（洗劑、晒衣夾、垂吊黃金葛） ═════════════════
  {
    const b = new Bucket();
    const sy = 1.55, sd = 0.22, sw = WASH.w + 0.02;
    b.add(M.woodOak, xf(rbox(sw, 0.028, sd, 0.006), [0, sy, sd / 2]));
    for (const sx of [-1, 1]) {
      b.add(M.metalBlack, xf(box(0.02, 0.16, 0.012), [sx * (sw / 2 - 0.08), sy - 0.094, 0.006]));
      b.add(M.metalBlack, xf(box(0.02, 0.012, sd - 0.03), [sx * (sw / 2 - 0.08), sy - 0.02, (sd - 0.03) / 2]));
      b.add(M.metalBlack, tube([V3(sx * (sw / 2 - 0.08), sy - 0.16, 0.012), V3(sx * (sw / 2 - 0.08), sy - 0.07, sd * 0.35), V3(sx * (sw / 2 - 0.08), sy - 0.03, sd - 0.05)], 0.005, 8, 5));
    }
    const top = sy + 0.014;
    // 洗衣精（有把手的方瓶）
    const jug = (x, z, mat, capMat, s = 1) => {
      b.add(mat, xf(rbox(0.13 * s, 0.24 * s, 0.09 * s, 0.025), [x, top + 0.12 * s, z]));
      b.add(capMat, xf(cyl(0.022, 0.024, 0.035, 16), [x + 0.035 * s, top + 0.24 * s + 0.017, z]));
      b.add(mat, xf(new THREE.TorusGeometry(0.035 * s, 0.012 * s, 8, 16, PI), [x - 0.03 * s, top + 0.2 * s, z], [0, 0, PI / 2]));
    };
    jug(-0.2, 0.1, M.plasticSage, M.plasticWhite);
    jug(-0.05, 0.11, M.plasticWhite, M.plasticBlue, 0.85);
    // 柔軟精圓瓶
    b.add(M.plasticBlush, xf(cyl(0.035, 0.04, 0.2, 20), [0.07, top + 0.1, 0.12]));
    b.add(M.plasticWhite, xf(cyl(0.022, 0.03, 0.03, 16), [0.07, top + 0.215, 0.12]));
    // 晒衣夾玻璃罐
    b.add(M.glass, xf(cyl(0.045, 0.045, 0.12, 24), [0.25, top + 0.06, 0.08]));
    b.add(M.woodAsh, xf(cyl(0.047, 0.047, 0.015, 24), [0.25, top + 0.127, 0.08]));
    const pr = rngFor(`${ROOM}:pegs`);
    for (let k = 0; k < 14; k++) {
      const a = pr.range(0, 2 * PI), r = pr.range(0, 0.03);
      b.add(pr.chance(0.5) ? M.plasticWhite : M.plasticSage, xf(box(0.009, 0.065, 0.012), [0.25 + Math.cos(a) * r, top + 0.035 + pr.range(0, 0.05), 0.08 + Math.sin(a) * r], [pr.range(-0.6, 0.6), a, pr.range(-0.6, 0.6)]));
    }
    // 垂吊黃金葛
    const pr2 = rng.fork('pothos');
    const potB = new Bucket();
    const soil = pot(potB, { r: 0.065, h: 0.11, mat: M.ceramicMatte, saucer: false });
    for (let v = 0; v < 5; v++) {
      const yaw = PI * 0.15 + v * 0.35 + pr2.jitter(0, 0.1);
      const [dx, dz] = [Math.sin(yaw) * 0.5, Math.cos(yaw)];
      const len = pr2.range(0.25, 0.5);
      const pts = [V3(0, soil, 0), V3(dx * 0.06, soil + 0.03, dz * 0.07), V3(dx * 0.09, soil - 0.03, dz * 0.12 + 0.02), V3(dx * 0.1 + pr2.jitter(0, 0.02), soil - len * 0.6, dz * 0.13 + 0.04), V3(dx * 0.12 + pr2.jitter(0, 0.03), soil - len, dz * 0.12 + 0.05)];
      const curve = new THREE.CatmullRomCurve3(pts);
      potB.add(M.stem, new THREE.TubeGeometry(curve, 20, 0.0025, 4));
      const nl = Math.round(len * 22);
      for (let k = 1; k <= nl; k++) {
        const pt = curve.getPoint(k / (nl + 0.5));
        const side = k % 2 ? 1 : -1;
        potB.add(pr2.chance(0.3) ? M.leafOlive : M.leafGreen, placeLeaf(leafGeo(pr2.range(0.04, 0.06), 0.04, { shape: 'round', droop: 0.3, fold: 0.15 }), [pt.x, pt.y, pt.z], -PI / 2 + side * 0.9 + pr2.jitter(0, 0.4), pr2.range(-0.6, 0.1), pr2.jitter(0, 0.3)));
      }
    }
    const pg = potB.build('shelfPothos');
    pg.position.set(0.2, top, 0.1);
    pg.rotation.y = 0.0;
    const sg = b.build('wallShelf');
    sg.add(pg);
    at(sg, washer.x, 0, Z0);
  }

  // ═════════════════ 晾衣桿（天花升降式）＋衣物 ═════════════════
  const ROD_Y = H - 0.42;
  const rodX = [X0 + 0.42, X0 + 0.82];
  const rodZ0 = Z0 + 0.12, rodZ1 = Z1 - 0.12;
  {
    const b = new Bucket();
    const rodLen = rodZ1 - rodZ0, zc = (rodZ0 + rodZ1) / 2;
    for (const x of rodX) {
      b.add(M.metalAluminium, xf(cyl(0.014, 0.014, rodLen, 20), [x, ROD_Y, zc], [PI / 2, 0, 0]));
      for (const z of [rodZ0, rodZ1]) b.add(M.plasticWhite, xf(cyl(0.017, 0.017, 0.02, 16), [x, ROD_Y, z], [PI / 2, 0, 0]));
    }
    for (const z of [rodZ0 + 0.06, rodZ1 - 0.06]) {
      const xa = rodX[0] - 0.05, xb = rodX[1] + 0.05;
      b.add(M.metalAluminium, xf(rbox(xb - xa, 0.025, 0.025, 0.006), [(xa + xb) / 2, ROD_Y + 0.025, z]));
      for (const x of rodX) b.add(M.plasticWhite, xf(rbox(0.04, 0.05, 0.035, 0.008), [x, ROD_Y + 0.005, z]));
      // 升降繩與天花座
      const xm = (xa + xb) / 2;
      b.add(M.metalAluminium, xf(cyl(0.003, 0.003, H - ROD_Y - 0.06, 6), [xm, (H + ROD_Y) / 2 - 0.01, z]));
      b.add(M.plasticWhite, xf(rbox(0.1, 0.05, 0.06, 0.012), [xm, H - 0.025, z]));
    }
    root.add(b.build('dryingRack'));
  }

  const crng = rng.fork('clothes');
  /** 掛衣架（木製肩架＋鉻鉤），本地原點＝桿中心，衣架平面＝xy（垂直於桿） */
  const hangerGeos = (b, width = 0.4) => {
    b.add(M.metalChrome, tube([V3(0, -0.075, 0), V3(0, -0.035, 0), V3(0.02, -0.005, 0), V3(0.006, 0.024, 0), V3(-0.018, 0.012, 0), V3(-0.022, -0.008, 0)], 0.0025, 20, 5));
    b.add(M.woodOak, tube([V3(-width / 2, -0.15, 0), V3(0, -0.06, 0), V3(width / 2, -0.15, 0)], 0.008, 20, 6));
    b.add(M.woodOak, xf(rbox(0.04, 0.025, 0.02, 0.006), [0, -0.075, 0]));
  };
  const SHIRT = [[-0.075, 0], [-0.19, -0.035], [-0.3, -0.21], [-0.22, -0.265], [-0.18, -0.21], [-0.2, -0.68], [0.2, -0.68], [0.18, -0.21], [0.22, -0.265], [0.3, -0.21], [0.19, -0.035], [0.075, 0], [0.04, -0.035], [0, -0.05], [-0.04, -0.035]];
  const tshirt = (name, x, z, mat, s = 1, yaw = 0) => {
    const b = new Bucket();
    hangerGeos(b, 0.4 * s);
    const ph = crng.range(0, 6), amp = crng.range(0.008, 0.02), sway = crng.jitter(0, 0.03);
    const W = 0.62 * s, Hh = 0.7 * s;
    b.add(mat, xf(clothSheet(24, 28, (u, v) => {
      const lx = (u - 0.5) * W, ly = -v * Hh;
      return V3(lx, ly, amp * Math.sin(lx * 18 + ph) * (0.3 + v) + sway * v * v + 0.01 * Math.sin(v * 9 + ph) * Math.abs(lx) * 3);
    }, (u, v) => inPoly(SHIRT, ((u - 0.5) * W) / s, (-v * Hh) / s), 0.005), [0, -0.068, 0]));
    const g = b.build(name);
    at(g, x, ROD_Y, z, yaw);
  };
  const PANTS = [[-0.19, 0], [0.19, 0], [0.22, -0.92], [0.035, -0.92], [0, -0.3], [-0.035, -0.92], [-0.22, -0.92]];
  const pants = (name, x, z, mat) => {
    const b = new Bucket();
    b.add(M.metalChrome, tube([V3(0, -0.06, 0), V3(0, -0.03, 0), V3(0.02, -0.005, 0), V3(0.006, 0.024, 0), V3(-0.018, 0.012, 0), V3(-0.022, -0.008, 0)], 0.0025, 20, 5));
    b.add(M.plasticBlack, xf(rbox(0.4, 0.02, 0.012, 0.004), [0, -0.07, 0]));
    for (const sx of [-1, 1]) b.add(M.plasticBlack, xf(rbox(0.03, 0.05, 0.02, 0.005), [sx * 0.15, -0.095, 0]));
    const ph = crng.range(0, 6);
    b.add(mat, xf(clothSheet(20, 36, (u, v) => {
      const lx = (u - 0.5) * 0.46, ly = -v * 0.94;
      return V3(lx, ly, 0.012 * Math.sin(lx * 14 + ph) * (0.2 + v) + 0.02 * v * v);
    }, (u, v) => inPoly(PANTS, (u - 0.5) * 0.46, -v * 0.94), 0.006), [0, -0.1, 0]));
    // 腰帶反摺
    b.add(mat, xf(rbox(0.38, 0.04, 0.012, 0.004), [0, -0.12, 0]));
    at(b.build(name), x, ROD_Y, z);
  };
  /** 毛巾跨在桿上：前垂 a、後垂 bLen，寬度沿桿（z） */
  const towel = (name, x, z, mat, width, a, bLen, stripeMat) => {
    const b = new Bucket();
    const r = 0.02, arc = PI * r, total = a + arc + bLen;
    const ph = crng.range(0, 6);
    const path = (s) => {
      if (s < a) return [r, -(a - s)];
      if (s < a + arc) { const th = (s - a) / r; return [r * Math.cos(th), r * Math.sin(th)]; }
      return [-r, -(s - a - arc)];
    };
    b.add(mat, clothSheet(30, 10, (u, v) => {
      const [px, py] = path(u * total);
      const hang = Math.max(0, -py);
      const lz = (v - 0.5) * width;
      return V3(px + Math.sign(px) * 0.012 * Math.sin(lz * 20 + ph) * hang * 2, py, lz + 0.01 * Math.sin(py * 6 + ph) * hang);
    }, () => true, 0.007));
    if (stripeMat) for (const s of [a - 0.06, a - 0.08]) {
      b.add(stripeMat, xf(box(0.002, 0.012, width), [r + 0.0045, -(a - s), 0]));
    }
    at(b.build(name), x, ROD_Y, z);
  };
  /** 圓形襪子夾 */
  const sockRing = (name, x, z) => {
    const b = new Bucket();
    const ry = -0.14, R = 0.12;
    b.add(M.plasticWhite, tube([V3(0, -0.01, 0), V3(0, -0.025, 0), V3(0.02, -0.005, 0), V3(0.006, 0.024, 0), V3(-0.018, 0.012, 0)], 0.003, 16, 5));
    b.add(M.plasticWhite, xf(cyl(0.004, 0.004, Math.abs(ry) - 0.02, 6), [0, ry / 2 - 0.012, 0]));
    b.add(M.plasticWhite, xf(new THREE.TorusGeometry(R, 0.006, 8, 40), [0, ry, 0], [PI / 2, 0, 0]));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 2 * PI + PI / 4;
      b.add(M.plasticWhite, tube([V3(0, ry + 0.11, 0), V3(Math.cos(a) * R * 0.6, ry + 0.04, Math.sin(a) * R * 0.6), V3(Math.cos(a) * R, ry, Math.sin(a) * R)], 0.0025, 8, 4));
    }
    const sockMats = [M.fabricOat, M.fabricOat, M.fabricGreyThrow, M.fabricGreyThrow, M.fabricWhite, M.fabricWhite];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * PI;
      const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
      b.add(M.plasticSage, xf(box(0.012, 0.04, 0.02), [cx, ry - 0.02, cz], [0, -a, 0]));
      if (k < sockMats.length) {
        const SOCK = [[-0.03, 0], [0.03, 0], [0.03, -0.17], [0.09, -0.22], [0.08, -0.26], [-0.02, -0.25], [-0.03, -0.2]];
        const sock = clothSheet(6, 14, (u, v) => V3((u - 0.5) * 0.13 + 0.03, -v * 0.27, 0.004 * Math.sin(v * 8)), (u, v) => inPoly(SOCK, (u - 0.5) * 0.13 + 0.03, -v * 0.27), 0.006);
        b.add(sockMats[k], xf(sock, [cx, ry - 0.03, cz], [0, -a + PI / 2, 0]));
      }
    }
    at(b.build(name), x, ROD_Y, z);
  };
  {
    const [ra, rb] = rodX;
    const z = (f) => rodZ0 + (rodZ1 - rodZ0) * f;
    tshirt('clothes:tshirtWhite', ra, z(0.12), M.fabricWhite, 1, crng.jitter(0, 0.05));
    tshirt('clothes:tshirtBeige', ra, z(0.2), M.fabricLinen, 0.95, crng.jitter(0, 0.05));
    tshirt('clothes:tshirtTaupe', ra, z(0.28), M.fabricTaupe, 0.9, crng.jitter(0, 0.05));
    towel('clothes:towelOat', ra, z(0.47), M.fabricOat, 0.4, 0.42, 0.34, M.fabricTaupe);
    sockRing('clothes:sockRing', ra, z(0.84));
    towel('clothes:towelWhite', rb, z(0.08), M.fabricWhite, 0.36, 0.4, 0.3, M.fabricOat);
    tshirt('clothes:tshirtGrey', rb, z(0.3), M.fabricBoucle, 1, crng.jitter(0, 0.05));
    pants('clothes:pants', rb, z(0.45), M.fabricGreyThrow);
    tshirt('clothes:tshirtLinen', rb, z(0.58), M.fabricLinen, 1.05, crng.jitter(0, 0.05));
    towel('clothes:handTowel', rb, z(0.8), M.fabricTaupe, 0.26, 0.3, 0.22);
  }

  // ═════════════════ 女兒牆內側：盆栽 ═════════════════
  const potX = X0 + 0.2; // 盆中心離女兒牆
  // —— 角落琴葉榕（最高，離牆一點，讓高出女兒牆的部分不貼窗） ——
  {
    const pr = rng.fork('fiddleFig');
    const b = new Bucket();
    const R = 0.17;
    const soil = pot(b, { r: R, h: 0.34, mat: M.ceramicMatte });
    const topY = 1.5;
    const trunk = [V3(0, soil - 0.02, 0), V3(0.02, 0.7, -0.01), V3(-0.01, 1.05, 0.02), V3(0.015, topY - 0.08, 0)];
    const curve = new THREE.CatmullRomCurve3(trunk);
    b.add(M.stem, new THREE.TubeGeometry(curve, 16, 0.013, 7));
    // 一根側枝
    const br = [curve.getPoint(0.55), V3(0.1, 1.05, 0.06), V3(0.15, 1.2, 0.1)];
    b.add(M.stem, tube(br, 0.008, 10, 6));
    const branch = new THREE.QuadraticBezierCurve3(...br);
    const maxReach = 0.24;
    const leafAt = (pt, yaw, i, n) => {
      const pitch = pr.range(-0.15, 0.45);
      let len = pr.range(0.17, 0.24) * (0.8 + 0.3 * (i / n));
      const [dx] = dirOf(yaw);
      const reach = Math.hypot(pt.x, pt.z) + len * Math.cos(pitch) + 0.02;
      if (reach > maxReach) len *= maxReach / reach;
      const g = leafGeo(len, len * 0.72, { shape: 'obovate', droop: pr.range(0.1, 0.25), fold: 0.18, segs: 7 });
      b.add(dx < -0.3 && pr.chance(0.5) ? M.leafDark : pr.pick([M.leafGreen, M.leafDark, M.leafDark]), placeLeaf(g, [pt.x + Math.cos(yaw) * 0.015, pt.y, pt.z - Math.sin(yaw) * 0.015], yaw, pitch, pr.jitter(0, 0.4)));
    };
    const n = 20;
    for (let i = 0; i < n; i++) leafAt(curve.getPoint(0.35 + 0.65 * (i / n)), i * 2.4 + pr.jitter(0, 0.3), i, n);
    for (let i = 0; i < 6; i++) leafAt(branch.getPoint(0.3 + i * 0.12), i * 2.2 + 0.5, i + 10, n);
    for (let i = 0; i < 3; i++) leafAt(curve.getPoint(1), i * 2.1 + 0.3, n, n);
    at(b.build('plant:fiddleFig'), X0 + 0.34, 0, Z0 + 0.32);
  }
  // —— 天竺葵 ——
  {
    const pr = rng.fork('geranium');
    const b = new Bucket();
    const soil = pot(b, { r: 0.12, h: 0.2 });
    for (let i = 0; i < 22; i++) {
      const yaw = (i / 22) * 2 * PI * 1.7 + pr.jitter(0, 0.3);
      const [dx, dz] = dirOf(yaw);
      const rad = pr.range(0.03, 0.12);
      const ty = soil + pr.range(0.06, 0.18);
      const top = V3(dx * rad, ty, dz * rad);
      b.add(M.stem, tube([V3(dx * 0.01, soil, dz * 0.01), V3(dx * rad * 0.3, ty, dz * rad * 0.3), top], 0.003, 6, 4));
      b.add(pr.chance(0.35) ? M.leafOlive : M.leafGreen, placeLeaf(leafGeo(pr.range(0.06, 0.085), 0.085, { shape: 'round', droop: 0.15, fold: 0.12, segs: 4 }), [top.x, top.y, top.z], yaw, pr.range(-0.1, 0.35), pr.jitter(0, 0.3)));
    }
    for (let f = 0; f < 6; f++) {
      const yaw = f * 1.1 + pr.jitter(0, 0.3);
      const [dx, dz] = dirOf(yaw);
      const rad = pr.range(0.02, 0.08);
      const top = V3(dx * rad, soil + pr.range(0.22, 0.3), dz * rad);
      b.add(M.stem, tube([V3(0, soil, 0), V3(dx * rad * 0.5, top.y - 0.08, dz * rad * 0.5), top], 0.0025, 8, 4));
      const mat = f % 3 === 2 ? M.fabricLinen : M.fabricWhite;
      for (let k = 0; k < 14; k++) {
        const a = pr.range(0, 2 * PI), e = pr.range(0, 1.2);
        b.add(mat, xf(new THREE.SphereGeometry(0.011, 6, 4), [top.x + Math.cos(a) * Math.sin(e) * 0.03, top.y + Math.cos(e) * 0.02, top.z + Math.sin(a) * Math.sin(e) * 0.03], [0, 0, 0], [1, 0.55, 1]));
      }
    }
    at(b.build('plant:geranium'), potX + 0.02, 0, Z0 + 0.66);
  }
  // —— 木層架（多肉、羅勒）＋架下疊放空盆 ——
  const BENCH = { z0: Z0 + 0.88, len: 0.6, d: 0.3, h: 0.4 };
  {
    const b = new Bucket();
    const { len, d, h } = BENCH;
    for (let k = 0; k < 4; k++) b.add(M.woodOak, xf(rbox(d / 4 - 0.008, 0.022, len, 0.004), [-d / 2 + d / 8 + (k * d) / 4, h - 0.011, 0]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(M.woodOakDark, xf(box(0.035, h - 0.022, 0.035), [sx * (d / 2 - 0.025), (h - 0.022) / 2, sz * (len / 2 - 0.03)]));
    for (const sz of [-1, 1]) b.add(M.woodOakDark, xf(box(d - 0.05, 0.03, 0.02), [0, 0.1, sz * (len / 2 - 0.03)]));
    for (const sx of [-1, 1]) b.add(M.woodOakDark, xf(box(0.02, 0.03, len - 0.06), [sx * (d / 2 - 0.025), 0.1, 0]));
    for (let k = 0; k < 3; k++) b.add(M.woodOak, xf(box(d - 0.07, 0.015, 0.08), [0, 0.122, -0.18 + k * 0.18]));
    // 架下疊放的空陶盆
    for (let k = 0; k < 3; k++) {
      const pts = [[0.055, 0], [0.08, 0.1], [0.085, 0.1], [0.085, 0.115], [0.075, 0.115], [0.072, 0.1], [0.048, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y));
      if (k === 0) pts.unshift(new THREE.Vector2(0, 0));
      b.add(M.terracotta, xf(new THREE.LatheGeometry(pts, 20), [0, 0.13 + k * 0.03, -0.12], [0, 0, k * 0.04]));
    }
    // 小鏟子
    b.add(M.woodOak, xf(cyl(0.012, 0.012, 0.1, 10), [0.04, 0.136, 0.14], [0, 0, PI / 2]));
    b.add(M.metalBrushed, xf(rbox(0.07, 0.006, 0.05, 0.003), [-0.04, 0.133, 0.14]));
    const g = b.build('plantBench');
    at(g, X0 + d / 2 + 0.03, 0, BENCH.z0 + len / 2);

    // 架上的盆
    const topY = h;
    const pots = [
      { dz: 0.09, r: 0.055, h: 0.07, mat: M.ceramicMatte, kind: 'succ' },
      { dz: 0.22, r: 0.065, h: 0.08, mat: M.terracotta, kind: 'succ2' },
      { dz: 0.33, r: 0.05, h: 0.065, mat: M.ceramicMatte, kind: 'succ3' },
      { dz: 0.49, r: 0.08, h: 0.11, mat: M.ceramicMatte, kind: 'basil' },
    ];
    for (const p of pots) {
      const pr = rng.fork(`bench:${p.kind}`);
      const pb = new Bucket();
      const soil = pot(pb, { r: p.r, h: p.h, mat: p.mat, saucer: p.kind === 'basil' });
      if (p.kind === 'basil') {
        for (let s = 0; s < 6; s++) {
          const yaw = s * 1.05 + pr.jitter(0, 0.2);
          const [dx, dz] = dirOf(yaw);
          const hh = pr.range(0.12, 0.2);
          const base = V3(dx * 0.02, soil, dz * 0.02), tip = V3(dx * 0.04, soil + hh, dz * 0.04);
          pb.add(M.stem, tube([base, V3(dx * 0.03, soil + hh * 0.5, dz * 0.03), tip], 0.0025, 6, 4));
          for (let n = 0; n < 4; n++) {
            const t = 0.35 + n * 0.2;
            const pt = V3(base.x + (tip.x - base.x) * t, base.y + (tip.y - base.y) * t, base.z + (tip.z - base.z) * t);
            for (const side of [0, PI]) pb.add(M.leafOlive, placeLeaf(leafGeo(0.045 - n * 0.006, 0.03, { droop: 0.25, fold: 0.35, segs: 4 }), [pt.x, pt.y, pt.z], n * PI / 2 + side + pr.jitter(0, 0.2), 0.35, 0));
          }
        }
      } else if (p.kind === 'succ') {
        succulent(pb, pr, [0, soil, 0], { size: 1.0, mat: M.leafOlive });
      } else if (p.kind === 'succ2') {
        succulent(pb, pr, [-0.02, soil, 0.015], { size: 0.8, mat: M.leafGreen });
        succulent(pb, pr, [0.025, soil, -0.01], { size: 0.65, mat: M.leafOlive });
        succulent(pb, pr, [-0.01, soil, -0.03], { size: 0.5, mat: M.leafGreen });
      } else {
        // 小仙人掌
        pb.add(M.leafDark, xf(new THREE.SphereGeometry(1, 12, 10), [0, soil + 0.05, 0], [0, 0, 0], [0.03, 0.06, 0.03]));
        pb.add(M.leafDark, xf(new THREE.SphereGeometry(1, 10, 8), [0.025, soil + 0.07, 0], [0, 0, -0.5], [0.014, 0.03, 0.014]));
        pb.add(M.fabricWhite, xf(new THREE.SphereGeometry(0.008, 6, 4), [0, soil + 0.11, 0]));
      }
      at(pb.build(`plant:${p.kind}`), X0 + 0.03 + d / 2 + pr.jitter(0, 0.02), topY, BENCH.z0 + p.dz);
    }
  }
  // —— 白鶴芋（散開的大葉，開幾朵白花） ——
  {
    const pr = rng.fork('peaceLily');
    const b = new Bucket();
    const soil = pot(b, { r: 0.15, h: 0.28, mat: M.ceramicMatte });
    foliagePlant(b, pr, soil, { count: 18, h: 0.38, spread: 0.22, len: [0.13, 0.18], wid: 0.075 });
    for (let f = 0; f < 3; f++) {
      const yaw = f * 2.1 + 0.4;
      const [dx, dz] = dirOf(yaw);
      const top = V3(dx * 0.05, soil + pr.range(0.42, 0.5), dz * 0.05);
      b.add(M.stem, tube([V3(0, soil, 0), V3(dx * 0.03, soil + 0.25, dz * 0.03), top], 0.003, 8, 4));
      b.add(M.fabricWhite, placeLeaf(leafGeo(0.08, 0.05, { droop: -0.2, fold: 0.6, segs: 4 }), [top.x, top.y - 0.03, top.z], yaw + PI, 1.25));
      b.add(M.fabricOat, xf(cyl(0.006, 0.004, 0.04, 6), [top.x, top.y + 0.0, top.z]));
    }
    at(b.build('plant:peaceLily'), X0 + 0.3, 0, BENCH.z0 + BENCH.len + 0.26);
  }
  // —— 虎尾蘭（角落，直立劍葉，低於女兒牆） ——
  {
    const pr = rng.fork('snakePlant');
    const b = new Bucket();
    const soil = pot(b, { r: 0.11, h: 0.24, mat: M.ceramicMatte });
    for (let i = 0; i < 11; i++) {
      const yaw = i * 2.4 + pr.jitter(0, 0.3);
      const [dx, dz] = dirOf(yaw);
      const len = pr.range(0.38, 0.62);
      b.add(i % 3 === 0 ? M.leafOlive : M.leafDark, placeLeaf(leafGeo(len, pr.range(0.045, 0.065), { shape: 'blade', droop: -0.03, fold: 0.5, segs: 8 }), [dx * pr.range(0, 0.05), soil - 0.01, dz * pr.range(0, 0.05)], yaw, pr.range(1.32, 1.5), pr.jitter(0, 0.5)));
    }
    at(b.build('plant:snakePlant'), potX + 0.04, 0, Z1 - 0.15);
  }

  // ═════════════════ 木折椅＋小圓凳（面向夕陽） ═════════════════
  const chairX = X0 + 0.88, chairZ = Math.min(swing.z0 + 0.25, Z1 - 0.3);
  {
    const b = new Bucket();
    const sw = 0.42, sd = 0.4, sh = 0.44;
    // 前腳、後腳（後腳延伸成靠背立柱，略後傾）
    for (const sx of [-1, 1]) {
      b.add(M.woodOakDark, xf(box(0.035, sh, 0.035), [sx * (sw / 2 - 0.02), sh / 2, sd / 2 - 0.03], [0.06, 0, 0]));
      b.add(M.woodOakDark, xf(box(0.035, 0.86, 0.035), [sx * (sw / 2 - 0.02), 0.43, -sd / 2 + 0.01], [-0.12, 0, 0]));
      b.add(M.woodOakDark, xf(box(0.025, 0.03, sd), [sx * (sw / 2 - 0.02), sh - 0.05, 0]));
      b.add(M.woodOakDark, xf(box(0.022, 0.022, sd + 0.04), [sx * (sw / 2 - 0.02), 0.14, 0]));
    }
    for (const z of [sd / 2 - 0.03, -sd / 2 + 0.03]) b.add(M.woodOakDark, xf(box(sw - 0.04, 0.03, 0.022), [0, sh - 0.05, z]));
    for (let k = 0; k < 5; k++) b.add(M.woodOak, xf(rbox(sw, 0.02, sd / 5 - 0.012, 0.004), [0, sh - 0.025, -sd / 2 + sd / 10 + (k * sd) / 5]));
    for (let k = 0; k < 3; k++) {
      const y = 0.6 + k * 0.09;
      b.add(M.woodOak, xf(rbox(sw - 0.02, 0.06, 0.018, 0.004), [0, y, -sd / 2 + 0.01 - (y - 0.43) * Math.tan(0.12) + 0.02], [-0.12, 0, 0]));
    }
    // 坐墊＋靠枕
    b.add(M.fabricBoucle, xf(rbox(sw - 0.04, 0.05, sd - 0.04, 0.02, 3), [0, sh + 0.02, 0.01]));
    b.add(M.fabricWhite, xf(rbox(0.3, 0.26, 0.1, 0.045, 3), [0, sh + 0.16, -sd / 2 + 0.06], [-0.2, 0, 0.05]));
    const g = b.build('chair');
    at(g, chairX, 0, chairZ, -PI / 2);

    const s = new Bucket();
    const r = 0.15, hs = 0.45;
    s.add(M.woodOak, xf(cyl(r, r, 0.03, 32), [0, hs - 0.015, 0]));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 2 * PI;
      s.add(M.woodOak, xf(cyl(0.014, 0.016, hs - 0.02, 8), [Math.cos(a) * 0.1, (hs - 0.02) / 2, Math.sin(a) * 0.1], [Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08]));
    }
    s.add(M.woodOak, xf(new THREE.TorusGeometry(0.095, 0.008, 6, 24), [0, 0.16, 0], [PI / 2, 0, 0]));
    // 馬克杯、書、太陽眼鏡般的小物 → 杯與書
    const mug = [[0, 0], [0.04, 0], [0.042, 0.09], [0.036, 0.09], [0.034, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y));
    s.add(M.paintCream, xf(new THREE.LatheGeometry(mug, 20), [0.05, hs, 0.04]));
    s.add(M.paintCream, xf(new THREE.TorusGeometry(0.025, 0.006, 6, 12), [0.095, hs + 0.045, 0.04]));
    s.add(M.woodOak, xf(cyl(0.034, 0.034, 0.002, 16), [0.05, hs + 0.075, 0.04]));
    s.add(M.bookColors[1], xf(box(0.15, 0.022, 0.21), [-0.035, hs + 0.011, -0.04], [0, 0.35, 0]));
    s.add(M.paperWhite, xf(box(0.14, 0.016, 0.2), [-0.03, hs + 0.011, -0.04], [0, 0.35, 0]));
    at(s.build('stool'), chairX, 0, chairZ - 0.45);
  }

  // ═════════════════ 澆水壺 ═════════════════
  {
    const b = new Bucket();
    const body = [[0, 0], [0.085, 0], [0.09, 0.01], [0.085, 0.2], [0.06, 0.24], [0.045, 0.245], [0.045, 0.255], [0, 0.255]].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(M.metalBrushed, new THREE.LatheGeometry(body, 28));
    b.add(M.metalBrushed, tube([V3(0.07, 0.05, 0), V3(0.2, 0.17, 0), V3(0.29, 0.3, 0)], 0.012, 14, 8));
    b.add(M.metalBrushed, xf(cyl(0.032, 0.014, 0.04, 16), [0.3, 0.315, 0], [0, 0, -0.75]));
    b.add(M.metalBrass, xf(cyl(0.033, 0.033, 0.004, 16), [0.314, 0.33, 0], [0, 0, -0.75]));
    b.add(M.metalBrushed, xf(new THREE.TorusGeometry(0.08, 0.009, 8, 20, PI), [-0.01, 0.235, 0], [0, 0, 0.1]));
    b.add(M.metalBrushed, xf(new THREE.TorusGeometry(0.06, 0.008, 8, 16, PI), [-0.085, 0.13, 0], [0, 0, PI / 2]));
    at(b.build('wateringCan'), X0 + 0.5, 0, BENCH.z0 + 0.1, 0.5);
  }

  // ═════════════════ 右牆：洗衣籃、掃把、壁燈 ═════════════════
  const basket = { x: X1 - 0.22, z: washer.z + WASH.d / 2 + 0.3 };
  {
    const b = new Bucket();
    const r0 = 0.17, r1 = 0.2, h = 0.38;
    const prof = [[0, 0], [r0, 0], [r1, h], [r1 + 0.012, h + 0.01], [r1 - 0.012, h + 0.01], [r0 - 0.012, 0.015], [0, 0.015]].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(M.rattan, new THREE.LatheGeometry(prof, 36));
    for (let k = 1; k < 9; k++) {
      const y = (k / 9) * h, rr = r0 + (r1 - r0) * (k / 9) + 0.003;
      b.add(M.woodOakDark, xf(new THREE.TorusGeometry(rr, 0.005, 5, 40), [0, y, 0], [PI / 2, 0, 0]));
    }
    for (const sx of [-1, 1]) b.add(M.rattan, xf(new THREE.TorusGeometry(0.045, 0.009, 6, 14, PI), [sx * (r1 + 0.005), h - 0.03, 0], [0, PI / 2, 0]));
    // 籃內衣物
    const br = rng.fork('basket');
    const mats = [M.fabricWhite, M.fabricBoucle, M.fabricTaupe, M.fabricLinen, M.fabricGreyThrow];
    for (let k = 0; k < 7; k++) {
      const a = br.range(0, 2 * PI), rr = br.range(0, 0.1);
      b.add(mats[k % mats.length], xf(new THREE.SphereGeometry(1, 12, 8), [Math.cos(a) * rr, h - 0.06 + br.range(0, 0.07), Math.sin(a) * rr], [br.range(0, 1), br.range(0, 3), br.range(0, 1)], [br.range(0.07, 0.11), br.range(0.03, 0.05), br.range(0.06, 0.09)]));
    }
    b.add(M.fabricWhite, xf(rbox(0.25, 0.012, 0.12, 0.005), [0.07, h - 0.02, 0.12], [0.3, 0.6, -0.5]));
    at(b.build('laundryBasket'), basket.x, 0, basket.z);
  }
  {
    const b = new Bucket();
    const bz = Math.min(swing.z0 - 0.15, basket.z + 0.45);
    const lean = 0.06;
    // 掃把頭在地上、柄靠在右牆
    b.add(M.woodAsh, new THREE.TubeGeometry(new THREE.LineCurve3(V3(X1 - 0.1, 0.12, bz), V3(X1 - 0.025, 1.25, bz - lean)), 2, 0.012, 10));
    b.add(M.plasticBlack, xf(cyl(0.014, 0.014, 0.03, 10), [X1 - 0.025, 1.26, bz - lean], [0, 0, 0]));
    b.add(M.plasticWhite, xf(rbox(0.05, 0.05, 0.26, 0.01), [X1 - 0.105, 0.12, bz], [0, 0, 0.065]));
    b.add(M.fabricOat, xf(box(0.04, 0.1, 0.25), [X1 - 0.1, 0.05, bz], [0, 0, 0.12]));
    root.add(b.build('broom'));
  }
  // 戶外壁燈（燈籠型）
  const lampPos = { y: 1.95, z: basket.z };
  {
    const b = new Bucket();
    const x = X1;
    b.add(M.metalBlack, xf(rbox(0.012, 0.16, 0.09, 0.004), [x - 0.006, lampPos.y, lampPos.z]));
    b.add(M.metalBlack, xf(box(0.06, 0.012, 0.012), [x - 0.04, lampPos.y + 0.04, lampPos.z]));
    const cx = x - 0.1;
    b.add(M.metalBlack, xf(cyl(0.01, 0.06, 0.04, 4), [cx, lampPos.y + 0.12, lampPos.z], [0, PI / 4, 0]));
    b.add(M.metalBlack, xf(cyl(0.05, 0.05, 0.012, 4), [cx, lampPos.y - 0.09, lampPos.z], [0, PI / 4, 0]));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * 2 * PI + PI / 4;
      b.add(M.metalBlack, xf(box(0.008, 0.2, 0.008), [cx + Math.cos(a) * 0.045, lampPos.y + 0.005, lampPos.z + Math.sin(a) * 0.045]));
    }
    b.add(M.lampShade, xf(cyl(0.035, 0.035, 0.18, 4), [cx, lampPos.y + 0.005, lampPos.z], [0, PI / 4, 0]));
    b.add(M.lampBulb, xf(new THREE.SphereGeometry(0.018, 12, 8), [cx, lampPos.y, lampPos.z]));
    root.add(b.build('wallLantern'));
    const pl = new THREE.PointLight(L.LIGHT_COLORS.k2700, 2.2, 3.2, 2);
    pl.name = `${ROOM}:light:lantern`;
    pl.position.set(cx - 0.08, lampPos.y, lampPos.z);
    pl.castShadow = false;
    root.add(pl);
  }

  // ═════════════════ 上牆串燈（垂成弧形） ═════════════════
  {
    const b = new Bucket();
    const y = H - 0.22, zc = Z0 + 0.03;
    const hooks = [X0 + 0.35, X0 + 0.75, sink.x + 0.05, washer.x - 0.1, X1 - 0.12];
    const pts = [];
    for (let i = 0; i < hooks.length - 1; i++) {
      const a = hooks[i], c = hooks[i + 1];
      for (let k = 0; k < 8; k++) {
        const t = k / 8;
        pts.push(V3(a + (c - a) * t, y - 0.09 * Math.sin(PI * t), zc + 0.015 * Math.sin(PI * t)));
      }
      b.add(M.metalBlack, xf(cyl(0.004, 0.004, 0.02, 6), [a, y + 0.008, Z0 + 0.012], [PI / 2, 0, 0]));
    }
    pts.push(V3(hooks[hooks.length - 1], y, zc));
    const curve = new THREE.CatmullRomCurve3(pts);
    b.add(M.metalBlack, new THREE.TubeGeometry(curve, 80, 0.0018, 4));
    const N = 22;
    for (let k = 1; k < N; k++) {
      const p = curve.getPoint(k / N);
      b.add(M.lampBulb, xf(new THREE.SphereGeometry(0.014, 10, 8), [p.x, p.y - 0.022, p.z], [0, 0, 0], [1, 1.25, 1]));
      b.add(M.metalBrass, xf(cyl(0.006, 0.006, 0.012, 8), [p.x, p.y - 0.006, p.z]));
    }
    root.add(b.build('stringLights', { cast: false }));
    const pl = new THREE.PointLight(L.LIGHT_COLORS.k2700, 1.2, 2.6, 2);
    pl.name = `${ROOM}:light:stringLights`;
    pl.position.set((X0 + X1) / 2, y - 0.15, Z0 + 0.25);
    pl.castShadow = false;
    root.add(pl);
  }

  // ═════════════════ 門邊拖鞋（門掃掠區外側） ═════════════════
  {
    const b = new Bucket();
    const base = { x: swing.x0 - 0.16, z: Z1 - 0.18 };
    for (const [dx, dz, ry] of [[-0.055, 0, 0.12], [0.055, 0.02, -0.08]]) {
      const g = [];
      g.push([M.rubber, xf(rbox(0.1, 0.022, 0.26, 0.01), [0, 0.011, 0])]);
      g.push([M.fabricOat, xf(rbox(0.09, 0.006, 0.25, 0.003), [0, 0.024, 0])]);
      g.push([M.fabricTaupe, xf(new THREE.TorusGeometry(0.048, 0.016, 8, 20, PI), [0, 0.024, -0.05], [0, 0, 0], [1, 0.75, 1.6])]);
      for (const [mat, geo] of g) b.add(mat, xf(geo, [base.x + dx, 0, base.z + dz], [0, ry, 0]));
    }
    root.add(b.build('slippers'));
  }

  // 防呆：確認女兒牆高度（只用來提醒植物高度設計）
  root.userData.parapet = SILL;
  return root;
}
