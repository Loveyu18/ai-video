/**
 * rooms/secondBed.js — 次臥（書房兼客房，日式／北歐）
 *
 * 配置（全部由 layout.js 推出）：
 *   - 右上角（x1, z0）：小衣櫃，門朝 -x
 *   - 右牆（x1）：單人床，床頭靠南牆（矮床頭板，不擋窗）
 *   - 南窗下（z1，從 x0 起）：書桌＋椅子，桌上檯燈、筆電、書、筆筒、馬克杯
 *   - 左牆（x0）：門掃掠區之後放書架；書桌上方軟木板＋層板
 *   - 中央地毯＋坐墩；門與衣櫃之間放琴葉榕盆栽；床邊牆上掛畫與壁燈
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import * as G from '../geo.js';

const ROOM = 'secondBed';
// 書背減色：以米白、白、炭灰為主，只留一點藍灰（照片風格）
const BOOK_MATS = [M.bookColors[4], M.paperWhite, M.bookColors[6], M.paintCream, M.bookColors[4], M.paperWhite, M.bookColors[1]];

// ── 家具尺寸（公尺） ──────────────────────────────────
const WARDROBE = { w: 0.82, d: 0.57, h: 2.05 };
const BED = { w: 1.06, l: 1.95, mattressW: 0.98, mattressL: 1.88, headH: 0.86 };
const DESK = { w: 1.32, d: 0.56, h: 0.75, top: 0.03 };
const SHELF = { w: 0.9, d: 0.32, h: 1.8 };
const CHAIR = { seatH: 0.45, w: 0.44, d: 0.42, backH: 0.82 };

// ── 小工具 ────────────────────────────────────────────
function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
/** 方塊：中心 (x,y,z)。一律倒角（預設 3mm，r 可加大）；極薄的片才用直角 */
function box(w, h, d, mat, name, x, y, z, r = 0) {
  const geo = Math.min(w, h, d) < 0.008
    ? G.worldUV(new THREE.BoxGeometry(w, h, d))
    : G.roundedBox(w, h, d, r > 0 ? r : 0.003, r > 0.02 ? 3 : 2);
  const m = mesh(geo, mat, name);
  m.position.set(x, y, z);
  return m;
}
/** 方塊：以 min/max 範圍給 */
function boxMinMax(x0, x1, y0, y1, z0, z1, mat, name, r = 0) {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, name, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
}
function cyl(rTop, rBot, h, mat, name, x, y, z, seg = 20) {
  const m = mesh(G.worldUV(new THREE.CylinderGeometry(rTop, rBot, h, seg)), mat, name);
  m.position.set(x, y, z);
  return m;
}
/** 依材質分桶合併幾何 */
function addMerged(parent, buckets, mats, name) {
  buckets.forEach((list, i) => {
    if (!list.length) return;
    parent.add(mesh(mergeGeometries(list), mats[i], `${name}:${i}`));
  });
}
/** 由幾何建 mesh 並擺位 */
function place(geo, mat, name, x, y, z, rot = [0, 0, 0]) {
  const m = mesh(geo, mat, name);
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  return m;
}
/**
 * 抱枕表面沿鼓面走的細線（格紋、圖騰）。lines：每條線是 [[nx, nz], ...]（-1~1 正規化座標）。
 * face：+1 畫在 +y 面、-1 畫在 -y 面。公式與 geo.cushion 的厚度分布一致。
 */
function cushionLines(w, h, d, seam, lines, face, r = 0.0028) {
  return mergeGeometries(lines.map((pts) => G.tube(pts.map(([nx, nz]) => {
    const e = Math.max((1 - nx ** 4) * (1 - nz ** 4), 0);
    const t = seam + (1 - seam) * Math.sqrt(e);
    return [(nx * w) / 2, face * ((h / 2) * t + 0.004), (nz * d) / 2];
  }), r, { segments: 28, radial: 5 })));
}
const lineAlong = (fixed, axis, n = 9, span = 0.82) =>
  Array.from({ length: n }, (_, i) => {
    const v = -span + (2 * span * i) / (n - 1);
    return axis === 'x' ? [v, fixed] : [fixed, v];
  });
/** 毯子流蘇：沿 z 一排細管，從 (x, y) 往下 len */
function fringeGeo(x, y, z0, z1, len, rng, step = 0.018) {
  const list = [];
  for (let z = z0; z < z1; z += step) {
    const l = len + rng.range(-0.008, 0.008);
    list.push(G.tube([[x, y, z], [x + rng.range(-0.006, 0.006), y - l * 0.5, z + rng.range(-0.004, 0.004)], [x + rng.range(-0.01, 0.01), y - l, z]], 0.0025, { segments: 6, radial: 4 }));
  }
  return mergeGeometries(list);
}

// ═══════════════════════════════════════════════════════
// 書：沿 z 方向排成一列，書背朝 +x（靠左牆的書架／層板用）
// ═══════════════════════════════════════════════════════
function bookRowZ(rng, buckets, { xBack, y, z0, z1, maxH, minH = 0.17, depth = [0.14, 0.2] }) {
  let z = z0;
  while (z < z1 - 0.03) {
    if (rng.chance(0.06)) { z += rng.range(0.02, 0.05); continue; }
    const t = rng.range(0.018, 0.045);
    if (z + t > z1) break;
    const h = rng.range(minH, maxH);
    const d = rng.range(depth[0], depth[1]);
    const g = new THREE.BoxGeometry(d, h, t);
    g.translate(xBack + d / 2, y + h / 2, z + t / 2);
    G.worldUV(g);
    buckets[rng.int(0, buckets.length - 1)].push(g);
    z += t + 0.001;
  }
  return z;
}
/** 平放的書堆（封面＋內頁） */
function bookStack(rng, parent, cx, y, cz, n, name, rotBase = 0) {
  const g = new THREE.Group();
  g.name = `${ROOM}:${name}`;
  let yy = y;
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.15, 0.24), d = rng.range(0.21, 0.29), t = rng.range(0.018, 0.035);
    const b = new THREE.Group();
    b.add(box(w, t, d, rng.pick(BOOK_MATS), `${name}:cover${i}`, 0, t / 2, 0));
    b.add(box(w - 0.006, t - 0.006, d - 0.012, M.paperWhite, `${name}:pages${i}`, 0.004, t / 2, 0));
    b.position.set(cx + rng.jitter(0, 0.01), yy, cz + rng.jitter(0, 0.01));
    b.rotation.y = rotBase + rng.jitter(0, 0.12);
    g.add(b);
    yy += t;
  }
  parent.add(g);
  return yy;
}

