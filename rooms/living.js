/**
 * rooms/living.js — 客廳＋北端餐區（依屋主實拍；第三輪質感升級：倒角、鼓起的軟件、垂墜布、車削器物）
 *
 * 所有擺放位置都由 layout.js 推出：
 *   R      = L.roomInterior('living')
 *   win    = L.WINDOWS.livingSouth      南窗（窗台 0.45，百葉簾 shell 已做）→ 窗下整排木作臥榻
 *   東牆 R.x1                            → 灰褐板材系統牆（展示龕、頂部間接燈）、懸浮矮櫃、轉角高櫃、餐桌
 *   西牆 secondLiving 在 R 內那一段       → 一體成形弧形毛圈沙發、圓茶几、鉻色立燈、掛畫
 *   北端 R.z0                            → 餐區；西側留 ≥ 0.9m 走道
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import * as G from '../geo.js';

const ROOM = 'living';
const H = L.CEILING_HEIGHT;

// —— 尺寸常數（不是座標） ——
const WALLSYS = { depth: 0.3, top: H - 0.1, colW: 0.63, split: 1.95, gap: 0.008 };
const BENCH = { depth: 0.4, h: 0.42, float: 0.08 };
const NICHE = { cols: 2, y0: 0.75, y1: 1.95, recess: 0.22 };
const TALL = { width: 0.45 };
const SOFA = { depth: 0.8, bevel: 0.06, curve: 0.22, baseH: 0.3, seatH: 0.45, backH: 0.74, backW: 0.2 };
const DINING = { len: 1.2, wid: 0.78, h: 0.75 };
const WALKWAY = 0.9;

// ═══════════════════════════════════════════════════════
// 小工具
// ═══════════════════════════════════════════════════════
const mesh = (geo, mat, name, opts) => G.mesh(geo, mat, `${ROOM}:${name}`, opts);
function group(name) {
  const g = new THREE.Group();
  g.name = `${ROOM}:${name}`;
  return g;
}
const rb = (w, h, d, r = 0.003) => G.roundedBox(w, h, d, r);
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0, order = 'XYZ') {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz, order);
  o.updateMatrix();
  return geo.applyMatrix4(o.matrix);
}
function add(parent, geo, mat, name, x, y, z, opts) {
  const m = mesh(geo, mat, name, opts);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
/** 世界座標範圍的倒角方塊 */
function slab(parent, mat, name, x0, x1, y0, y1, z0, z1, opts, r = 0.003) {
  return add(parent, rb(x1 - x0, y1 - y0, z1 - z0, r), mat, name, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smoothstep = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * 平面輪廓（[x, z] 世界座標）往上擠出成圓角實體（腰果沙發、L 形臥榻用）。
 * 輪廓是核心，倒角 r 往外長 r。smooth=true 把法線抹平（布面）。
 */
function extrudePlan(pts, y0, y1, r, smooth = false) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  let g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, y1 - y0 - 2 * r), steps: 1,
    bevelEnabled: r > 0, bevelThickness: r, bevelSize: r, bevelSegments: smooth ? 5 : 3,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + r, 0);
  if (smooth) {
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
  }
  g.computeVertexNormals();
  return G.worldUV(g);
}

/** 圓角矩形平面輪廓（世界座標）；rad = { nw, ne, se, sw }（n = 小 z、w = 小 x） */
function roundedRectPlan(x0, x1, z0, z1, rad = {}, seg = 8) {
  const pts = [];
  const corner = (cx, cz, r, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  const { nw = 0, ne = 0, se = 0, sw = 0 } = rad;
  nw ? corner(x0 + nw, z0 + nw, nw, Math.PI) : pts.push([x0, z0]);
  ne ? corner(x1 - ne, z0 + ne, ne, -Math.PI / 2) : pts.push([x1, z0]);
  se ? corner(x1 - se, z1 - se, se, 0) : pts.push([x1, z1]);
  sw ? corner(x0 + sw, z1 - sw, sw, Math.PI / 2) : pts.push([x0, z1]);
  return pts;
}

/** 小盆栽葉叢（合併成一個 mesh） */
function leafTuft(rng, x, y, z, n, size, mat, name, parent) {
  const lv = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + rng.jitter(0, 0.3);
    const l = new THREE.SphereGeometry(size, 10, 6).scale(1, 0.32, 1.7);
    lv.push(placed(l, x + Math.sin(a) * size * 1.4, y + (i % 4) * size * 0.8, z + Math.cos(a) * size * 1.4, 0.55 + rng.jitter(0, 0.2), a, 0, 'YXZ'));
  }
  add(parent, G.worldUV(mergeGeometries(lv)), mat, name, 0, 0, 0);
}

