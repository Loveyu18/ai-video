/**
 * rooms/living.js — 客廳＋北端餐區（依屋主實拍重做：極簡、灰褐板材牆、淺橡木、毛圈布）
 *
 * 所有擺放位置都由 layout.js 推出：
 *   R      = L.roomInterior('living')
 *   win    = L.WINDOWS.livingSouth      南窗（窗台 0.45，百葉簾 shell 已做）→ 窗下整排木作臥榻
 *   東牆 R.x1                            → 灰褐板材系統牆（展示龕、頂部間接燈）、懸浮矮櫃、轉角高櫃、餐桌
 *   西牆 secondLiving 在 R 內那一段       → 弧形毛圈布沙發、圓茶几、鉻色立燈、掛畫
 *   北端 R.z0                            → 餐區；西側留 ≥ 0.9m 走道
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';

const ROOM = 'living';
const H = L.CEILING_HEIGHT;

// —— 尺寸常數（不是座標） ——
const WALLSYS = { depth: 0.3, top: H - 0.1, colW: 0.63, split: 1.95, gap: 0.008 };
const BENCH = { depth: 0.4, h: 0.42, float: 0.08 };
const NICHE = { cols: 2, y0: 0.75, y1: 1.95, recess: 0.22 };
const TALL = { width: 0.45 };
const SOFA = { depth: 0.78, bevel: 0.065, curve: 0.24, seatH: 0.42, backH: 0.76, backW: 0.2 };
const DINING = { len: 1.2, wid: 0.78, h: 0.75 };
const WALKWAY = 0.9;

// ═══════════════════════════════════════════════════════
// 小工具
// ═══════════════════════════════════════════════════════
function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function group(name) {
  const g = new THREE.Group();
  g.name = `${ROOM}:${name}`;
  return g;
}
const rbox = (w, h, d, r, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
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
/** 沿 x 或 z 的方塊：給世界座標範圍 */
function slab(parent, mat, name, x0, x1, y0, y1, z0, z1, opts) {
  return add(parent, box(x1 - x0, y1 - y0, z1 - z0), mat, name, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, opts);
}

/**
 * 平面輪廓（[x, z] 世界座標）往上擠出成有圓角的實體。
 * 輪廓是「核心」，倒角 r 會往外長 r，所以實際外緣 = 輪廓 + r。smooth=true 時把法線抹平（布面）。
 */
function extrudePlan(pts, y0, y1, r, smooth = false) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  let g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, y1 - y0 - 2 * r), steps: 1,
    bevelEnabled: r > 0, bevelThickness: r, bevelSize: r, bevelSegments: smooth ? 4 : 2,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + r, 0);
  if (smooth) {
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
  }
  g.computeVertexNormals();
  return g;
}