// ═══════════════════════════════════════════════════════
// 衣櫃（右上角，門朝 -x）
// ═══════════════════════════════════════════════════════
function buildWardrobe(I) {
  const g = new THREE.Group();
  g.name = `${ROOM}:wardrobe`;
  const x1 = I.x1, x0 = x1 - WARDROBE.d, z0 = I.z0, z1 = z0 + WARDROBE.w, H = WARDROBE.h;
  const plinth = 0.08, t = 0.018;
  g.add(boxMinMax(x0 + 0.04, x1, 0, plinth, z0 + 0.02, z1 - 0.02, M.paintCharcoal, 'wardrobe:plinth'));
  g.add(boxMinMax(x0 + 0.02, x1, plinth, H, z0, z0 + t, M.paintWhite, 'wardrobe:side'));
  g.add(boxMinMax(x0 + 0.02, x1, plinth, H, z1 - t, z1, M.paintWhite, 'wardrobe:side'));
  g.add(boxMinMax(x0 + 0.02, x1, H - t, H, z0, z1, M.paintWhite, 'wardrobe:top'));
  g.add(boxMinMax(x0 + 0.02, x1, plinth, plinth + t, z0, z1, M.paintWhite, 'wardrobe:bottom'));
  // 兩扇門（中間細縫、門板有一道橫向溝槽）
  const doorX0 = x0, doorX1 = x0 + 0.02, gap = 0.003;
  const zm = (z0 + z1) / 2;
  for (const [a, b, side] of [[z0 + gap, zm - gap / 2, 0], [zm + gap / 2, z1 - gap, 1]]) {
    g.add(boxMinMax(doorX0, doorX1, plinth + gap, H - gap, a, b, M.woodOak, `wardrobe:door${side}`, 0.003));
    g.add(boxMinMax(doorX0 - 0.001, doorX0 + 0.002, 1.62, 1.626, a + 0.02, b - 0.02, M.paintCream, `wardrobe:groove${side}`));
    // 長條黃銅把手（靠中縫）
    const hz = side === 0 ? b - 0.04 : a + 0.04;
    g.add(box(0.012, 0.36, 0.012, M.metalBrass, `wardrobe:handle${side}`, doorX0 - 0.022, 1.05, hz));
    for (const hy of [0.89, 1.21]) g.add(box(0.016, 0.008, 0.008, M.metalBrass, `wardrobe:handleFoot${side}`, doorX0 - 0.009, hy, hz));
  }
  // 櫃頂收納籃
  g.add(boxMinMax(x0 + 0.1, x1 - 0.06, H, H + 0.24, z0 + 0.08, z0 + 0.46, M.fabricOat, 'wardrobe:basket', 0.03));
  g.add(boxMinMax(x0 + 0.12, x1 - 0.08, H + 0.24, H + 0.27, z0 + 0.1, z0 + 0.44, M.fabricLinen, 'wardrobe:basketBlanket', 0.015));
  g.add(boxMinMax(x0 + 0.08, x1 - 0.1, H, H + 0.16, z0 + 0.5, z1 - 0.06, M.paintCream, 'wardrobe:box', 0.01));
  return { group: g, x0, z1 };
}