// ═══════════════════════════════════════════════════════
// 東牆：灰褐板材系統牆＋展示龕＋頂部間接燈
// ═══════════════════════════════════════════════════════
function buildWallSystem(rng, R, z0, z1, niche, benchZ0) {
  const g = group('wallSystem');
  const W = WALLSYS;
  const xf = R.x1 - W.depth;                     // 板材正面
  const n = Math.max(1, Math.round((z1 - z0) / W.colW));
  const cw = (z1 - z0) / n;
  const gp = W.gap;
  const floatY = 0.06;

  // 背框（縫後方退 3cm，AO 會把縫壓暗）
  slab(g, M.panelGreige, 'wall:carcass', R.x1 - 0.03, R.x1, 0, W.top, z0, z1, { cast: false });
  for (let i = 0; i < n; i++) {
    const a = z0 + i * cw + gp / 2, b = z0 + (i + 1) * cw - gp / 2;
    const inNiche = i >= niche.i0 && i < niche.i0 + NICHE.cols;
    const ranges = inNiche
      ? [[floatY, NICHE.y0 - gp / 2], [NICHE.y1 + gp / 2, W.split - gp / 2], [W.split + gp / 2, W.top]]
      : [[floatY, W.split - gp / 2], [W.split + gp / 2, W.top]];
    for (const [y0, y1] of ranges) slab(g, M.panelGreige, 'wall:panel', xf, R.x1 - 0.03, y0, y1, a, b, undefined, 0.004);
    if (b < benchZ0) slab(g, M.ledStrip, 'wall:baseLed', xf + 0.03, xf + 0.05, floatY - 0.012, floatY - 0.002, a, b, { cast: false }, 0.001);
  }
  // 展示龕
  const nz0 = z0 + niche.i0 * cw + gp / 2, nz1 = z0 + (niche.i0 + NICHE.cols) * cw - gp / 2;
  const nb = xf + NICHE.recess;
  slab(g, M.panelGreige, 'niche:back', nb, R.x1 - 0.03, NICHE.y0, NICHE.y1, nz0, nz1);
  slab(g, M.panelGreige, 'niche:floor', xf, nb, NICHE.y0 - 0.03, NICHE.y0, nz0, nz1, undefined, 0.004);
  slab(g, M.panelGreige, 'niche:ceil', xf, nb, NICHE.y1, NICHE.y1 + 0.03, nz0, nz1, undefined, 0.004);
  for (const z of [nz0, nz1 - 0.02]) slab(g, M.panelGreige, 'niche:side', xf, nb, NICHE.y0, NICHE.y1, z, z + 0.02);
  slab(g, M.ledStrip, 'niche:led', xf + 0.01, xf + 0.025, NICHE.y0, NICHE.y0 + 0.006, nz0 + 0.03, nz1 - 0.03, { cast: false }, 0.001);
  slab(g, M.ledStrip, 'niche:ledTop', nb - 0.04, nb - 0.025, NICHE.y1 - 0.006, NICHE.y1, nz0 + 0.03, nz1 - 0.03, { cast: false }, 0.001);

  // 龕內：靠牆抽象畫
  const fy = NICHE.y0;
  const art = new THREE.Group();
  art.name = `${ROOM}:niche:art`;
  const ah = 0.62, aw = 0.44;
  const frame = mesh(rb(0.025, ah, aw, 0.003), M.paintWhite, 'niche:artFrame');
  frame.position.set(0, ah / 2, 0);
  const paper = mesh(rb(0.004, ah - 0.06, aw - 0.06, 0.001), M.paperWhite, 'niche:artPaper', { cast: false });
  paper.position.set(-0.012, ah / 2, 0);
  const ring = mesh(new THREE.TorusGeometry(0.11, 0.022, 12, 48), M.paintCharcoal, 'niche:artShape', { cast: false });
  ring.scale.set(1, 1.35, 0.12);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-0.016, ah * 0.55, 0.02);
  const blob = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.003, 32), M.ceramicRust, 'niche:artShape', { cast: false });
  blob.rotation.z = Math.PI / 2;
  blob.scale.set(1, 1, 1.4);
  blob.position.set(-0.015, ah * 0.4, -0.08);
  art.add(frame, paper, ring, blob);
  art.position.set(nb - 0.03, fy, (nz0 + nz1) / 2 + 0.18);
  art.rotation.z = 0.1;
  g.add(art);
  // 鏽橘造型花瓶（兩段鼓起、瓶口微翻）
  const vz = (nz0 + nz1) / 2 - 0.3;
  add(g, G.lathe([[0, 0], [0.052, 0], [0.062, 0.012], [0.058, 0.04], [0.052, 0.06], [0.07, 0.085], [0.088, 0.115], [0.09, 0.14], [0.078, 0.17],
    [0.055, 0.195], [0.05, 0.21], [0.062, 0.23], [0.08, 0.26], [0.078, 0.29], [0.06, 0.315], [0.04, 0.33], [0.034, 0.345], [0.038, 0.352],
    [0.032, 0.354], [0.026, 0.34], [0.02, 0.3]], 56), M.ceramicRust, 'niche:vase', xf + 0.11, fy, vz);
  for (const [k, hgt] of [[0, 0.07], [1, 0.11]]) {
    add(g, G.lathe([[0, 0], [0.024, 0], [0.026, 0.004], [0.026, hgt - 0.004], [0.022, hgt], [0, hgt]], 32), M.ceramicMatte, 'niche:candle', xf + 0.08, fy, nz1 - 0.12 - k * 0.07);
  }
  add(g, new THREE.SphereGeometry(0.035, 24, 16), M.ceramicMatte, 'niche:ball', xf + 0.13, fy + 0.035, (nz0 + nz1) / 2 + 0.42);

  slab(g, M.ledStrip, 'wall:coveLed', xf + 0.02, xf + 0.04, W.top + 0.005, W.top + 0.015, z0 + 0.02, z1 - 0.02, { cast: false }, 0.001);
  return { g, xf };
}

// ═══════════════════════════════════════════════════════
// 懸浮淺橡木矮櫃（東牆）＋窗下臥榻（L 形）＋轉角高櫃
// ═══════════════════════════════════════════════════════
/** 抽屜門板：沿某軸排一列倒角門板，縫 4mm，上緣有把手溝 */
function drawerFronts(parent, axis, a, b, face, y0, y1, n, name) {
  const w = (b - a) / n, gap = 0.004, t = 0.018;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const c = a + (i + 0.5) * w;
    const geo = axis === 'z' ? rb(t, y1 - y0 - 0.03, w - gap, 0.003) : rb(w - gap, y1 - y0 - 0.03, t, 0.003);
    parts.push(placed(geo, axis === 'z' ? face - t / 2 : c, (y0 + y1) / 2 - 0.015, axis === 'z' ? c : face - t / 2));
  }
  add(parent, mergeGeometries(parts), M.woodOak, name, 0, 0, 0);
}