/** 圓角矩形平面輪廓；rad = { nw, ne, sw, se }（n = 小 z、w = 小 x） */
function roundedRectPlan(x0, x1, z0, z1, rad = {}, seg = 8) {
  const pts = [];
  const corner = (cx, cz, r, a0) => {
    if (!r) { pts.push([cx, cz]); return; }
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  // 順序：nw → ne → se → sw（角度以 (cos→x, sin→z)）
  const { nw = 0, ne = 0, se = 0, sw = 0 } = rad;
  nw ? corner(x0 + nw, z0 + nw, nw, Math.PI) : pts.push([x0, z0]);
  ne ? corner(x1 - ne, z0 + ne, ne, -Math.PI / 2) : pts.push([x1, z0]);
  se ? corner(x1 - se, z1 - se, se, 0) : pts.push([x1, z1]);
  sw ? corner(x0 + sw, z1 - sw, sw, Math.PI / 2) : pts.push([x0, z1]);
  return pts;
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
  const floatY = 0.06;                           // 板材下緣懸空（無矮櫃處有 LED）

  // 背框（填滿縫隙後方，免得看穿）
  slab(g, M.panelGreige, 'wall:carcass', R.x1 - 0.02, R.x1, 0, W.top, z0, z1, { cast: false });
  for (let i = 0; i < n; i++) {
    const a = z0 + i * cw + gp / 2, b = z0 + (i + 1) * cw - gp / 2;
    const inNiche = i >= niche.i0 && i < niche.i0 + NICHE.cols;
    // 下段、上段兩塊門板（龕所在的欄位只做龕下、龕上）
    const ranges = inNiche
      ? [[floatY, NICHE.y0 - gp / 2], [NICHE.y1 + gp / 2, W.split - gp / 2], [W.split + gp / 2, W.top]]
      : [[floatY, W.split - gp / 2], [W.split + gp / 2, W.top]];
    for (const [y0, y1] of ranges) slab(g, M.panelGreige, 'wall:panel', xf, R.x1 - 0.02, y0, y1, a, b);
    // 板材下緣 LED（沒有矮櫃擋住的那段）
    if (b < benchZ0) slab(g, M.ledStrip, 'wall:baseLed', xf + 0.03, xf + 0.05, floatY - 0.012, floatY - 0.002, a, b, { cast: false });
  }
  // 展示龕：凹進去的盒子
  const nz0 = z0 + niche.i0 * cw + gp / 2, nz1 = z0 + (niche.i0 + NICHE.cols) * cw - gp / 2;
  const nb = xf + NICHE.recess;                  // 龕背
  slab(g, M.panelGreige, 'niche:back', nb, R.x1 - 0.02, NICHE.y0, NICHE.y1, nz0, nz1);
  slab(g, M.panelGreige, 'niche:floor', xf, nb, NICHE.y0 - 0.03, NICHE.y0, nz0, nz1);
  slab(g, M.panelGreige, 'niche:ceil', xf, nb, NICHE.y1, NICHE.y1 + 0.03, nz0, nz1);
  for (const z of [nz0, nz1 - 0.02]) slab(g, M.panelGreige, 'niche:side', xf, nb, NICHE.y0, NICHE.y1, z, z + 0.02);
  // 龕底 LED（藏在龕口下緣，往上打）＋龕頂洗牆
  slab(g, M.ledStrip, 'niche:led', xf + 0.01, xf + 0.025, NICHE.y0, NICHE.y0 + 0.006, nz0 + 0.03, nz1 - 0.03, { cast: false });
  slab(g, M.ledStrip, 'niche:ledTop', nb - 0.04, nb - 0.025, NICHE.y1 - 0.006, NICHE.y1, nz0 + 0.03, nz1 - 0.03, { cast: false });

  // 龕內：靠牆的抽象畫、鏽橘造型花瓶、小擺飾
  const fy = NICHE.y0;
  const art = new THREE.Group();
  art.name = `${ROOM}:niche:art`;
  const ah = 0.62, aw = 0.44, tilt = 0.1;
  const frame = mesh(box(0.025, ah, aw), M.paintWhite, 'niche:artFrame');
  frame.position.set(0, ah / 2, 0);
  const paper = mesh(box(0.004, ah - 0.06, aw - 0.06), M.paperWhite, 'niche:artPaper', { cast: false });
  paper.position.set(-0.014, ah / 2, 0);
  const ring = mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 36), M.paintCharcoal, 'niche:artShape', { cast: false });
  ring.scale.set(1, 1.35, 0.15);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-0.018, ah * 0.55, 0.02);
  const blob = mesh(cyl(0.07, 0.07, 0.004, 28), M.ceramicRust, 'niche:artShape', { cast: false });
  blob.rotation.z = Math.PI / 2;
  blob.scale.set(1, 1, 1.4);
  blob.position.set(-0.017, ah * 0.4, -0.08);
  art.add(frame, paper, ring, blob);
  art.position.set(nb - 0.03, fy, (nz0 + nz1) / 2 + 0.18);
  art.rotation.z = tilt;                         // 往龕背靠
  g.add(art);
  // 造型花瓶（兩段鼓起）
  const vz = (nz0 + nz1) / 2 - 0.3;
  add(g, lathe([[0, 0], [0.055, 0], [0.065, 0.02], [0.05, 0.06], [0.085, 0.1], [0.09, 0.14], [0.06, 0.19], [0.05, 0.21],
    [0.08, 0.25], [0.075, 0.3], [0.045, 0.33], [0.035, 0.34], [0.03, 0.34]], 32), M.ceramicRust, 'niche:vase', xf + 0.11, fy, vz);
  for (const dz of [0, 0.07]) add(g, cyl(0.025, 0.025, 0.06 + dz * 0.6, 20), M.ceramicMatte, 'niche:candle', xf + 0.08, fy + 0.03 + dz * 0.3, nz1 - 0.12 - dz);
  add(g, new THREE.SphereGeometry(0.035, 16, 12), M.ceramicMatte, 'niche:ball', xf + 0.13, fy + 0.035, (nz0 + nz1) / 2 + 0.42);

  // 頂部間接燈
  slab(g, M.ledStrip, 'wall:coveLed', xf + 0.02, xf + 0.04, W.top + 0.005, W.top + 0.015, z0 + 0.02, z1 - 0.02, { cast: false });
  return { g, xf, nz0, nz1 };
}