// ═══════════════════════════════════════════════════════
// 單人床（靠右牆，床頭靠南牆）
// ═══════════════════════════════════════════════════════
function buildBed(I, rng, sill) {
  const g = new THREE.Group();
  g.name = `${ROOM}:bed`;
  const x1 = I.x1, x0 = x1 - BED.w, z1 = I.z1, z0 = z1 - BED.l;
  const cx = (x0 + x1) / 2;
  const headT = 0.045;
  const headH = Math.min(BED.headH, sill - 0.04); // 床頭板頂低於窗台，不擋窗
  const fz0 = z0, fz1 = z1 - headT;              // 床架範圍

  // 床頭板：外框＋直條格柵
  g.add(boxMinMax(x0, x0 + 0.045, 0, headH, z1 - headT, z1, M.woodOak, 'bed:headPost'));
  g.add(boxMinMax(x1 - 0.045, x1, 0, headH, z1 - headT, z1, M.woodOak, 'bed:headPost'));
  g.add(boxMinMax(x0, x1, headH - 0.06, headH, z1 - headT, z1, M.woodOak, 'bed:headRail', 0.008));
  g.add(boxMinMax(x0 + 0.045, x1 - 0.045, 0.48, 0.52, z1 - headT + 0.008, z1 - 0.008, M.woodOak, 'bed:headRailLow'));
  const slats = 9;
  const span = BED.w - 0.09;
  for (let i = 0; i < slats; i++) {
    const sx = x0 + 0.045 + (span / slats) * (i + 0.5);
    g.add(boxMinMax(sx - 0.018, sx + 0.018, 0.52, headH - 0.06, z1 - headT + 0.012, z1 - 0.012, M.woodOak, 'bed:headSlat'));
  }
  // 床架側板＋床尾板
  const railY0 = 0.14, railY1 = 0.32;
  g.add(boxMinMax(x0, x0 + 0.035, railY0, railY1, fz0, fz1, M.woodOak, 'bed:railL', 0.006));
  g.add(boxMinMax(x1 - 0.035, x1, railY0, railY1, fz0, fz1, M.woodOak, 'bed:railR', 0.006));
  g.add(boxMinMax(x0, x1, railY0, railY1 + 0.04, fz0, fz0 + 0.04, M.woodOak, 'bed:foot', 0.008));
  // 床腳（微錐形）
  for (const lx of [x0 + 0.045, x1 - 0.045]) {
    for (const lz of [fz0 + 0.045, fz1 - 0.06]) g.add(cyl(0.024, 0.018, railY0, M.woodOak, 'bed:leg', lx, railY0 / 2, lz, 14));
  }
  // 床板
  g.add(boxMinMax(x0 + 0.035, x1 - 0.035, railY1 - 0.04, railY1 - 0.02, fz0 + 0.04, fz1, M.paintCream, 'bed:deck'));

  // 床墊（微鼓頂面、圓潤邊）
  const mY0 = railY1 - 0.02, mH = 0.2, mY1 = mY0 + mH;
  const mz0 = fz0 + 0.04 + (fz1 - fz0 - 0.04 - BED.mattressL) / 2;
  const mz1 = mz0 + BED.mattressL;
  const mcz = (mz0 + mz1) / 2;
  g.add(place(G.mattress(BED.mattressW, mH, BED.mattressL, { radius: 0.05, crown: 0.012 }), M.fabricWhite, 'bed:mattress', cx, mY0 + mH / 2, mcz));
  const top = mY1 + 0.01; // 床墊頂（含鼓起）

  // 被子：蓋住床尾 2/3，往走道側（x0）與床尾自然垂下
  const duvetZ1 = mz1 - 0.6;
  const dLen = duvetZ1 - mz0;
  const duvet = G.drapeOver({
    w: BED.mattressW, d: dLen, thickness: 0.035, wrinkle: 0.014, edgeRadius: 0.05,
    overhang: { x0: 0.26, x1: 0.02, z0: 0.16, z1: 0 }, rng: rng.fork('duvet'),
  });
  g.add(place(duvet, M.fabricBoucle, 'bed:duvet', cx, top + 0.035, (mz0 + duvetZ1) / 2));
  // 被套反摺（白）
  g.add(place(G.mattress(BED.mattressW + 0.03, 0.035, 0.24, { radius: 0.015, crown: 0.006 }), M.fabricWhite, 'bed:duvetFold', cx - 0.005, top + 0.045, duvetZ1 - 0.1));

  // 深灰針織毯：鋪在床尾、往走道側垂下，末端流蘇
  const tw = BED.mattressW - 0.06, tl = 0.72, hang = 0.3, tTop = top + 0.035 + 0.014;
  const throwG = new THREE.Group();
  throwG.name = `${ROOM}:bed:throwSet`;
  throwG.add(place(G.drapeOver({
    w: tw, d: tl, thickness: 0.012, wrinkle: 0.016, edgeRadius: 0.045,
    overhang: { x0: hang, x1: 0, z0: 0, z1: 0 }, rng: rng.fork('throw'),
  }), M.fabricGreyThrow, 'bed:throw', 0, 0, 0));
  const arc = (Math.PI / 2) * 0.045, down = hang - arc;
  const fx = -(tw / 2 + 0.045 + (down * 0.04) / Math.max(0.2, down + 0.2)) - 0.003;
  throwG.add(mesh(fringeGeo(fx, -0.045 - down + 0.004, -tl / 2 + 0.01, tl / 2 - 0.01, 0.065, rng.fork('fringe')), M.fabricGreyThrow, 'bed:throwFringe'));
  throwG.position.set(cx + 0.03, tTop, mz0 + 0.12 + tl / 2);
  throwG.rotation.y = 0.06;
  g.add(throwG);

  // 枕頭（平放）＋兩個抱枕（立起靠床頭、互相倚靠）
  const pillowZ = mz1 - 0.25;
  g.add(place(G.cushion(0.66, 0.15, 0.42, { seam: 0.22, wrinkle: 0.004, rng: rng.fork('pillow') }), M.fabricWhite, 'bed:pillow', cx, top + 0.06, pillowZ, [0.1, 0, 0]));
  const lean = (a) => -Math.PI / 2 + a; // 往床頭（+z）後仰 a
  // 粉色（後）
  g.add(place(G.cushion(0.42, 0.13, 0.42, { seam: 0.18, wrinkle: 0.005, rng: rng.fork('pink') }), M.fabricBlush, 'bed:cushionPink',
    cx + 0.15, top + 0.25, pillowZ - 0.02, [lean(0.32), rng.jitter(-0.12, 0.04), rng.jitter(0.05, 0.03)]));
  // 格紋（前，斜靠在粉色上）
  const plaid = new THREE.Group();
  plaid.name = `${ROOM}:bed:cushionPlaid`;
  const pw = 0.38, ph = 0.12, seam = 0.18;
  plaid.add(mesh(G.cushion(pw, ph, pw, { seam, wrinkle: 0.004, rng: rng.fork('plaid') }), M.fabricWhite, 'bed:cushionPlaid:base'));
  const ks = [-0.55, -0.2, 0.2, 0.55];
  plaid.add(mesh(cushionLines(pw, ph, pw, seam, [...ks.map((k) => lineAlong(k, 'z')), ...ks.map((k) => lineAlong(k, 'x'))], 1), M.fabricCharcoal, 'bed:cushionPlaid:lines'));
  plaid.position.set(cx - 0.15, top + 0.21, pillowZ - 0.14);
  plaid.rotation.set(lean(0.42), 0.2, -0.12);
  g.add(plaid);
  return { group: g, x0, z0 };
}