function buildBenches(rng, R, win, benchZ0) {
  const g = group('bench');
  const B = BENCH;
  const yb = B.float, yt = B.h;
  const xE = R.x1 - B.depth;
  const zS = R.z1 - B.depth;
  const e = 0.007, inset = 0.018;
  // 東側矮櫃：櫃體退縮一片門板厚，北端圓角頂板
  add(g, extrudePlan(roundedRectPlan(xE + e, R.x1 - e, benchZ0 + e, R.z1 - e, { nw: 0.16 }), yt - 0.035, yt, 0.006), M.woodOak, 'bench:eastTop', 0, 0, 0);
  add(g, extrudePlan(roundedRectPlan(xE + inset + e, R.x1 - e, benchZ0 + e, R.z1 - e, { nw: 0.16 }), yb, yt - 0.035, 0.003), M.woodOak, 'bench:eastBody', 0, 0, 0);
  slab(g, M.woodOakDark, 'bench:plinth', xE + 0.08, R.x1, 0, yb, benchZ0 + 0.2, R.z1 - 0.05, { cast: false });
  drawerFronts(g, 'z', benchZ0 + 0.17, R.z1 - B.depth, xE + inset, yb, yt - 0.035 + 0.03, Math.max(2, Math.round((R.z1 - B.depth - benchZ0) / 0.62)), 'bench:eastDrawers');
  // 窗下臥榻
  add(g, extrudePlan(roundedRectPlan(R.x0 + e, xE + e, zS + e, R.z1 - e), yt - 0.035, yt, 0.006), M.woodOak, 'bench:windowTop', 0, 0, 0);
  add(g, extrudePlan(roundedRectPlan(R.x0 + e, xE + e, zS + inset + e, R.z1 - e), yb, yt - 0.035, 0.003), M.woodOak, 'bench:windowBody', 0, 0, 0);
  slab(g, M.woodOakDark, 'bench:plinthS', R.x0 + 0.05, xE + 0.08, 0, yb, zS + 0.08, R.z1, { cast: false });
  drawerFronts(g, 'x', R.x0 + 0.01, xE, zS + inset, yb, yt - 0.035 + 0.03, Math.max(2, Math.round((xE - R.x0) / 0.62)), 'bench:windowDrawers');

  // 臥榻坐墊（mattress）＋靠窗抱枕（cushion）
  const cx0 = Math.max(R.x0 + 0.02, win.from - 0.15), cx1 = xE - 0.02;
  const cd = B.depth - 0.04;
  add(g, G.mattress(cx1 - cx0, 0.055, cd, { radius: 0.022, crown: 0.008, wrinkle: 0.002, rng: rng.fork('benchCushion') }), M.fabricWhite, 'bench:cushion',
    (cx0 + cx1) / 2, yt + 0.0275, R.z1 - cd / 2 - 0.02);
  const zBack = R.z1 - 0.22;                      // 離窗 ≥ 0.15，不貼到百葉
  const pil = [[0.22, M.fabricWhite, 0.45], [0.58, M.fabricBoucle, 0.42], [0.8, M.fabricLinen, 0.38]];
  pil.forEach(([f, mat, s], i) => {
    const x = cx0 + (cx1 - cx0) * f;
    const p = add(g, G.cushion(s, 0.19, s * 0.8, { seam: 0.12, wrinkle: 0.006, rng: rng.fork(`bp${i}`) }), mat, 'bench:pillow', x, yt + 0.055 + s * 0.36, zBack);
    // 立起來、往窗後仰
    p.rotation.set(-Math.PI / 2 + 0.28, rng.jitter(0, 0.12), rng.jitter(0, 0.06), 'YXZ');
  });
  // 臥榻上：小盆栽、杯盤、雜誌
  const px = xE - 0.25;
  add(g, G.lathe([[0, 0], [0.042, 0], [0.05, 0.01], [0.056, 0.075], [0.058, 0.08], [0.052, 0.08], [0.048, 0.07], [0, 0.07]], 40), M.ceramicMatte, 'bench:pot', px, yt + 0.055, zS + 0.16);
  leafTuft(rng.fork('benchPlant'), px, yt + 0.14, zS + 0.16, 12, 0.028, M.leafGreen, 'bench:leaves', g);
  add(g, G.lathe([[0, 0], [0.05, 0], [0.068, 0.008], [0.072, 0.012], [0.066, 0.012], [0, 0.006]], 40), M.ceramicMatte, 'bench:saucer', px - 0.22, yt + 0.055, zS + 0.14);
  add(g, G.lathe([[0, 0], [0.028, 0], [0.034, 0.01], [0.038, 0.07], [0.035, 0.072], [0.031, 0.012], [0, 0.01]], 40), M.ceramicWhite, 'bench:cup', px - 0.22, yt + 0.065, zS + 0.14);
  const mag = add(g, rb(0.22, 0.012, 0.28, 0.002), M.bookColors[4], 'bench:magazine', px - 0.55, yt + 0.06, zS + 0.18);
  mag.rotation.y = 0.25;

  // 東側矮櫃上：書、三腳小碗
  for (let i = 0; i < 2; i++) {
    const b = add(g, rb(0.2, 0.024, 0.28, 0.002), [M.paperWhite, M.bookColors[6]][i], 'bench:book', xE + 0.2, yt + 0.012 + i * 0.024, benchZ0 + 0.55);
    b.rotation.y = 0.08 - i * 0.12;
  }
  const by = yt + 0.018;
  add(g, G.lathe([[0, 0.012], [0.03, 0.008], [0.06, 0.025], [0.082, 0.055], [0.086, 0.062], [0.08, 0.062], [0.075, 0.056], [0.055, 0.032], [0.028, 0.02], [0, 0.02]], 48),
    M.ceramicMatte, 'bench:bowl', xE + 0.2, by - 0.008, benchZ0 + 0.3);
  for (const a of [0, 2.1, 4.2]) add(g, G.lathe([[0, 0], [0.01, 0], [0.008, 0.016], [0, 0.016]], 16), M.ceramicMatte, 'bench:bowlFoot', xE + 0.2 + Math.cos(a) * 0.035, yt, benchZ0 + 0.3 + Math.sin(a) * 0.035);
  return g;
}