// ═══════════════════════════════════════════════════════
// 懸浮淺橡木矮櫃（東牆）＋窗下臥榻（L 形連續）＋轉角高櫃
// ═══════════════════════════════════════════════════════
function drawerGrooves(parent, axis, a, b, face, y0, y1, n, name) {
  // axis：門板沿哪個軸排；face：正面座標；在正面刻出分割縫＋上緣把手溝
  const parts = [];
  const w = (b - a) / n;
  for (let i = 1; i < n; i++) {
    const c = a + i * w;
    parts.push(axis === 'z' ? placed(box(0.004, y1 - y0 - 0.02, 0.005), face, (y0 + y1) / 2, c) : placed(box(0.005, y1 - y0 - 0.02, 0.004), c, (y0 + y1) / 2, face));
  }
  parts.push(axis === 'z' ? placed(box(0.004, 0.012, b - a - 0.04), face, y1 - 0.03, (a + b) / 2) : placed(box(b - a - 0.04, 0.012, 0.004), (a + b) / 2, y1 - 0.03, face));
  add(parent, mergeGeometries(parts), M.woodOakDark, name, 0, 0, 0, { cast: false });
}

function buildBenches(rng, R, win, benchZ0) {
  const g = group('bench');
  const B = BENCH;
  const yb = B.float, yt = B.h;
  const xE = R.x1 - B.depth;                     // 東側矮櫃正面
  const zS = R.z1 - B.depth;                     // 窗下臥榻正面
  // 東側矮櫃：北端圓角（照片），一路到南牆
  const e = 0.007;
  const east = roundedRectPlan(xE + e, R.x1 - e, benchZ0 + e, R.z1 - e, { nw: 0.16 });
  add(g, extrudePlan(east, yb, yt, 0.006), M.woodOak, 'bench:east', 0, 0, 0);
  // 內縮踢腳（懸浮感）
  slab(g, M.woodOakDark, 'bench:plinth', xE + 0.08, R.x1, 0, yb, benchZ0 + 0.2, R.z1 - 0.05, { cast: false });
  drawerGrooves(g, 'z', benchZ0 + 0.16, R.z1 - B.depth, xE - 0.001, yb, yt, Math.max(2, Math.round((R.z1 - B.depth - benchZ0) / 0.62)), 'bench:eastGrooves');
  // 窗下臥榻：西端到東側矮櫃
  const westPlan = roundedRectPlan(R.x0 + e, xE + e, zS + e, R.z1 - e, {});
  add(g, extrudePlan(westPlan, yb, yt, 0.006), M.woodOak, 'bench:window', 0, 0, 0);
  slab(g, M.woodOakDark, 'bench:plinthS', R.x0 + 0.05, xE + 0.08, 0, yb, zS + 0.08, R.z1, { cast: false });
  drawerGrooves(g, 'x', R.x0, xE, zS - 0.001, yb, yt, Math.max(2, Math.round((xE - R.x0) / 0.62)), 'bench:windowGrooves');

  // 臥榻坐墊（只在窗下那段）＋靠窗抱枕
  const cx0 = Math.max(R.x0 + 0.02, win.from - 0.15), cx1 = xE - 0.02;
  add(g, rbox(cx1 - cx0, 0.05, B.depth - 0.03, 0.02, 2), M.fabricWhite, 'bench:cushion', (cx0 + cx1) / 2, yt + 0.025, R.z1 - (B.depth - 0.03) / 2 - 0.015);
  const zBack = R.z1 - 0.2;             // 抱枕不貼到百葉（離窗 ≥ 0.15）
  const pil = [[0.25, M.fabricWhite, 0.45], [0.62, M.fabricBoucle, 0.42], [0.82, M.fabricWhite, 0.38]];
  for (const [f, mat, s] of pil) {
    const x = cx0 + (cx1 - cx0) * f;
    const p = add(g, rbox(s, s * 0.8, 0.14, 0.06, 3), mat, 'bench:pillow', x, yt + 0.05 + s * 0.38, zBack - 0.02);
    p.rotation.set(-0.2, rng.jitter(0, 0.12), rng.jitter(0, 0.06));
  }
  // 臥榻上：小盆栽＋杯盤、雜誌
  const px = xE - 0.25;
  add(g, lathe([[0, 0], [0.045, 0], [0.055, 0.08], [0.05, 0.08], [0, 0.075]], 20), M.ceramicMatte, 'bench:pot', px, yt + 0.05, zS + 0.16);
  const lv = [];
  for (let i = 0; i < 10; i++) {
    const l = new THREE.SphereGeometry(0.028, 8, 6).scale(1, 0.35, 1.6);
    const a = i * 2.4;
    lv.push(placed(l, px + Math.sin(a) * 0.04, yt + 0.14 + (i % 3) * 0.025, zS + 0.16 + Math.cos(a) * 0.04, 0.5, a, 0, 'YXZ'));
  }
  add(g, mergeGeometries(lv), M.leafGreen, 'bench:leaves', 0, 0, 0);
  add(g, cyl(0.07, 0.065, 0.01, 24), M.ceramicMatte, 'bench:saucer', px - 0.22, yt + 0.055, zS + 0.14);
  add(g, lathe([[0, 0], [0.032, 0], [0.038, 0.07], [0.034, 0.07], [0.028, 0.006], [0, 0.006]], 18), M.ceramicWhite, 'bench:cup', px - 0.22, yt + 0.06, zS + 0.14);
  const mag = add(g, box(0.22, 0.02, 0.28), M.bookColors[4], 'bench:magazine', px - 0.55, yt + 0.06, zS + 0.18);
  mag.rotation.y = 0.25;

  // 東側矮櫃上：書、小碗（照片）
  for (let i = 0; i < 2; i++) {
    const b = add(g, box(0.2, 0.025, 0.28), [M.paperWhite, M.bookColors[6]][i], 'bench:book', xE + 0.2, yt + 0.0125 + i * 0.025, benchZ0 + 0.55);
    b.rotation.y = 0.08 - i * 0.12;
  }
  add(g, lathe([[0, 0.015], [0.03, 0.012], [0.07, 0.04], [0.085, 0.07], [0.08, 0.07], [0.065, 0.045], [0, 0.03]], 24), M.ceramicMatte, 'bench:bowl', xE + 0.2, yt, benchZ0 + 0.3);
  for (const a of [0, 2.1, 4.2]) add(g, cyl(0.008, 0.006, 0.02, 8), M.ceramicMatte, 'bench:bowlFoot', xE + 0.2 + Math.cos(a) * 0.035, yt + 0.01, benchZ0 + 0.3 + Math.sin(a) * 0.035);
  return g;
}