// ═══════════════════════════════════════════════════════
// 書桌（南窗下，從左牆起）＋桌上物件
// ═══════════════════════════════════════════════════════
function buildDesk(I, rng, maxX1, win) {
  const g = new THREE.Group();
  g.name = `${ROOM}:desk`;
  const x0 = I.x0 + 0.01, x1 = Math.min(x0 + DESK.w, maxX1), z1 = I.z1 - 0.005, z0 = z1 - DESK.d;
  const topY = DESK.h, cx = (x0 + x1) / 2;
  g.add(boxMinMax(x0, x1, topY - DESK.top, topY, z0, z1, M.paintCream, 'desk:top', 0.006));
  // 裙板＋抽屜
  g.add(boxMinMax(x0 + 0.04, x1 - 0.04, topY - 0.11, topY - DESK.top, z0 + 0.04, z0 + 0.06, M.woodOak, 'desk:apronFront'));
  g.add(boxMinMax(x0 + 0.04, x1 - 0.04, topY - 0.11, topY - DESK.top, z1 - 0.06, z1 - 0.04, M.woodOak, 'desk:apronBack'));
  g.add(boxMinMax(x0 + 0.04, x0 + 0.06, topY - 0.11, topY - DESK.top, z0 + 0.06, z1 - 0.06, M.woodOak, 'desk:apronL'));
  g.add(boxMinMax(x1 - 0.06, x1 - 0.04, topY - 0.11, topY - DESK.top, z0 + 0.06, z1 - 0.06, M.woodOak, 'desk:apronR'));
  g.add(boxMinMax(cx - 0.25, cx + 0.25, topY - 0.105, topY - DESK.top - 0.005, z0 + 0.035, z0 + 0.055, M.paintCream, 'desk:drawer', 0.003));
  g.add(box(0.1, 0.012, 0.014, M.metalBrass, 'desk:drawerPull', cx, topY - 0.07, z0 + 0.028));
  // 錐形桌腳（略外斜）
  const legH = topY - DESK.top;
  for (const [lx, sx] of [[x0 + 0.05, -1], [x1 - 0.05, 1]]) {
    for (const [lz, sz] of [[z0 + 0.05, -1], [z1 - 0.05, 1]]) {
      const leg = cyl(0.022, 0.015, legH, M.woodOak, 'desk:leg', lx + sx * 0.008, legH / 2, lz + sz * 0.008, 14);
      leg.rotation.set(sz * 0.03, 0, -sx * 0.03);
      g.add(leg);
    }
  }

  // ── 桌上物件 ──
  const yTop = topY;
  // 筆電（略斜放，螢幕開約 105°）
  const lap = new THREE.Group();
  lap.name = `${ROOM}:laptop`;
  const lw = 0.31, ld = 0.215;
  lap.add(boxMinMax(-lw / 2, lw / 2, 0, 0.012, -ld / 2, ld / 2, M.metalAluminium, 'laptop:base', 0.004));
  lap.add(boxMinMax(-lw / 2 + 0.025, lw / 2 - 0.025, 0.012, 0.0135, -ld / 2 + 0.02, ld / 2 - 0.09, M.plasticBlack, 'laptop:keys'));
  lap.add(boxMinMax(-0.05, 0.05, 0.012, 0.0128, ld / 2 - 0.075, ld / 2 - 0.02, M.plasticWhite, 'laptop:trackpad'));
  const lid = new THREE.Group();
  lid.position.set(0, 0.012, -ld / 2);
  lid.rotation.x = -0.26;
  lid.add(boxMinMax(-lw / 2, lw / 2, 0, ld, -0.006, 0, M.metalAluminium, 'laptop:lid', 0.003));
  lid.add(boxMinMax(-lw / 2 + 0.01, lw / 2 - 0.01, 0.01, ld - 0.012, 0, 0.001, M.screenOn, 'laptop:screen'));
  lap.add(lid);
  // 筆電背對窗、面向坐的人（螢幕在 +z 端 → 翻轉）
  lap.rotation.y = Math.PI + rng.jitter(0, 0.08);
  lap.position.set(cx - 0.02, yTop, z0 + 0.27);
  g.add(lap);

  // 書堆＋筆筒（左側靠牆）
  bookStack(rng, g, x0 + 0.17, yTop, z1 - 0.2, 3, 'deskBooks', 0.1);
  const cupX = x0 + 0.1, cupZ = z0 + 0.14;
  g.add(cyl(0.035, 0.035, 0.1, M.woodWalnut, 'penCup', cupX, yTop + 0.05, cupZ, 18));
  g.add(cyl(0.031, 0.031, 0.002, M.plasticBlack, 'penCupInside', cupX, yTop + 0.098, cupZ, 18));
  const penMats = [M.metalBlack, M.plasticWhite, M.metalBrass, M.fabricCharcoal, M.plasticWhite];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.range(0, 0.6);
    const len = rng.range(0.13, 0.16);
    const pen = cyl(0.004, 0.004, len, penMats[i], 'pen', cupX + Math.cos(a) * 0.016, yTop + 0.015 + len / 2, cupZ + Math.sin(a) * 0.016, 8);
    pen.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
    g.add(pen);
  }
  // 筆記本＋鉛筆
  const nb = box(0.15, 0.008, 0.21, M.fabricOat, 'notebook', x0 + 0.36, yTop + 0.004, z0 + 0.16);
  nb.rotation.y = rng.jitter(0.25, 0.1);
  g.add(nb);
  const pencil = cyl(0.0035, 0.0035, 0.17, M.woodOak, 'pencil', x0 + 0.38, yTop + 0.012, z0 + 0.14, 6);
  pencil.rotation.set(0, 0, Math.PI / 2);
  pencil.rotation.y = 0.5;
  g.add(pencil);
  // 馬克杯
  const mugX = x1 - 0.36, mugZ = z0 + 0.13;
  g.add(cyl(0.04, 0.036, 0.095, M.ceramicWhite, 'mug', mugX, yTop + 0.0475, mugZ, 20));
  g.add(cyl(0.036, 0.036, 0.002, M.woodWalnut, 'mugCoffee', mugX, yTop + 0.085, mugZ, 20));
  const handle = mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16, Math.PI), M.ceramicWhite, 'mugHandle');
  handle.position.set(mugX + 0.038, yTop + 0.05, mugZ);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
  // 多肉小盆（窗邊，壓低高度不擋窗）
  const sx = Math.min(x1 - 0.22, win.from + 0.55), sz = z1 - 0.12;
  g.add(cyl(0.045, 0.035, 0.07, M.ceramicMatte, 'succulentPot', sx, yTop + 0.035, sz, 16));
  g.add(cyl(0.04, 0.04, 0.005, M.soil, 'succulentSoil', sx, yTop + 0.066, sz, 16));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = mesh(new THREE.SphereGeometry(0.018, 8, 6), M.leafOlive, 'succulentLeaf');
    leaf.scale.set(0.6, 1.4, 0.6);
    leaf.position.set(sx + Math.cos(a) * 0.018, yTop + 0.085, sz + Math.sin(a) * 0.018);
    leaf.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    g.add(leaf);
  }

  // 檯燈（桌子右端，靠床頭，兼床頭燈）：陶瓷燈座＋布燈罩
  const lampX = x1 - 0.16, lampZ = z1 - 0.27; // 燈罩離百葉簾 ≥ 0.15m
  g.add(place(G.lathe([[0, 0], [0.066, 0], [0.07, 0.006], [0.068, 0.016], [0.06, 0.02], [0, 0.02]], 40), M.woodWalnut, 'lamp:foot', lampX, yTop, lampZ));
  g.add(place(G.lathe([[0, 0], [0.05, 0], [0.068, 0.025], [0.077, 0.07], [0.07, 0.13], [0.05, 0.19], [0.026, 0.225], [0.016, 0.24], [0.018, 0.25], [0, 0.252]], 48), M.ceramicMatte, 'lamp:body', lampX, yTop + 0.02, lampZ));
  g.add(cyl(0.005, 0.005, 0.12, M.metalBrass, 'lamp:stem', lampX, yTop + 0.33, lampZ, 10));
  // 布燈罩：有厚度的車削環（外→上緣→內→下緣）
  const shadeH = 0.2;
  g.add(place(G.lathe([[0.15, 0], [0.11, shadeH], [0.105, shadeH], [0.145, 0.002], [0.15, 0]], 48), M.lampShade, 'lamp:shade', lampX, yTop + 0.32, lampZ));
  g.add(place(G.tube([[0.008, 0, 0], [0.105, 0, 0]], 0.0025, { segments: 2, radial: 5 }), M.metalBrass, 'lamp:spider', lampX, yTop + 0.32 + shadeH - 0.01, lampZ));
  const bulb = mesh(new THREE.SphereGeometry(0.03, 16, 12), M.lampBulb, 'lamp:bulb', { cast: false });
  bulb.position.set(lampX, yTop + 0.37, lampZ);
  g.add(bulb);
  return { group: g, x0, x1, z0, z1, lamp: [lampX, yTop + 0.36, lampZ] };
}