function buildTallCabinet(rng, R, win) {
  const g = group('tallCabinet');
  const x0 = Math.max(R.x1 - BENCH.depth, win.to + 0.005);
  const z0 = R.z1 - TALL.width;
  const y0 = BENCH.h;
  slab(g, M.woodOak, 'tall:side', x0, R.x1, y0, H - 0.005, z0, z0 + 0.02);
  slab(g, M.woodOak, 'tall:back', R.x1 - 0.02, R.x1, y0, H - 0.005, z0, R.z1);
  slab(g, M.woodOak, 'tall:shelf', x0, R.x1, 0.82, 0.84, z0, R.z1);
  const mid = (0.84 + H) / 2;
  slab(g, M.woodOak, 'tall:door', x0, x0 + 0.019, 0.845, mid - 0.002, z0 + 0.022, R.z1 - 0.002, undefined, 0.003);
  slab(g, M.woodOak, 'tall:door', x0, x0 + 0.019, mid + 0.002, H - 0.007, z0 + 0.022, R.z1 - 0.002, undefined, 0.003);
  slab(g, M.woodOak, 'tall:fill', x0 + 0.02, R.x1 - 0.02, 0.845, H - 0.005, z0 + 0.02, R.z1, { cast: false });
  const px = (x0 + R.x1) / 2, pz = (z0 + R.z1) / 2;
  add(g, G.lathe([[0, 0], [0.045, 0], [0.055, 0.012], [0.06, 0.095], [0.062, 0.1], [0.056, 0.1], [0, 0.09]], 40), M.ceramicMatte, 'tall:pot', px, y0 + 0.05, pz);
  leafTuft(rng, px, y0 + 0.18, pz, 14, 0.03, M.leafOlive, 'tall:leaves', g);
  return g;
}