function buildTallCabinet(R, win) {
  const g = group('tallCabinet');
  const x0 = Math.max(R.x1 - BENCH.depth, win.to + 0.005);
  const z0 = R.z1 - TALL.width;
  const y0 = BENCH.h;
  // 外框
  slab(g, M.woodOak, 'tall:side', x0, R.x1, y0, H - 0.005, z0, z0 + 0.02);
  slab(g, M.woodOak, 'tall:back', R.x1 - 0.02, R.x1, y0, H - 0.005, z0, R.z1);
  slab(g, M.woodOak, 'tall:shelf', x0, R.x1, 0.82, 0.84, z0, R.z1);
  // 上方門板（兩片，豎縫）
  const mid = (0.84 + H) / 2;
  slab(g, M.woodOak, 'tall:door', x0, x0 + 0.02, 0.845, mid - 0.004, z0 + 0.02, R.z1);
  slab(g, M.woodOak, 'tall:door', x0, x0 + 0.02, mid + 0.004, H - 0.005, z0 + 0.02, R.z1);
  slab(g, M.woodOak, 'tall:fill', x0 + 0.02, R.x1 - 0.02, 0.845, H - 0.005, z0 + 0.02, R.z1, { cast: false });
  // 下方開放格的小盆栽
  const px = (x0 + R.x1) / 2, pz = (z0 + R.z1) / 2;
  add(g, lathe([[0, 0], [0.05, 0], [0.06, 0.1], [0.055, 0.1], [0, 0.095]], 20), M.ceramicMatte, 'tall:pot', px, y0 + 0.05, pz);
  const lv = [];
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4;
    lv.push(placed(new THREE.SphereGeometry(0.03, 8, 6).scale(1, 0.35, 1.7), px + Math.sin(a) * 0.05, y0 + 0.19 + (i % 4) * 0.025, pz + Math.cos(a) * 0.05, 0.6, a, 0, 'YXZ'));
  }
  add(g, mergeGeometries(lv), M.leafOlive, 'tall:leaves', 0, 0, 0);
  return g;
}