// ═══════════════════════════════════════════════════════
// 椅子（溫莎風木椅，面向書桌）
// ═══════════════════════════════════════════════════════
function buildChair(cx, cz, rotY) {
  const g = new THREE.Group();
  g.name = `${ROOM}:chair`;
  const { seatH, w, d, backH } = CHAIR;
  // 座板：圓角梯形（前寬後窄），倒角擠出
  const st = 0.03;
  const corners = [[-w / 2 + 0.03, -d / 2], [w / 2 - 0.03, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const seatShape = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4], [px, pz] = corners[(i + 3) % 4];
    const rr = 0.05;
    const toP = [px - ax, pz - az], toB = [bx - ax, bz - az];
    const nP = Math.hypot(...toP), nB = Math.hypot(...toB);
    const s0 = [ax + (toP[0] / nP) * rr, az + (toP[1] / nP) * rr], s1 = [ax + (toB[0] / nB) * rr, az + (toB[1] / nB) * rr];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      seatShape.push([u * u * s0[0] + 2 * u * t * ax + t * t * s1[0], u * u * s0[1] + 2 * u * t * az + t * t * s1[1]]);
    }
  }
  g.add(place(G.extrudeRounded(seatShape, st, 0.006), M.woodOak, 'chair:seat', 0, seatH - st, 0));
  g.add(place(G.mattress(w - 0.08, 0.03, d - 0.09, { radius: 0.013, crown: 0.006 }), M.fabricLinen, 'chair:pad', 0, seatH + 0.013, 0.01));
  // 椅腳：外斜錐形（lathe 後傾斜）
  const legH = seatH - st;
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lg = G.lathe([[0, 0], [0.012, 0], [0.015, legH * 0.55], [0.017, legH], [0, legH]], 16);
      lg.rotateX(-sz * 0.07);
      lg.rotateZ(sx * 0.07);
      lg.translate(sx * (w / 2 - 0.045) + sx * legH * 0.07, 0.0015, sz * (d / 2 - 0.05) + sz * legH * 0.07);
      legs.push(lg);
    }
  }
  g.add(mesh(mergeGeometries(legs), M.woodOak, 'chair:legs'));
  // H 型橫撐
  const sy = 0.16, lx = w / 2 - 0.045 + 0.06 * 0.07 * 4, lz = d / 2 - 0.05 + 0.06 * 0.07 * 4;
  g.add(mesh(mergeGeometries([
    G.tube([[-lx, sy, -lz], [-lx, sy, lz]], 0.009, { segments: 4, radial: 10 }),
    G.tube([[lx, sy, -lz], [lx, sy, lz]], 0.009, { segments: 4, radial: 10 }),
    G.tube([[-lx, sy, 0], [lx, sy, 0]], 0.008, { segments: 4, radial: 10 }),
  ]), M.woodOak, 'chair:stretchers'));
  // 椅背：弓形頂板＋兩支後柱＋直條（全部 tube）
  const bz = -d / 2 + 0.035;
  const railAt = (t) => [t * 0.21, backH - 0.015 + 0.012 * (1 - t * t), bz - 0.06 - 0.045 * (1 - t * t)];
  const railPts = Array.from({ length: 9 }, (_, i) => railAt(-1.12 + (2.24 * i) / 8));
  g.add(mesh(G.tube(railPts, 0.016, { segments: 40, radial: 12 }), M.woodOak, 'chair:topRail'));
  for (const e of [railPts[0], railPts[railPts.length - 1]]) g.add(place(new THREE.SphereGeometry(0.016, 12, 8), M.woodOak, 'chair:railEnd', ...e));
  const spindles = [];
  for (const t of [-1, -0.5, 0, 0.5, 1]) {
    const [rx, ry, rz] = railAt(t);
    const base = [t * 0.17, seatH - 0.004, bz + 0.005];
    const r = Math.abs(t) === 1 ? 0.012 : 0.0075; // 兩端較粗當後柱
    spindles.push(G.tube([base, [(base[0] + rx) / 2, (base[1] + ry) / 2, (base[2] + rz) / 2 - 0.004], [rx, ry - 0.005, rz]], r, { segments: 12, radial: 8 }));
  }
  g.add(mesh(mergeGeometries(spindles), M.woodOak, 'chair:spindles'));
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;
  return g;
}