// ═══════════════════════════════════════════════════════
// 西牆：一體成形弧形毛圈沙發
//   底座＋座墊＋連續弧形靠背（北端繞成扶手），全部沿同一條腰果形背線產生。
// ═══════════════════════════════════════════════════════
function buildSofa(rng, xWall, zc, halfLen) {
  const g = group('sofa');
  const S = SOFA;
  const r = S.bevel;
  const X0 = xWall + 0.02 + r;
  const N = 36;
  const backX = (t) => X0 + S.curve * t * t;      // 背線：中段貼牆，兩端離牆
  const zAt = (t) => zc + t * halfLen;
  const capR = S.depth / 2;
  const capN = 1.0, capS = 0.85;                  // 端頭橢圓比例（北端較飽滿）
  const ts = (i, n) => -1 + (2 * i) / n;

  /** 腰果形輪廓：從背線往前 depth 的區域；backOff 讓座墊從靠背內側開始 */
  function kidney(backOff, frontOff, capScaleN, capScaleS) {
    const out = [];
    const rr = (S.depth - backOff - frontOff) / 2;
    for (let i = 0; i <= N; i++) { const t = ts(i, N); out.push([backX(t) + backOff, zAt(t)]); }
    for (let i = 1; i < 14; i++) { const a = Math.PI - (i / 14) * Math.PI; out.push([backX(1) + backOff + rr + Math.cos(a) * rr, zAt(1) + Math.sin(a) * rr * capScaleS]); }
    for (let i = N; i >= 0; i--) { const t = ts(i, N); out.push([backX(t) + S.depth - frontOff, zAt(t)]); }
    for (let i = 1; i < 14; i++) { const a = -(i / 14) * Math.PI; out.push([backX(-1) + backOff + rr + Math.cos(a) * rr, zAt(-1) + Math.sin(a) * rr * capScaleN]); }
    return out;
  }

  // 底座（整圈，含倒角）
  add(g, extrudePlan(kidney(0, 0, capN, capS), 0.012, S.baseH, r, true), M.fabricBoucle, 'sofa:base', 0, 0, 0);

  // 座墊：從靠背內側開始，前緣略退，頂面中間鼓起
  const w = S.backW;
  const seatGeo = extrudePlan(kidney(w * 0.55, 0.035, capN * 0.9, capS), S.baseH - 0.02, S.seatH, 0.05, true);
  {
    const p = seatGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < S.seatH - 0.03) continue;
      const t = THREE.MathUtils.clamp((p.getZ(i) - zc) / halfLen, -1, 1);
      const u = THREE.MathUtils.clamp((p.getX(i) - backX(t) - w * 0.55) / (S.depth - w * 0.55), 0, 1);
      const k = Math.sin(Math.PI * u) * (1 - t ** 8) * smoothstep(S.seatH - 0.03, S.seatH, y);
      p.setY(i, y + 0.018 * k);
    }
    seatGeo.computeVertexNormals();
    G.worldUV(seatGeo);
  }
  add(g, seatGeo, M.fabricBoucle, 'sofa:seat', 0, 0, 0);

  // 靠背：沿背線一條連續弧形帶；北端繞過半圓成為扶手，南端收一小段
  const outer = [], inner = [];
  const cxN = backX(-1) + capR, czN = zAt(-1);
  const cxS = backX(1) + capR, czS = zAt(1);
  const capPt = (cx, cz, a, rad, sc) => [cx + Math.cos(a) * rad, cz + Math.sin(a) * rad * sc];
  for (let i = 0; i <= 14; i++) {                 // 北端：從前側（約 -20°）繞到背線（-180°）
    const a = -0.35 - (i / 14) * (Math.PI - 0.35);
    outer.push(capPt(cxN, czN, a, capR, capN));
    inner.push(capPt(cxN, czN, a, capR - w, capN));
  }
  for (let i = 1; i < N; i++) {
    const t = ts(i, N);
    const x = backX(t), z = zAt(t);
    const tx = 2 * S.curve * t, tz = halfLen;
    const len = Math.hypot(tx, tz);
    outer.push([x, z]);
    inner.push([x + (tz / len) * w, z - (tx / len) * w]);
  }
  for (let i = 0; i <= 5; i++) {                  // 南端：背線再往前收 40°
    const a = Math.PI - (i / 5) * 0.7;
    outer.push(capPt(cxS, czS, a, capR, capS));
    inner.push(capPt(cxS, czS, a, capR - w, capS));
  }
  const backGeo = extrudePlan([...outer, ...inner.reverse()], 0.1, S.backH, r, true);
  {
    // 靠背頂緣：中段最高，往兩端（扶手、南端）緩降，讓整體像一條連續的弧
    const p = backGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < S.seatH) continue;
      const z = p.getZ(i);
      const tt = THREE.MathUtils.clamp((z - zc) / halfLen, -1.6, 1.6);
      const drop = 0.06 * smoothstep(0.55, 1.4, Math.abs(tt)) + (tt > 0 ? 0.03 * smoothstep(0.6, 1.1, tt) : 0);
      p.setY(i, y - drop * (y - S.seatH) / (S.backH - S.seatH));
    }
    backGeo.computeVertexNormals();
    G.worldUV(backGeo);
  }
  add(g, backGeo, M.fabricBoucle, 'sofa:back', 0, 0, 0);

  // 抱枕：鼓起、有縫線，斜靠在靠背上（順著弧線轉向）
  const pil = [[-0.6, M.fabricWhite, 0.44, 0.5], [-0.3, M.fabricTaupe, 0.4, 0.46], [0.1, M.fabricWhite, 0.42, 0.44], [0.42, M.fabricBlush, 0.38, 0.52]];
  pil.forEach(([t, mat, s, lean], i) => {
    const slope = Math.atan2(2 * S.curve * t, halfLen);       // 背線切線相對 z 軸的偏角
    const x = backX(t) + w + 0.07;
    const p = add(g, G.cushion(s, 0.17, s, { seam: 0.14, wrinkle: 0.007, rng: rng.fork(`sp${i}`) }), mat, 'sofa:pillow', x + 0.03, S.seatH + s * 0.36, zAt(t));
    // cushion 平放 → 繞 z 轉立起來、法線朝 +x 並往牆後仰 lean；再依弧線轉向
    p.rotation.set(rng.jitter(0, 0.08), -slope + rng.jitter(0, 0.1), -(Math.PI / 2 - lean), 'YXZ');
  });

  // 灰色針織毯：搭在北端扶手上，兩側自然垂下
  const armZ = czN - capR * capN + w / 2;          // 扶手帶中線（北端頂點）
  const throwG = G.drapeOver({ w: 0.34, d: 0.19, overhang: { z0: 0.4, z1: 0.24, x0: 0.02, x1: 0.02 }, thickness: 0.01, wrinkle: 0.03, edgeRadius: 0.085, flare: 0.07, res: 0.02, rng: rng.fork('throw') });
  const th = add(g, throwG, M.fabricGreyThrow, 'sofa:throw', cxN + 0.03, S.backH - 0.06 + 0.02, armZ);
  th.rotation.y = 0.12;
  return { g, frontMid: X0 + S.depth + r, zN: czN - capR * capN - r };
}

// ═══════════════════════════════════════════════════════
// 圓茶几：車削喇叭底座＋倒角橡木圓桌面
// ═══════════════════════════════════════════════════════
function buildCoffeeTable(x, z) {
  const g = group('coffeeTable');
  add(g, G.lathe([[0, 0], [0.2, 0], [0.212, 0.004], [0.215, 0.014], [0.205, 0.028], [0.17, 0.06], [0.125, 0.13], [0.095, 0.22], [0.082, 0.3],
    [0.08, 0.35], [0.09, 0.365], [0.11, 0.372], [0, 0.372]], 64), M.ceramicMatte, 'coffeeTable:base', x, 0, z);
  add(g, G.extrudeRounded(G.ellipseShape(0.6, 0.6, 96), 0.038, 0.006), M.woodOak, 'coffeeTable:top', x, 0.372, z);
  const b1 = add(g, rb(0.24, 0.022, 0.3, 0.003), M.bookColors[6], 'coffeeTable:book', x - 0.02, 0.421, z + 0.03);
  b1.rotation.y = 0.3;
  const b2 = add(g, rb(0.21, 0.016, 0.27, 0.002), M.paperWhite, 'coffeeTable:book', x - 0.03, 0.44, z + 0.04);
  b2.rotation.y = 0.18;
  return g;
}