// ═══════════════════════════════════════════════════════
// 西牆：弧形毛圈布腰果沙發
// ═══════════════════════════════════════════════════════
function buildSofa(rng, xWall, zc, halfLen) {
  const g = group('sofa');
  const S = SOFA;
  const r = S.bevel;
  const X0 = xWall + 0.02 + r;                    // 核心輪廓背線（中段貼牆）
  const N = 28;
  const backX = (t) => X0 + S.curve * t * t;      // 背線：兩端離牆、中段貼牆（拋物線）
  const zAt = (t) => zc + t * halfLen;
  const capR = S.depth / 2;

  // 外輪廓：背線（北→南）→ 南端半圓 → 前緣（南→北）→ 北端半圓
  const outline = [];
  for (let i = 0; i <= N; i++) { const t = -1 + (2 * i) / N; outline.push([backX(t), zAt(t)]); }
  for (let i = 1; i < 12; i++) { const a = Math.PI - (i / 12) * Math.PI; outline.push([backX(1) + capR + Math.cos(a) * capR, zAt(1) + Math.sin(a) * capR * 0.9]); }
  for (let i = N; i >= 0; i--) { const t = -1 + (2 * i) / N; outline.push([backX(t) + S.depth, zAt(t)]); }
  for (let i = 1; i < 12; i++) { const a = -(i / 12) * Math.PI; outline.push([backX(-1) + capR + Math.cos(a) * capR, zAt(-1) + Math.sin(a) * capR * 1.1]); }
  add(g, extrudePlan(outline, 0.015, S.seatH, r, true), M.fabricBoucle, 'sofa:seat', 0, 0, 0);

  // 靠背：沿背線的弧形帶，北端繞過去當扶手
  const outer = [], inner = [];
  const w = S.backW;
  for (let i = 0; i <= 8; i++) {           // 北端半圓的一部分（從前側 60° 繞到背線）
    const a = -Math.PI / 3 - (i / 8) * (Math.PI * 2 / 3);
    const cx = backX(-1) + capR, cz = zAt(-1);
    outer.push([cx + Math.cos(a) * capR, cz + Math.sin(a) * capR * 1.1]);
    inner.push([cx + Math.cos(a) * (capR - w), cz + Math.sin(a) * (capR - w) * 1.1]);
  }
  for (let i = 1; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const x = backX(t), z = zAt(t);
    const tx = 2 * S.curve * t, tz = halfLen;           // 切線 (dx/dt, dz/dt)
    const len = Math.hypot(tx, tz);
    outer.push([x, z]);
    inner.push([x + (tz / len) * w, z - (tx / len) * w]);
  }
  const band = [...outer, ...inner.reverse()];
  add(g, extrudePlan(band, 0.2, S.backH, r, true), M.fabricBoucle, 'sofa:back', 0, 0, 0);

  // 抱枕：白色毛圈、灰褐、膚粉
  const pil = [[-0.55, M.fabricWhite, 0.48], [-0.2, M.fabricTaupe, 0.44], [0.25, M.fabricWhite, 0.46], [0.6, M.fabricBlush, 0.42]];
  for (const [t, mat, s] of pil) {
    const x = backX(t) + w + r + 0.09;
    const slope = Math.atan2(2 * S.curve * t, halfLen);
    const p = add(g, rbox(0.15, s, s, 0.07, 3), mat, 'sofa:pillow', x, S.seatH + s / 2 - 0.03, zAt(t));
    p.rotation.set(rng.jitter(0, 0.1), -slope + rng.jitter(0, 0.12), 0.32 + rng.jitter(0, 0.05), 'YXZ'); // 往牆後仰
  }
  // 灰色針織毯：搭在南端座面
  const bt = add(g, rbox(0.55, 0.035, 0.5, 0.017), M.fabricGreyThrow, 'sofa:throw', backX(0.75) + 0.45, S.seatH + 0.012, zAt(0.72));
  bt.rotation.y = 0.2;
  return { g, frontMid: X0 + S.depth + r, zN: zAt(-1) - capR * 1.1 - r, zS: zAt(1) + capR * 0.9 + r };
}

// ═══════════════════════════════════════════════════════
// 圓茶几：白色喇叭底座＋橡木桌面
// ═══════════════════════════════════════════════════════
function buildCoffeeTable(x, z) {
  const g = group('coffeeTable');
  add(g, lathe([[0, 0], [0.21, 0], [0.215, 0.015], [0.19, 0.04], [0.12, 0.15], [0.085, 0.28], [0.08, 0.36], [0.1, 0.375], [0, 0.375]], 40),
    M.ceramicMatte, 'coffeeTable:base', x, 0, z);
  add(g, cyl(0.3, 0.29, 0.04, 48), M.woodOak, 'coffeeTable:top', x, 0.395, z);
  add(g, cyl(0.302, 0.302, 0.006, 48), M.paintWhite, 'coffeeTable:edge', x, 0.374, z, { cast: false });
  const b1 = add(g, box(0.24, 0.022, 0.3), M.bookColors[6], 'coffeeTable:book', x - 0.02, 0.426, z + 0.03);
  b1.rotation.y = 0.3;
  const b2 = add(g, box(0.21, 0.018, 0.27), M.paperWhite, 'coffeeTable:book', x - 0.03, 0.446, z + 0.04);
  b2.rotation.y = 0.18;
  return g;
}