// ═══════════════════════════════════════════════════════
// 書架（靠左牆，門掃掠區之後）
// ═══════════════════════════════════════════════════════
function buildBookshelf(I, rng, z0) {
  const g = new THREE.Group();
  g.name = `${ROOM}:bookshelf`;
  const x0 = I.x0 + 0.005, x1 = x0 + SHELF.d, z1 = z0 + SHELF.w, H = SHELF.h, t = 0.02;
  g.add(boxMinMax(x0, x1, 0, H, z0, z0 + t, M.woodOak, 'shelf:side'));
  g.add(boxMinMax(x0, x1, 0, H, z1 - t, z1, M.woodOak, 'shelf:side'));
  g.add(boxMinMax(x0, x0 + 0.008, 0.06, H, z0 + t, z1 - t, M.paintWhite, 'shelf:back'));
  g.add(boxMinMax(x0 + 0.02, x1 - 0.01, 0, 0.06, z0 + t, z1 - t, M.paintWhite, 'shelf:kick'));
  const levels = [0.06, 0.42, 0.76, 1.1, 1.44, H - t];
  for (const y of levels) g.add(boxMinMax(x0 + 0.008, x1, y, y + t, z0 + t, z1 - t, M.woodOak, 'shelf:board'));

  const buckets = BOOK_MATS.map(() => []);
  const zi0 = z0 + t + 0.01, zi1 = z1 - t - 0.01;
  // 第 1 層：收納盒＋大書
  const boxW = 0.28;
  g.add(boxMinMax(x0 + 0.03, x1 - 0.02, levels[0] + t, levels[0] + t + 0.26, zi0, zi0 + boxW, M.rattan, 'shelf:basket', 0.02));
  g.add(boxMinMax(x0 + 0.03, x1 - 0.02, levels[0] + t, levels[0] + t + 0.26, zi0 + boxW + 0.02, zi0 + boxW * 2 + 0.02, M.rattan, 'shelf:basket', 0.02));
  bookRowZ(rng, buckets, { xBack: x0 + 0.03, y: levels[0] + t, z0: zi0 + boxW * 2 + 0.05, z1: zi1, maxH: 0.31, minH: 0.25, depth: [0.2, 0.26] });
  // 第 2 層：滿滿的書
  bookRowZ(rng, buckets, { xBack: x0 + 0.02, y: levels[1] + t, z0: zi0, z1: zi1 - 0.04, maxH: 0.29, minH: 0.2 });
  // 第 3 層：半排書＋花瓶
  const e3 = bookRowZ(rng, buckets, { xBack: x0 + 0.02, y: levels[2] + t, z0: zi0, z1: zi0 + 0.45, maxH: 0.27, minH: 0.18 });
  const vz = (e3 + zi1) / 2;
  const vase = mesh(new THREE.LatheGeometry(
    [[0.001, 0], [0.05, 0.003], [0.065, 0.06], [0.05, 0.13], [0.022, 0.17], [0.026, 0.2], [0.02, 0.2]].map(([r, y]) => new THREE.Vector2(r, y)), 20), M.ceramicWhite, 'shelf:vase');
  vase.position.set((x0 + x1) / 2 + 0.01, levels[2] + t, vz);
  g.add(vase);
  for (let i = 0; i < 3; i++) {
    const s = cyl(0.002, 0.002, 0.22, M.stem, 'shelf:twig', vase.position.x, levels[2] + t + 0.28, vz, 5);
    s.rotation.set(rng.jitter(0, 0.25), 0, rng.jitter(0, 0.25));
    g.add(s);
  }
  // 第 4 層：一排書＋倒下的書堆
  const e4 = bookRowZ(rng, buckets, { xBack: x0 + 0.02, y: levels[3] + t, z0: zi0 + 0.25, z1: zi1, maxH: 0.28, minH: 0.18 });
  void e4;
  bookStack(rng, g, (x0 + x1) / 2 + 0.015, levels[3] + t, zi0 + 0.12, 4, 'shelf:stack', Math.PI / 2);
  // 頂層：相框＋小物
  const frame = new THREE.Group();
  frame.name = `${ROOM}:shelf:photo`;
  frame.add(boxMinMax(-0.01, 0.01, 0, 0.2, -0.075, 0.075, M.woodWalnut, 'shelf:photoFrame'));
  frame.add(boxMinMax(0.01, 0.012, 0.025, 0.175, -0.05, 0.05, M.paintCharcoal, 'shelf:photoArt'));
  frame.position.set(x0 + 0.08, levels[4] + t, zi0 + 0.15);
  frame.rotation.z = -0.08;
  g.add(frame);
  bookRowZ(rng, buckets, { xBack: x0 + 0.02, y: levels[4] + t, z0: zi0 + 0.33, z1: zi1 - 0.12, maxH: 0.26, minH: 0.2 });
  g.add(cyl(0.035, 0.035, 0.07, M.paintCharcoal, 'shelf:candle', (x0 + x1) / 2, levels[4] + t + 0.035, zi1 - 0.06, 16));
  // 架頂：小盆栽＋收納盒
  g.add(boxMinMax(x0 + 0.03, x1 - 0.02, H, H + 0.14, z0 + 0.05, z0 + 0.4, M.paintCream, 'shelf:topBox', 0.01));
  addMerged(g, buckets, BOOK_MATS, 'shelf:books');
  return { group: g, x1, z1 };
}

// ═══════════════════════════════════════════════════════
// 書桌上方的左牆：軟木板＋層板
// ═══════════════════════════════════════════════════════
function buildDeskWall(I, rng, zA, zB) {
  const g = new THREE.Group();
  g.name = `${ROOM}:deskWall`;
  const wx = I.x0;
  // 軟木板（沒有軟木材質，用燕麥色布料代替）
  const by0 = 1.02, by1 = 1.58;
  g.add(boxMinMax(wx, wx + 0.025, by0 - 0.02, by1 + 0.02, zA - 0.02, zB + 0.02, M.woodOak, 'corkboard:frame'));
  g.add(boxMinMax(wx + 0.025, wx + 0.03, by0, by1, zA, zB, M.cork, 'corkboard'));
  const notes = [M.paperWhite, M.fabricBlush, M.paperWhite, M.paintCream, M.paperWhite, M.fabricBoucle, M.paperWhite];
  const cols = 4, rows = 2;
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng.chance(0.15)) continue;
      const w = rng.range(0.08, 0.16), h = rng.range(0.08, 0.17);
      const cz = zA + ((zB - zA) / cols) * (c + 0.5) + rng.jitter(0, 0.02);
      const cy = by0 + ((by1 - by0) / rows) * (r + 0.5) + rng.jitter(0, 0.02);
      const n = box(0.002, h, w, notes[k++ % notes.length], 'corkboard:note', wx + 0.031, cy, cz);
      n.rotation.x = rng.jitter(0, 0.12);
      g.add(n);
      g.add(cyl(0.006, 0.006, 0.008, M.metalBrass, 'corkboard:pin', wx + 0.034, cy + h / 2 - 0.015, cz, 8).rotateZ(Math.PI / 2));
    }
  }
  // 層板＋托架
  const sy = 1.78, sd = 0.2;
  g.add(boxMinMax(wx, wx + sd, sy, sy + 0.025, zA, zB, M.woodOak, 'wallShelf'));
  for (const bz of [zA + 0.08, zB - 0.08]) {
    g.add(boxMinMax(wx, wx + 0.15, sy - 0.12, sy, bz - 0.006, bz + 0.006, M.metalBlack, 'wallShelf:bracket'));
  }
  const buckets = BOOK_MATS.map(() => []);
  const e = bookRowZ(rng, buckets, { xBack: wx + 0.01, y: sy + 0.025, z0: zA + 0.03, z1: zA + (zB - zA) * 0.55, maxH: 0.24, minH: 0.17, depth: [0.13, 0.17] });
  addMerged(g, buckets, BOOK_MATS, 'wallShelf:books');
  // 書擋
  g.add(boxMinMax(wx + 0.03, wx + 0.15, sy + 0.025, sy + 0.17, e + 0.005, e + 0.012, M.metalBlack, 'wallShelf:bookend'));
  // 垂吊小植物（綠蘿）
  const px = wx + 0.1, pz = zB - 0.12;
  g.add(cyl(0.06, 0.045, 0.1, M.ceramicWhite, 'wallShelf:pot', px, sy + 0.075, pz, 18));
  g.add(cyl(0.055, 0.055, 0.004, M.soil, 'wallShelf:soil', px, sy + 0.118, pz, 18));
  const leaves = [];
  const leafGeo = () => new THREE.SphereGeometry(0.025, 6, 4).scale(1, 0.25, 0.8);
  for (let v = 0; v < 4; v++) {
    const a = rng.range(-0.5, 2.5);
    const len = rng.range(0.25, 0.55);
    for (let i = 0; i < 8; i++) {
      const tt = i / 7;
      const lg = leafGeo();
      lg.rotateY(rng.range(0, Math.PI * 2));
      lg.rotateX(rng.jitter(0.4, 0.3));
      const rr = 0.05 + tt * 0.05;
      lg.translate(px + Math.max(-0.08, Math.cos(a) * rr), sy + 0.12 - tt * len, pz + Math.sin(a) * rr);
      leaves.push(lg);
    }
  }
  g.add(mesh(mergeGeometries(leaves), M.leafGreen, 'wallShelf:pothos'));
  return g;
}