// ═══════════════════════════════════════════════════════
// 鉻色立燈：車削底座／燈盤＋圓管閱讀臂（一盞點光）
// ═══════════════════════════════════════════════════════
function buildFloorLamp(x, z) {
  const g = group('floorLamp');
  const top = 1.82;
  add(g, G.lathe([[0, 0], [0.145, 0], [0.15, 0.004], [0.148, 0.014], [0.12, 0.022], [0.03, 0.026], [0.016, 0.04], [0, 0.04]], 64), M.metalChrome, 'floorLamp:base', x, 0, z);
  add(g, G.tube([[x, 0.03, z], [x, top / 2, z], [x, top, z]], 0.011, { segments: 8, radial: 16 }), M.metalChrome, 'floorLamp:pole', 0, 0, 0);
  add(g, G.lathe([[0, -0.02], [0.018, -0.02], [0.022, 0], [0.11, 0.035], [0.18, 0.07], [0.205, 0.082], [0.2, 0.087], [0.175, 0.077], [0.105, 0.042], [0.02, 0.012], [0, 0.012]], 72),
    M.metalChrome, 'floorLamp:dish', x, top, z);
  add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.003, 48), M.lampShade, 'floorLamp:diffuser', x, top + 0.06, z, { cast: false });
  // 閱讀臂：旁邊一支細桿，上端彎出去，末端小燈頭
  const ax = x + 0.035;
  add(g, rb(0.045, 0.05, 0.03, 0.006), M.metalChrome, 'floorLamp:joint', x + 0.018, 0.75, z);
  add(g, G.tube([[ax, 0.75, z], [ax, 1.1, z], [ax + 0.02, 1.2, z], [ax + 0.08, 1.24, z], [ax + 0.3, 1.25, z]], 0.007, { segments: 48, radial: 10 }), M.metalChrome, 'floorLamp:arm', 0, 0, 0);
  const head = add(g, G.lathe([[0.006, 0], [0.02, 0.005], [0.038, 0.025], [0.046, 0.06], [0.042, 0.062], [0.034, 0.028], [0.018, 0.009], [0, 0.009]], 40),
    M.metalChrome, 'floorLamp:head', ax + 0.3, 1.25, z);
  head.rotation.z = Math.PI * 0.8;
  add(g, new THREE.CircleGeometry(0.036, 24).rotateX(Math.PI / 2), M.lampShade, 'floorLamp:headGlow', ax + 0.3 + 0.03, 1.21, z, { cast: false });
  const light = new THREE.PointLight(L.LIGHT_COLORS.k2700, 2.2, 4.5, 2);
  light.name = `${ROOM}:floorLamp:light`;
  light.position.set(x, top + 0.15, z);
  g.add(light);
  return g;
}

// ═══════════════════════════════════════════════════════
// 掛畫（西牆，面向 +x）與靠牆畫
// ═══════════════════════════════════════════════════════
function buildWallArt(xWall, zc, y, w, h, variant, name) {
  const g = group(name);
  const fw = 0.03;
  add(g, rb(fw, h, w, 0.004), M.woodOak, `${name}:frame`, xWall + fw / 2, y, zc);
  add(g, rb(0.004, h - 0.04, w - 0.04, 0.001), M.panelGreige, `${name}:mat`, xWall + fw + 0.001, y, zc, { cast: false });
  add(g, rb(0.004, h - 0.12, w - 0.12, 0.001), M.paperWhite, `${name}:paper`, xWall + fw + 0.003, y, zc, { cast: false });
  const ax = xWall + fw + 0.006;
  if (variant === 0) {
    const ring = add(g, new THREE.TorusGeometry(0.1, 0.03, 12, 48), M.ceramicRust, `${name}:shape`, ax, y + h * 0.02, zc, { cast: false });
    ring.rotation.y = Math.PI / 2;
    ring.scale.set(1, 1.5, 0.1);
    add(g, rb(0.003, h * 0.12, w * 0.07, 0.001), M.paintCharcoal, `${name}:shape`, ax + 0.002, y + h * 0.1, zc - w * 0.18, { cast: false });
  } else {
    add(g, rb(0.003, h * 0.3, w * 0.18, 0.001), M.paintCharcoal, `${name}:shape`, ax, y + h * 0.04, zc, { cast: false });
    const c = add(g, new THREE.CylinderGeometry(w * 0.1, w * 0.1, 0.003, 32), M.paperWhite, `${name}:shape`, ax + 0.002, y + h * 0.07, zc, { cast: false });
    c.rotation.z = Math.PI / 2;
  }
  return g;
}

function buildLeaningArt(xWall, zc) {
  const g = group('leaningArt');
  const w = 0.56, h = 0.76, tilt = 0.12, t = 0.03;
  const inner = new THREE.Group();
  inner.name = `${ROOM}:leaningArt:pivot`;
  const parts = [
    [M.ceramicRust, rb(t, h, w, 0.004), 0, h / 2, 0, 'frame'],
    [M.paperWhite, rb(0.004, h - 0.07, w - 0.07, 0.001), t / 2 + 0.002, h / 2, 0, 'paper'],
    [M.fabricTerracotta, rb(0.004, h * 0.55, w * 0.42, 0.001), t / 2 + 0.004, h * 0.55, -w * 0.12, 'shape'],
    [M.paperWhite, rb(0.004, h * 0.3, w * 0.16, 0.001), t / 2 + 0.006, h * 0.5, w * 0.02, 'shape'],
    [M.paintCharcoal, rb(0.004, h * 0.18, 0.012, 0.001), t / 2 + 0.008, h * 0.42, w * 0.05, 'shape'],
  ];
  for (const [mat, geo, x, y, z, n] of parts) {
    const m = mesh(geo, mat, `leaningArt:${n}`, { cast: n === 'frame' });
    m.position.set(x, y, z);
    inner.add(m);
  }
  inner.rotation.z = tilt;
  inner.position.set(xWall + t / 2 + h * Math.sin(tilt) + 0.01, 0, zc);
  g.add(inner);
  return g;
}