// ═══════════════════════════════════════════════════════
// 鉻色立燈：上照燈盤＋閱讀臂（一盞點光）
// ═══════════════════════════════════════════════════════
function buildFloorLamp(x, z) {
  const g = group('floorLamp');
  const top = 1.82;
  add(g, cyl(0.14, 0.15, 0.02, 32), M.metalChrome, 'floorLamp:base', x, 0.01, z);
  add(g, cyl(0.011, 0.011, top - 0.02, 12), M.metalChrome, 'floorLamp:pole', x, 0.02 + (top - 0.02) / 2, z);
  add(g, lathe([[0.02, 0], [0.12, 0.03], [0.19, 0.07], [0.2, 0.08], [0.19, 0.075], [0.11, 0.035], [0.015, 0.008]], 40), M.metalChrome, 'floorLamp:dish', x, top, z);
  add(g, cyl(0.17, 0.17, 0.004, 32), M.lampShade, 'floorLamp:diffuser', x, top + 0.06, z, { cast: false });
  // 閱讀臂：旁邊一支短桿，上端彎出去
  const ax = x + 0.04;
  add(g, box(0.05, 0.05, 0.03), M.metalChrome, 'floorLamp:joint', x + 0.02, 0.75, z);
  add(g, cyl(0.008, 0.008, 0.47, 10), M.metalChrome, 'floorLamp:armPole', ax, 0.75 + 0.235, z);
  const arm = add(g, cyl(0.007, 0.007, 0.3, 10), M.metalChrome, 'floorLamp:arm', ax + 0.15, 1.24, z);
  arm.rotation.z = Math.PI / 2 - 0.12;
  const head = add(g, lathe([[0.008, 0], [0.04, 0.02], [0.045, 0.05], [0.04, 0.05], [0.006, 0.01]], 20), M.metalChrome, 'floorLamp:head', ax + 0.31, 1.24, z);
  head.rotation.z = Math.PI * 0.75;
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
  add(g, box(fw, h, w), M.woodOak, `${name}:frame`, xWall + fw / 2, y, zc);
  add(g, box(0.004, h - 0.04, w - 0.04), M.panelGreige, `${name}:mat`, xWall + fw + 0.001, y, zc, { cast: false });
  add(g, box(0.004, h - 0.12, w - 0.12), M.paperWhite, `${name}:paper`, xWall + fw + 0.003, y, zc, { cast: false });
  const ax = xWall + fw + 0.006;
  if (variant === 0) {
    // 鏽橘色不規則橢圓環
    const ring = add(g, new THREE.TorusGeometry(0.1, 0.03, 10, 40), M.ceramicRust, `${name}:shape`, ax, y + h * 0.02, zc, { cast: false });
    ring.rotation.y = Math.PI / 2;
    ring.scale.set(1, 1.5, 0.1);
    const blk = add(g, box(0.003, h * 0.12, w * 0.07), M.paintCharcoal, `${name}:shape`, ax + 0.002, y + h * 0.1, zc - w * 0.18, { cast: false });
    blk.rotation.x = 0.1;
    const arc = add(g, new THREE.TorusGeometry(0.05, 0.008, 8, 24, Math.PI), M.panelGreige, `${name}:shape`, ax + 0.002, y - h * 0.2, zc + w * 0.08, { cast: false });
    arc.rotation.y = Math.PI / 2;
  } else {
    const r1 = add(g, box(0.003, h * 0.3, w * 0.18), M.paintCharcoal, `${name}:shape`, ax, y + h * 0.04, zc, { cast: false });
    r1.rotation.x = 0.04;
    const c = add(g, cyl(w * 0.1, w * 0.1, 0.003, 24), M.paperWhite, `${name}:shape`, ax + 0.002, y + h * 0.07, zc, { cast: false });
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
    [M.ceramicRust, box(t, h, w), 0, h / 2, 0, 'frame'],
    [M.paperWhite, box(0.004, h - 0.07, w - 0.07), t / 2 + 0.002, h / 2, 0, 'paper'],
    [M.fabricTerracotta, box(0.004, h * 0.55, w * 0.42), t / 2 + 0.004, h * 0.55, -w * 0.12, 'shape'],
    [M.paperWhite, box(0.004, h * 0.3, w * 0.16), t / 2 + 0.006, h * 0.5, w * 0.02, 'shape'],
    [M.paintCharcoal, box(0.004, h * 0.18, 0.012), t / 2 + 0.008, h * 0.42, w * 0.05, 'shape'],
  ];
  for (const [mat, geo, x, y, z, n] of parts) {
    const m = mesh(geo, mat, `leaningArt:${n}`, { cast: n === 'frame' });
    m.position.set(x, y, z);
    inner.add(m);
  }
  // 底部離牆、頂端靠牆：繞 z 軸往 -x 傾
  inner.rotation.z = tilt;
  inner.position.set(xWall + t / 2 + h * Math.sin(tilt) + 0.01, 0, zc);
  g.add(inner);
  return g;
}