// ═══════════════════════════════════════════════════════
// 琴葉榕盆栽
// ═══════════════════════════════════════════════════════
function buildPlant(rng, cx, cz) {
  const g = new THREE.Group();
  g.name = `${ROOM}:plant`;
  const potH = 0.32;
  const potGeo = new THREE.LatheGeometry(
    [[0.001, 0], [0.12, 0], [0.135, 0.02], [0.16, potH - 0.02], [0.165, potH], [0.15, potH], [0.15, potH - 0.03], [0.001, potH - 0.03]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const pot = mesh(potGeo, M.ceramicMatte, 'plant:pot');
  pot.position.set(cx, 0.03, cz);
  g.add(pot);
  g.add(cyl(0.13, 0.11, 0.03, M.woodWalnut, 'plant:stand', cx, 0.015, cz, 24));
  g.add(cyl(0.15, 0.15, 0.005, M.soil, 'plant:soil', cx, 0.03 + potH - 0.035, cz, 24));

  const stems = [], leaves = [];
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.07, 0.03, 0.08, 0.2, 0.0, 0.26);
  leafShape.bezierCurveTo(-0.08, 0.2, -0.07, 0.03, 0, 0);
  const trunks = 3;
  const baseY = 0.03 + potH - 0.03;
  for (let t = 0; t < trunks; t++) {
    const a = (t / trunks) * Math.PI * 2 + rng.range(0, 1);
    const h = rng.range(0.85, 1.25);
    const lean = rng.range(0.03, 0.08);
    const tx = cx + Math.cos(a) * lean, tz = cz + Math.sin(a) * lean;
    const sg = new THREE.CylinderGeometry(0.008, 0.014, h, 7);
    const dx = tx - cx, dz = tz - cz;
    sg.translate(0, h / 2, 0);
    sg.rotateZ(-dx * 0.6);
    sg.rotateX(dz * 0.6);
    sg.translate(cx + Math.cos(a) * 0.02, baseY, cz + Math.sin(a) * 0.02);
    stems.push(sg);
    const nLeaves = rng.int(11, 14);
    for (let i = 0; i < nLeaves; i++) {
      const tt = 0.3 + (i / nLeaves) * 0.7;
      const lg = new THREE.ShapeGeometry(leafShape, 4);
      const s = rng.range(0.75, 1.15) * (0.75 + tt * 0.35);
      lg.scale(s, s, s);
      lg.rotateY(Math.PI / 2 + rng.jitter(0, 0.4));          // 葉面朝外
      lg.rotateZ(-rng.range(0.6, 1.2));                      // 往外傾
      lg.rotateY(rng.range(0, Math.PI * 2));                 // 方位
      lg.translate(cx + Math.cos(a) * (0.02 + lean * tt), baseY + h * tt, cz + Math.sin(a) * (0.02 + lean * tt));
      leaves.push(lg);
    }
  }
  g.add(mesh(mergeGeometries(stems), M.stem, 'plant:stems'));
  g.add(mesh(mergeGeometries(leaves), M.leafDark, 'plant:leaves'));
  return g;
}

// ═══════════════════════════════════════════════════════
// 地毯＋坐墩
// ═══════════════════════════════════════════════════════
function buildRug(x0, x1, z0, z1) {
  const g = new THREE.Group();
  g.name = `${ROOM}:rug`;
  g.add(boxMinMax(x0, x1, 0, 0.012, z0, z1, M.rugWool, 'rug', 0.005));
  const b = 0.07, s = 0.025;
  // 兩道細邊框（陶土色）
  for (const inset of [b, b + s + 0.02]) {
    const w = 0.014;
    g.add(boxMinMax(x0 + inset, x1 - inset, 0.012, 0.0135, z0 + inset, z0 + inset + w, M.rugPattern, 'rug:border'));
    g.add(boxMinMax(x0 + inset, x1 - inset, 0.012, 0.0135, z1 - inset - w, z1 - inset, M.rugPattern, 'rug:border'));
    g.add(boxMinMax(x0 + inset, x0 + inset + w, 0.012, 0.0135, z0 + inset, z1 - inset, M.rugPattern, 'rug:border'));
    g.add(boxMinMax(x1 - inset - w, x1 - inset, 0.012, 0.0135, z0 + inset, z1 - inset, M.rugPattern, 'rug:border'));
  }
  // 中央菱形圖樣
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const [dx, dz] of [[0, 0], [-0.22, 0], [0.22, 0], [0, -0.22], [0, 0.22]]) {
    const d = box(0.1, 0.0015, 0.1, M.rugPattern, 'rug:motif', cx + dx, 0.0125, cz + dz);
    d.rotation.y = Math.PI / 4;
    g.add(d);
  }
  return g;
}