// ═══════════════════════════════════════════════════════
// 餐區：白大理石橢圓桌（車削金色底座）＋殼型椅＋PH 吊燈
// ═══════════════════════════════════════════════════════
/** 長軸沿 x 的超橢圓輪廓（中心在原點） */
function ovalShape(len, wid, n = 96, e = 2.6) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** (2 / e) * len / 2, Math.sign(s) * Math.abs(s) ** (2 / e) * wid / 2];
  });
}

function buildDiningTable(cx, cz) {
  const g = group('dining');
  const D = DINING;
  const topT = 0.022;
  add(g, G.extrudeRounded(ovalShape(D.len, D.wid), topT, 0.005), M.marbleWhite, 'dining:top', cx, D.h - topT, cz);
  // 金色底座：圓盤座＋圓柱＋上方承板，一次車削
  add(g, G.lathe([[0, 0], [0.24, 0], [0.247, 0.004], [0.248, 0.014], [0.24, 0.02], [0.08, 0.026], [0.05, 0.04], [0.04, 0.07], [0.038, 0.4],
    [0.04, D.h - 0.08], [0.05, D.h - 0.05], [0.13, D.h - topT - 0.012], [0.135, D.h - topT], [0, D.h - topT]], 72), M.metalGold, 'dining:base', cx, 0, cz);
  add(g, G.lathe([[0, 0], [0.034, 0], [0.042, 0.02], [0.044, 0.05], [0.034, 0.11], [0.02, 0.14], [0.024, 0.15], [0.018, 0.15], [0.014, 0.13]], 48),
    M.ceramicMatte, 'dining:vase', cx + D.len * 0.28, D.h, cz - 0.08);
  return g;
}

/**
 * 殼型椅椅殼：一片有厚度的曲面（坐面微凹 → 往後上彎成椅背，椅背兩側往前包）。
 * 本地座標：人面向 +z。
 */
function chairShellGeo(thick = 0.012) {
  const spine = new THREE.CatmullRomCurve3([V(0, 0.44, 0.235), V(0, 0.462, 0.14), V(0, 0.458, -0.02), V(0, 0.475, -0.15), V(0, 0.56, -0.225), V(0, 0.7, -0.255), V(0, 0.82, -0.255)]);
  const nu = 20, nv = 36;
  const top = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const p = spine.getPoint(v);
    const wb = smoothstep(0.42, 0.72, v);           // 0 坐面 → 1 椅背
    let half = 0.235 - 0.015 * wb;
    half *= 1 - 0.28 * (1 - smoothstep(0, 0.14, v)) ** 2;   // 前緣圓角
    half *= 1 - 0.3 * smoothstep(0.86, 1, v) ** 2;          // 椅背上緣圓角
    for (let i = 0; i <= nu; i++) {
      const u = -1 + (2 * i) / nu;
      const x = u * half * (1 - 0.1 * wb * u * u);
      const y = p.y + 0.018 * u * u * (1 - wb);
      const z = p.z + wb * 0.1 * u * u;
      top.push(x, y, z);
    }
  }
  const idx = [];
  const id = (i, j) => j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const n = tg.attributes.normal;
  const cnt = top.length / 3;
  const pos = top.slice();
  for (let k = 0; k < cnt; k++) pos.push(top[k * 3] - n.getX(k) * thick, top[k * 3 + 1] - n.getY(k) * thick, top[k * 3 + 2] - n.getZ(k) * thick);
  const all = idx.slice();
  for (let k = 0; k < idx.length; k += 3) all.push(idx[k] + cnt, idx[k + 2] + cnt, idx[k + 1] + cnt);
  // 封邊（雙面，免得計較方向）
  const border = [];
  for (let i = 0; i < nu; i++) border.push([id(i, 0), id(i + 1, 0)], [id(i, nv), id(i + 1, nv)]);
  for (let j = 0; j < nv; j++) border.push([id(0, j), id(0, j + 1)], [id(nu, j), id(nu, j + 1)]);
  for (const [a, b] of border) all.push(a, b, b + cnt, a, b + cnt, a + cnt, a, b + cnt, b, a, a + cnt, b + cnt);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(all);
  geo.computeVertexNormals();
  return G.worldUV(geo);
}

function buildChair(name, mat) {
  const g = group(name);
  add(g, chairShellGeo(), mat, `${name}:shell`, 0, 0, 0);
  // 細腳：圓管，略外八，上端接在坐面下的小座
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const top = [sx * 0.16, 0.445, sz > 0 ? 0.15 : -0.12];
    const bot = [sx * 0.2, 0.004, sz > 0 ? 0.2 : -0.19];
    legs.push(G.tube([top, [(top[0] + bot[0]) / 2, 0.22, (top[2] + bot[2]) / 2], bot], 0.0085, { segments: 12, radial: 10 }));
  }
  legs.push(G.tube([[-0.16, 0.445, 0.15], [-0.16, 0.445, -0.12]], 0.008, { segments: 4, radial: 8 }));
  legs.push(G.tube([[0.16, 0.445, 0.15], [0.16, 0.445, -0.12]], 0.008, { segments: 4, radial: 8 }));
  add(g, mergeGeometries(legs), mat, `${name}:legs`, 0, 0, 0);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    add(g, G.lathe([[0, 0], [0.011, 0], [0.011, 0.006], [0, 0.006]], 16), M.rubber, `${name}:glide`, sx * 0.2, 0, sz > 0 ? 0.2 : -0.19, { cast: false });
  }
  return g;
}