// ═══════════════════════════════════════════════════════
// 餐區：白大理石橢圓桌（金色圓盤底座）＋殼型椅＋PH 風格吊燈
// ═══════════════════════════════════════════════════════
function ovalPlan(cx, cz, len, wid, n = 48) {
  // 長軸沿 x 的「膠囊＋略鼓」橢圓（超橢圓）
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const e = 2.6;
    pts.push([cx + Math.sign(c) * Math.abs(c) ** (2 / e) * len / 2, cz + Math.sign(s) * Math.abs(s) ** (2 / e) * wid / 2]);
  }
  return pts;
}

function buildDiningTable(cx, cz) {
  const g = group('dining');
  const D = DINING;
  const r = 0.008;
  add(g, extrudePlan(ovalPlan(cx, cz, D.len - 2 * r, D.wid - 2 * r), D.h - 0.025, D.h, r), M.marbleWhite, 'dining:top', 0, 0, 0);
  add(g, cyl(0.04, 0.04, D.h - 0.05, 20), M.metalGold, 'dining:stem', cx, (D.h - 0.025) / 2 + 0.01, cz);
  add(g, cyl(0.24, 0.25, 0.022, 48), M.metalGold, 'dining:foot', cx, 0.011, cz);
  add(g, cyl(0.12, 0.12, 0.02, 32), M.metalGold, 'dining:plate', cx, D.h - 0.035, cz);
  // 桌上：小花器
  add(g, lathe([[0, 0], [0.04, 0], [0.05, 0.05], [0.03, 0.12], [0.02, 0.14], [0.015, 0.14]], 22), M.ceramicMatte, 'dining:vase', cx + D.len * 0.28, D.h, cz - 0.08);
  return g;
}

/** 殼型椅：坐面＋弧形椅背一體，細腳（本地座標：人面向 +z） */
function buildChair(name, mat) {
  const g = group(name);
  const seatY = 0.46;
  // 坐面：前緣圓的 U 形
  const seat = roundedRectPlan(-0.21, 0.21, -0.2, 0.22, { sw: 0.12, se: 0.12, nw: 0.06, ne: 0.06 });
  add(g, extrudePlan(seat, seatY - 0.04, seatY, 0.012, true), mat, `${name}:seat`, 0, 0, 0);
  // 椅背：環形扇形擠出（繞椅子後方）
  const s = new THREE.Shape();
  const R0 = 0.24, R1 = 0.262, a0 = Math.PI * 0.18, a1 = Math.PI * 0.82;
  for (let i = 0; i <= 20; i++) { const a = a0 + (i / 20) * (a1 - a0); const p = [Math.cos(a) * R1, Math.sin(a) * R1]; i ? s.lineTo(...p) : s.moveTo(...p); }
  for (let i = 20; i >= 0; i--) { const a = a0 + (i / 20) * (a1 - a0); s.lineTo(Math.cos(a) * R0, Math.sin(a) * R0); }
  let bg = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 3 });
  bg.rotateX(-Math.PI / 2);                     // 形狀 y → -z（椅背在後方 -z）
  bg.deleteAttribute('normal'); bg.deleteAttribute('uv');
  bg = mergeVertices(bg, 1e-4);
  bg.computeVertexNormals();
  const back = add(g, bg, mat, `${name}:back`, 0, seatY - 0.01, 0.04);
  back.rotation.x = -0.12;                      // 微後仰
  // 細腳（略外八）
  for (const [x, z] of [[-0.17, 0.16], [0.17, 0.16], [-0.17, -0.15], [0.17, -0.15]]) {
    const leg = add(g, cyl(0.009, 0.007, seatY - 0.03, 8), mat, `${name}:leg`, x * 1.06, (seatY - 0.03) / 2, z * 1.06);
    leg.rotation.set(-Math.sign(z) * 0.06, 0, Math.sign(x) * 0.06);
  }
  return g;
}