// ═══════════════════════════════════════════════════════
// 床邊右牆：掛畫＋壁燈
// ═══════════════════════════════════════════════════════
function buildBedWall(I, bedZ0, sill) {
  const g = new THREE.Group();
  g.name = `${ROOM}:bedWall`;
  const wx = I.x1;
  // 掛畫：胡桃木框、白卡紙、幾何色塊（日落）
  const az0 = bedZ0 + 0.35, az1 = az0 + 0.55, ay0 = 1.12, ay1 = ay0 + 0.7;
  g.add(boxMinMax(wx - 0.03, wx, ay0, ay1, az0, az1, M.woodWalnut, 'art:frame'));
  g.add(boxMinMax(wx - 0.032, wx - 0.03, ay0 + 0.025, ay1 - 0.025, az0 + 0.025, az1 - 0.025, M.paperWhite, 'art:mat'));
  const midZ = (az0 + az1) / 2;
  const sun = mesh(new THREE.CircleGeometry(0.12, 32), M.fabricTerracotta, 'art:sun', { cast: false });
  sun.rotation.y = -Math.PI / 2;
  sun.position.set(wx - 0.0335, ay0 + 0.42, midZ);
  g.add(sun);
  g.add(boxMinMax(wx - 0.035, wx - 0.033, ay0 + 0.1, ay0 + 0.3, az0 + 0.08, az1 - 0.08, M.fabricTaupe, 'art:hill', 0));
  g.add(boxMinMax(wx - 0.036, wx - 0.034, ay0 + 0.1, ay0 + 0.18, az0 + 0.08, az1 - 0.08, M.fabricBoucle, 'art:field'));
  // 第二幅小畫
  const bz0 = az1 + 0.12, bz1 = bz0 + 0.3;
  g.add(boxMinMax(wx - 0.025, wx, ay0 + 0.22, ay0 + 0.62, bz0, bz1, M.woodOak, 'art2:frame'));
  g.add(boxMinMax(wx - 0.027, wx - 0.025, ay0 + 0.25, ay0 + 0.59, bz0 + 0.03, bz1 - 0.03, M.paintCream, 'art2:mat'));
  g.add(boxMinMax(wx - 0.029, wx - 0.027, ay0 + 0.32, ay0 + 0.52, bz0 + 0.07, bz1 - 0.07, M.paintCharcoal, 'art2:block'));

  // 床頭壁燈（右牆、靠床頭；高度高於床頭板，但遠離窗）
  const sz = I.z1 - 0.32, sy = Math.max(sill + 0.2, 1.1);
  g.add(cyl(0.045, 0.045, 0.015, M.metalBrass, 'sconce:plate', wx - 0.0075, sy, sz, 20).rotateZ(Math.PI / 2));
  const arm = cyl(0.006, 0.006, 0.18, M.metalBrass, 'sconce:arm', wx - 0.09, sy + 0.02, sz, 8);
  arm.rotation.z = Math.PI / 2 - 0.2;
  g.add(arm);
  g.add(cyl(0.05, 0.075, 0.12, M.lampShade, 'sconce:shade', wx - 0.18, sy + 0.04, sz, 24));
  const bulb = mesh(new THREE.SphereGeometry(0.022, 10, 8), M.lampBulb, 'sconce:bulb', { cast: false });
  bulb.position.set(wx - 0.18, sy + 0.0, sz);
  g.add(bulb);
  return { group: g, light: [wx - 0.18, sy - 0.02, sz] };
}

// ═══════════════════════════════════════════════════════
// 踢腳板（避開門的掃掠區）
// ═══════════════════════════════════════════════════════
function buildBaseboards(I, swing) {
  const g = new THREE.Group();
  g.name = `${ROOM}:baseboards`;
  const h = 0.08, t = 0.012;
  g.add(boxMinMax(I.x0, I.x0 + t, 0, h, I.z0, I.z1, M.baseboard, 'baseboard'));
  g.add(boxMinMax(I.x1 - t, I.x1, 0, h, I.z0, I.z1, M.baseboard, 'baseboard'));
  g.add(boxMinMax(I.x0, I.x1, 0, h, I.z1 - t, I.z1, M.baseboard, 'baseboard'));
  // 上牆：門洞與掃掠區之外
  const doorTo = swing ? swing.x1 : I.x0;
  g.add(boxMinMax(doorTo + 0.01, I.x1, 0, h, I.z0, I.z0 + t, M.baseboard, 'baseboard'));
  return g;
}

// ═══════════════════════════════════════════════════════
export function build() {
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;
  const rng = rngFor(ROOM);

  const I = L.roomInterior(ROOM);
  const swing = L.doorSwingZone(ROOM);
  const win = L.openingsOfRoom(ROOM).find((o) => o.category === 'window' && o.side === 'z1');
  const sill = win?.sill ?? L.WINDOW.sill;
  const swingZ1 = swing ? swing.z1 : I.z0;

  // 衣櫃（右上角）
  const wardrobe = buildWardrobe(I);
  root.add(wardrobe.group);

  // 床（右牆，床頭靠南）
  const bed = buildBed(I, rng, sill);
  root.add(bed.group);

  // 書桌（南窗下，左牆到床邊）
  const desk = buildDesk(I, rng, bed.x0 - 0.16, win);
  root.add(desk.group);

  // 椅子（桌前、略拉出、微轉）
  const chairX = (desk.x0 + desk.x1) / 2 - 0.02;
  root.add(buildChair(chairX, desk.z0 - 0.04, rng.jitter(0, 0.12)));

  // 書架（左牆，門掃掠區之後）
  const shelf = buildBookshelf(I, rng, swingZ1 + 0.08);
  root.add(shelf.group);

  // 軟木板＋層板（左牆，書桌上方）
  root.add(buildDeskWall(I, rng, shelf.z1 + 0.2, I.z1 - 0.1));

  // 地毯（書架與床之間）
  root.add(buildRug(shelf.x1 + 0.1, bed.x0 + 0.25, swingZ1 + 0.12, desk.z0 - 0.08));

  // 坐墩（地毯上、靠床邊）
  const poufX = bed.x0 - 0.3, poufZ = swingZ1 + 0.45;
  root.add(cyl(0.21, 0.22, 0.36, M.fabricBoucle, 'pouf', poufX, 0.18, poufZ, 28));
  root.add(cyl(0.2, 0.2, 0.004, M.fabricBoucle, 'pouf:top', poufX, 0.362, poufZ, 28));
  const poufBooks = new THREE.Group();
  root.add(poufBooks);
  bookStack(rng, poufBooks, poufX, 0.364, poufZ, 2, 'poufBooks', 0.6);

  // 盆栽（門掃掠區與衣櫃之間、靠上牆）
  const plantX = swing ? (swing.x1 + wardrobe.x0) / 2 - 0.1 : I.x0 + 0.5;
  root.add(buildPlant(rng, plantX, I.z0 + 0.3));

  // 床邊右牆
  const bedWall = buildBedWall(I, bed.z0, sill);
  root.add(bedWall.group);

  root.add(buildBaseboards(I, swing));

  // 燈光（2 盞、暖色、不開陰影）
  const deskLight = new THREE.PointLight(L.LIGHT_COLORS.k2700, 1.6, 3.2, 2);
  deskLight.name = `${ROOM}:light:deskLamp`;
  deskLight.position.set(...desk.lamp);
  deskLight.castShadow = false;
  root.add(deskLight);
  const sconceLight = new THREE.PointLight(L.LIGHT_COLORS.k2700, 1.0, 2.5, 2);
  sconceLight.name = `${ROOM}:light:sconce`;
  sconceLight.position.set(...bedWall.light);
  sconceLight.castShadow = false;
  root.add(sconceLight);

  return root;
}