function buildPendant(cx, cz, bottomY) {
  const g = group('pendant');
  // 三層白色燈罩（PH 風格）：每層是有厚度的曲面碗，由上而下變小
  const tiers = [[0.21, 0.2, 0.08], [0.145, 0.105, 0.062], [0.09, 0.03, 0.046]];
  for (const [rOut, y, hgt] of tiers) {
    const prof = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([rOut * (0.2 + 0.8 * t), hgt * (1 - t) ** 1.6]); }
    const back = [];
    for (let i = 10; i >= 0; i--) { const t = i / 10; back.push([rOut * (0.2 + 0.8 * t) - 0.003, hgt * (1 - t) ** 1.6 - 0.003]); }
    add(g, G.lathe([...prof, ...back, prof[0]], 72), M.paintWhite, 'pendant:shade', cx, bottomY + y, cz, { cast: false });
  }
  add(g, new THREE.SphereGeometry(0.035, 24, 16), M.lampBulb, 'pendant:bulb', cx, bottomY + 0.1, cz, { cast: false });
  add(g, G.lathe([[0, 0], [0.028, 0], [0.03, 0.01], [0.03, 0.11], [0.012, 0.13], [0, 0.13]], 40), M.paintWhite, 'pendant:socket', cx, bottomY + 0.27, cz);
  add(g, G.tube([[cx, bottomY + 0.4, cz], [cx, (H + bottomY) / 2, cz], [cx, H - 0.02, cz]], 0.0025, { segments: 6, radial: 6 }), M.paintWhite, 'pendant:cord', 0, 0, 0, { cast: false });
  add(g, G.lathe([[0, 0], [0.05, 0], [0.055, 0.005], [0.055, 0.022], [0, 0.022]], 40), M.paintWhite, 'pendant:canopy', cx, H - 0.022, cz);
  const light = new THREE.PointLight(L.LIGHT_COLORS.k2700, 2.0, 4.0, 2);
  light.name = `${ROOM}:pendant:light`;
  light.position.set(cx, bottomY + 0.06, cz);
  g.add(light);
  return g;
}

// ═══════════════════════════════════════════════════════
export function build() {
  const rng = rngFor(ROOM);
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;

  const R = L.roomInterior(ROOM);
  const win = L.WINDOWS.livingSouth;

  // 西牆（次臥｜客廳）在客廳內那一段
  const sw = L.WALLS.secondLiving;
  const wz0 = Math.max(R.z0, Math.min(sw.from[1], sw.to[1]));

  // —— 東牆系統 ——
  const wallZ1 = R.z1 - TALL.width;
  const nCols = Math.max(1, Math.round((wallZ1 - R.z0) / WALLSYS.colW));
  const colW = (wallZ1 - R.z0) / nCols;
  const nicheMid = (wz0 + R.z1 - BENCH.depth) / 2;
  const nicheI0 = Math.min(nCols - NICHE.cols, Math.max(0, Math.round((nicheMid - R.z0) / colW - NICHE.cols / 2)));
  const benchZ0 = R.z0 + (nicheI0 - 1) * colW;
  const ws = buildWallSystem(rng.fork('wall'), R, R.z0, wallZ1, { i0: nicheI0 }, benchZ0);
  root.add(ws.g);
  root.add(buildBenches(rng.fork('bench'), R, win, benchZ0));
  root.add(buildTallCabinet(rng.fork('tall'), R, win));

  // —— 西牆：弧形沙發（南端接到臥榻前）、立燈＋靠牆畫在北端 ——
  const sofaZ1 = R.z1 - BENCH.depth - 0.04;
  const sofaZ0 = wz0 + 0.62;
  const capN = SOFA.depth / 2 * 1.0 + SOFA.bevel, capS = SOFA.depth / 2 * 0.85 + SOFA.bevel;
  const halfLen = (sofaZ1 - sofaZ0 - capN - capS) / 2;
  const sofaZc = sofaZ0 + capN + halfLen;
  const sofa = buildSofa(rng.fork('sofa'), R.x0, sofaZc, halfLen);
  root.add(sofa.g);
  root.add(buildLeaningArt(R.x0, wz0 + 0.33));
  root.add(buildFloorLamp(R.x0 + 0.2, wz0 + 0.45));
  root.add(buildWallArt(R.x0, sofaZc - halfLen * 0.45, 1.62, 0.5, 0.66, 0, 'artLarge'));
  root.add(buildWallArt(R.x0, sofaZc + halfLen * 0.35, 1.55, 0.36, 0.46, 1, 'artSmall'));

  const tableX = (sofa.frontMid + (R.x1 - BENCH.depth)) / 2 - 0.05;
  root.add(buildCoffeeTable(tableX, sofaZc + halfLen * 0.15));

  // —— 北端餐區 ——
  const tcx = ws.xf - DINING.len / 2;
  const tcz = Math.min(benchZ0 - 0.75, R.z0 + 0.45 + 0.35 + DINING.wid / 2);
  if (tcx - DINING.len / 2 - R.x0 < WALKWAY) throw new Error('living: 餐桌西側走道不足');
  root.add(buildDiningTable(tcx, tcz));
  const chairs = [
    [tcx - 0.18, tcz - DINING.wid / 2 - 0.1, 0, M.plasticBlush],
    [tcx - 0.26, tcz + DINING.wid / 2 + 0.1, Math.PI, M.plasticBlush],
    [tcx + 0.26, tcz + DINING.wid / 2 + 0.12, Math.PI, M.ceramicRust],
  ];
  chairs.forEach(([x, z, ry, mat], i) => {
    const c = buildChair(`chair${i}`, mat);
    c.position.set(x, 0, z);
    c.rotation.y = ry + rng.jitter(0, 0.08);
    root.add(c);
  });
  root.add(buildPendant(tcx, tcz, DINING.h + 0.78));

  return root;
}