function buildPendant(cx, cz, bottomY) {
  const g = group('pendant');
  // 三層白色燈罩（PH 風格），由上而下變小
  const tiers = [[0.2, 0.19, 0.075], [0.14, 0.1, 0.06], [0.09, 0.03, 0.045]];
  for (const [rOut, y, hgt] of tiers) {
    add(g, lathe([[rOut * 0.22, hgt], [rOut * 0.55, hgt * 0.75], [rOut * 0.85, hgt * 0.35], [rOut, 0], [rOut - 0.004, 0.002],
      [rOut * 0.84, hgt * 0.35 - 0.004], [rOut * 0.54, hgt * 0.75 - 0.004], [rOut * 0.21, hgt - 0.004]], 40),
    M.paintWhite, 'pendant:shade', cx, bottomY + y, cz, { cast: false });
  }
  add(g, new THREE.SphereGeometry(0.035, 16, 12), M.lampBulb, 'pendant:bulb', cx, bottomY + 0.1, cz, { cast: false });
  add(g, cyl(0.03, 0.03, 0.12, 16), M.paintWhite, 'pendant:socket', cx, bottomY + 0.31, cz);
  add(g, cyl(0.003, 0.003, H - (bottomY + 0.37), 6), M.paintWhite, 'pendant:cord', cx, (H + bottomY + 0.37) / 2, cz, { cast: false });
  add(g, cyl(0.05, 0.05, 0.02, 20), M.paintWhite, 'pendant:canopy', cx, H - 0.01, cz);
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
  const wz1 = Math.min(R.z1, Math.max(sw.from[1], sw.to[1]));

  // —— 東牆系統：板材牆到轉角高櫃為止；展示龕在客廳段中間 ——
  const wallZ1 = R.z1 - TALL.width;
  const nCols = Math.max(1, Math.round((wallZ1 - R.z0) / WALLSYS.colW));
  const colW = (wallZ1 - R.z0) / nCols;
  const nicheMid = (wz0 + R.z1 - BENCH.depth) / 2;                 // 與沙發區對位
  const nicheI0 = Math.min(nCols - NICHE.cols, Math.max(0, Math.round((nicheMid - R.z0) / colW - NICHE.cols / 2)));
  const benchZ0 = R.z0 + (nicheI0 - 1) * colW;                     // 矮櫃從龕前一欄開始
  const ws = buildWallSystem(rng.fork('wall'), R, R.z0, wallZ1, { i0: nicheI0 }, benchZ0);
  root.add(ws.g);
  root.add(buildBenches(rng.fork('bench'), R, win, benchZ0));
  root.add(buildTallCabinet(R, win));

  // —— 西牆：弧形沙發（南端接到臥榻前）、立燈＋靠牆畫在北端 ——
  const sofaZ1 = R.z1 - BENCH.depth - 0.04;                        // 沙發南緣（含倒角）
  const sofaZ0 = wz0 + 0.62;                                       // 北緣：留給立燈與靠牆畫
  const capN = SOFA.depth / 2 * 1.1 + SOFA.bevel, capS = SOFA.depth / 2 * 0.9 + SOFA.bevel;
  const halfLen = (sofaZ1 - sofaZ0 - capN - capS) / 2;
  const sofaZc = sofaZ0 + capN + halfLen;
  const sofa = buildSofa(rng.fork('sofa'), R.x0, sofaZc, halfLen);
  root.add(sofa.g);
  root.add(buildLeaningArt(R.x0, wz0 + 0.33));
  root.add(buildFloorLamp(R.x0 + 0.2, wz0 + 0.45));
  root.add(buildWallArt(R.x0, sofaZc - halfLen * 0.45, 1.62, 0.5, 0.66, 0, 'artLarge'));
  root.add(buildWallArt(R.x0, sofaZc + halfLen * 0.35, 1.55, 0.36, 0.46, 1, 'artSmall'));

  // 圓茶几：沙發前緣與東側矮櫃之間
  const tableX = (sofa.frontMid + (R.x1 - BENCH.depth)) / 2 - 0.05;
  root.add(buildCoffeeTable(tableX, sofaZc + halfLen * 0.15));

  // —— 北端餐區：桌子短邊貼板材牆，西側留走道 ——
  const xf = ws.xf;
  const tcx = xf - DINING.len / 2;
  const tcz = Math.min(benchZ0 - 0.75, R.z0 + 0.45 + 0.35 + DINING.wid / 2);
  if (tcx - DINING.len / 2 - (R.x0) < WALKWAY) throw new Error('living: 餐桌西側走道不足');
  root.add(buildDiningTable(tcx, tcz));
  const chairs = [
    [tcx - 0.18, tcz - DINING.wid / 2 - 0.12, 0, M.plasticBlush],
    [tcx - 0.26, tcz + DINING.wid / 2 + 0.12, Math.PI, M.plasticBlush],
    [tcx + 0.26, tcz + DINING.wid / 2 + 0.14, Math.PI, M.ceramicRust],
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
