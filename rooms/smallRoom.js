/**
 * rooms/smallRoom.js — 小房（依實拍 p02 重現）
 *
 * 配置（全部由 layout.js 推出）：
 *   - 西牆窗下：木平台床，床頭朝北；西牆有一道與窗台同高的木背板
 *   - 南牆：一字型系統書桌（米白桌面、兩個抽屜）＋整排淺木紋吊櫃，櫃底 LED 燈條
 *   - 灰色殼型椅＋橡木腳
 *   - 東北角（陽台門與拉門之間）：淺橡木高櫃，含開放層格
 *   - 拉門 → 陽台門的通道留空
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import * as G from '../geo.js';

const ROOM = 'smallRoom';

// ── 尺寸（公尺） ──────────────────────────────────────
const BED = { w: 1.05, l: 2.0, baseH: 0.3, mattressH: 0.2, headH: 0.82 };
const DESK = { d: 0.45, h: 0.75, top: 0.035, endGap: 0.3 };
const UPPER = { d: 0.35, y0: 1.85 };
const TALL = { w: 0.55, d: 0.4, h: 2.3 };
const CHAIR = { seatH: 0.45 };
const BLIND_CLEAR = 0.17; // 西牆面到家具（高於窗台部分）的最小距離：百葉簾在牆面內 5cm

// ── 小工具 ────────────────────────────────────────────
function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
/** 方塊：一律倒角（預設 3mm）；極薄的片才用直角 */
function box(w, h, d, mat, name, x, y, z, r = 0) {
  const geo = Math.min(w, h, d) < 0.008
    ? G.worldUV(new THREE.BoxGeometry(w, h, d))
    : G.roundedBox(w, h, d, r > 0 ? r : 0.003, r > 0.02 ? 3 : 2);
  const m = mesh(geo, mat, name);
  m.position.set(x, y, z);
  return m;
}
function boxMinMax(x0, x1, y0, y1, z0, z1, mat, name, r = 0) {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, name, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
}
function cyl(rTop, rBot, h, mat, name, x, y, z, seg = 20) {
  const m = mesh(G.worldUV(new THREE.CylinderGeometry(rTop, rBot, h, seg)), mat, name);
  m.position.set(x, y, z);
  return m;
}
const lathe = (pts, seg, phiStart, phiLen) =>
  G.worldUV(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLen));
/** 圓柱座標 UV（公尺）：u 沿圓周、v 沿高度。曲面殼、斜放的車削件用，避免方盒投影的接縫與木紋轉向 */
function cylUV(geo, along = 'y') {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    uv[i * 2] = (Math.atan2(x, z) * Math.max(r, 0.01)) / G.UV_METERS;
    uv[i * 2 + 1] = y / G.UV_METERS;
    if (along === 'u') [uv[i * 2], uv[i * 2 + 1]] = [uv[i * 2 + 1], uv[i * 2]];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function place(geo, mat, name, x, y, z, rot = [0, 0, 0]) {
  const m = mesh(geo, mat, name);
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  return m;
}
/** 抱枕表面沿鼓面走的線條（與 geo.cushion 厚度分布一致）。face：+1 → +y 面、-1 → -y 面 */
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
function fringeGeo(x, y, z0, z1, len, rng, step = 0.018) {
  const list = [];
  for (let z = z0; z < z1; z += step) {
    const l = len + rng.range(-0.008, 0.008);
    list.push(G.tube([[x, y, z], [x + rng.range(-0.006, 0.006), y - l * 0.5, z + rng.range(-0.004, 0.004)], [x + rng.range(-0.01, 0.01), y - l, z]], 0.0025, { segments: 6, radial: 4 }));
  }
  return mergeGeometries(list);
}

// ═══════════════════════════════════════════════════════
// 平台床（西牆窗下、床頭朝北）
// ═══════════════════════════════════════════════════════
function buildBed(I, rng, win, len) {
  const g = new THREE.Group();
  g.name = `${ROOM}:bed`;
  const sill = win.sill;
  const x0 = I.x0, x1 = x0 + BED.w, z0 = I.z0, z1 = z0 + len;
  const headT = 0.04, backT = 0.05;
  // 床頭板（北牆）
  g.add(boxMinMax(x0, x1, 0, BED.headH, z0, z0 + headT, M.woodOak, 'bed:headboard', 0.006));
  // 西牆木背板：頂端與窗台齊平（照片中枕頭後的木條）
  g.add(boxMinMax(x0, x0 + backT, 0, sill - 0.005, z0 + headT, z1, M.woodOak, 'bed:backboard', 0.005));
  // 平台底座：退縮踢腳＋抽屜分割
  const bx0 = x0 + backT, bz0 = z0 + headT;
  g.add(boxMinMax(bx0 + 0.04, x1 - 0.04, 0, 0.06, bz0 + 0.02, z1 - 0.04, M.paintCream, 'bed:plinth'));
  g.add(boxMinMax(bx0, x1, 0.06, BED.baseH, bz0, z1, M.woodOak, 'bed:base', 0.006));
  // 東側兩個抽屜（細縫＋指扣）
  const dl = (z1 - bz0 - 0.1) / 2;
  for (let i = 0; i < 2; i++) {
    const a = bz0 + 0.05 + i * dl, b = a + dl;
    g.add(boxMinMax(x1, x1 + 0.002, 0.09, BED.baseH - 0.03, a, a + 0.004, M.woodOakDark, 'bed:drawerGap'));
    g.add(boxMinMax(x1, x1 + 0.002, 0.09, BED.baseH - 0.03, b - 0.004, b, M.woodOakDark, 'bed:drawerGap'));
    g.add(boxMinMax(x1, x1 + 0.002, BED.baseH - 0.05, BED.baseH - 0.035, (a + b) / 2 - 0.08, (a + b) / 2 + 0.08, M.woodOakDark, 'bed:drawerPull'));
  }
  // 床墊（白）＋灰色床包（drapeOver 包住床墊三邊，床頭側不垂）
  const mx0 = bx0 + 0.01, mx1 = x1 - 0.02, mY0 = BED.baseH, mY1 = mY0 + BED.mattressH;
  const mz0 = bz0 + 0.01, mz1 = z1 - 0.02;
  const mw = mx1 - mx0, ml = mz1 - mz0, cx = (mx0 + mx1) / 2, cz = (mz0 + mz1) / 2;
  g.add(place(G.mattress(mw, BED.mattressH, ml, { radius: 0.045, crown: 0.01 }), M.fabricWhite, 'bed:mattress', cx, mY0 + BED.mattressH / 2, cz));
  const top = mY1 + 0.008;
  g.add(place(G.drapeOver({
    w: mw - 0.04, d: ml - 0.04, thickness: 0.004, wrinkle: 0.006, edgeRadius: 0.045, flare: 0.01,
    overhang: { x0: 0.02, x1: 0.17, z0: 0.02, z1: 0.17 }, rng: rng.fork('sheet'),
  }), M.fabricBoucle, 'bed:sheet', cx, top + 0.004, cz));

  // 深灰針織毯：斜鋪床尾，往東側（走道）垂下，末端流蘇
  const tw = mw - 0.12, tl = 0.85, hang = 0.34;
  const throwG = new THREE.Group();
  throwG.name = `${ROOM}:bed:throwSet`;
  throwG.add(mesh(G.drapeOver({
    w: tw, d: tl, thickness: 0.012, wrinkle: 0.016, edgeRadius: 0.045,
    overhang: { x0: 0, x1: hang, z0: 0, z1: 0 }, rng: rng.fork('throw'),
  }), M.fabricGreyThrow, 'bed:throw'));
  const arc = (Math.PI / 2) * 0.045, down = hang - arc;
  const fx = tw / 2 + 0.045 + (down * 0.04) / Math.max(0.2, down + 0.2) + 0.003;
  throwG.add(mesh(fringeGeo(fx, -0.045 - down + 0.004, -tl / 2 + 0.01, tl / 2 - 0.01, 0.07, rng.fork('fringe')), M.fabricGreyThrow, 'bed:throwFringe'));
  throwG.position.set(cx + 0.06, top + 0.022, mz1 - 0.1 - tl / 2);
  throwG.rotation.y = -0.07;
  g.add(throwG);

  // 枕頭＋四個抱枕：後排靠床頭板（黑白圖騰、粉），前排斜靠在後排上（格紋、灰）
  // 高於窗台的部分要離西牆 BLIND_CLEAR 以上
  const safeX0 = I.x0 + BLIND_CLEAR;
  const at = (x, w) => Math.max(x, safeX0 + w / 2 + 0.03);
  const lean = (a) => -Math.PI / 2 - a; // 往床頭（-z）後仰 a；-y 面朝房內
  g.add(place(G.cushion(0.62, 0.15, 0.4, { seam: 0.22, wrinkle: 0.004, rng: rng.fork('pillow') }), M.fabricWhite, 'bed:pillow', at(cx, 0.62), top + 0.065, mz0 + 0.24, [-0.1, 0, 0]));

  const cw = 0.42, ch = 0.13, seam = 0.18;
  const pattern = new THREE.Group();
  pattern.name = `${ROOM}:bed:cushionPattern`;
  pattern.add(mesh(G.cushion(cw, ch, cw, { seam, wrinkle: 0.005, rng: rng.fork('pattern') }), M.fabricWhite, 'bed:cushionPattern:base'));
  pattern.add(mesh(cushionLines(cw, ch, cw, seam, [
    [[-0.75, -0.55], [-0.35, -0.2], [0.05, -0.15], [0.45, -0.5]],
    [[-0.6, 0.15], [-0.2, 0.35], [0.25, 0.2], [0.7, 0.4]],
    [[0.1, 0.5], [0.3, 0.7], [0.55, 0.75]],
  ], -1, 0.009), M.fabricCharcoal, 'bed:cushionPattern:strokes'));
  pattern.position.set(at(mx0 + 0.25, cw), top + 0.24, mz0 + 0.1);
  pattern.rotation.set(lean(0.28), rng.jitter(0.08, 0.04), rng.jitter(0, 0.05));
  g.add(pattern);
  g.add(place(G.cushion(0.4, 0.13, 0.4, { seam, wrinkle: 0.005, rng: rng.fork('pink') }), M.fabricBlush, 'bed:cushionPink',
    at(mx1 - 0.23, 0.4), top + 0.23, mz0 + 0.11, [lean(0.3), rng.jitter(-0.1, 0.04), rng.jitter(0, 0.05)]));

  const plaid = new THREE.Group();
  plaid.name = `${ROOM}:bed:cushionPlaid`;
  const pw = 0.38, ph = 0.12;
  plaid.add(mesh(G.cushion(pw, ph, pw, { seam, wrinkle: 0.004, rng: rng.fork('plaid') }), M.fabricWhite, 'bed:cushionPlaid:base'));
  const ks = [-0.55, -0.2, 0.2, 0.55];
  plaid.add(mesh(cushionLines(pw, ph, pw, seam, [...ks.map((k) => lineAlong(k, 'z')), ...ks.map((k) => lineAlong(k, 'x'))], -1), M.fabricCharcoal, 'bed:cushionPlaid:lines'));
  plaid.position.set(at(mx0 + 0.27, pw), top + 0.2, mz0 + 0.3);
  plaid.rotation.set(lean(0.5), 0.18, -0.06);
  g.add(plaid);
  g.add(place(G.cushion(0.36, 0.12, 0.36, { seam, wrinkle: 0.005, rng: rng.fork('grey') }), M.fabricLinen, 'bed:cushionGrey',
    at(mx1 - 0.22, 0.36), top + 0.19, mz0 + 0.33, [lean(0.55), -0.22, 0.08]));
  return { group: g, x1, z1 };
}

// ═══════════════════════════════════════════════════════
// 一字型書桌＋吊櫃（南牆）
// ═══════════════════════════════════════════════════════
function buildDeskWall(I, rng, deskX1, upperX1) {
  const g = new THREE.Group();
  g.name = `${ROOM}:desk`;
  const x0 = I.x0, x1 = deskX1, z1 = I.z1, z0 = z1 - DESK.d, top = DESK.h;
  g.add(boxMinMax(x0, x1, top - DESK.top, top, z0, z1, M.paintCream, 'desk:top', 0.004));
  // 東端側板落地；西端掛牆（藏在床尾後方的立板）
  g.add(boxMinMax(x1 - 0.03, x1, 0, top - DESK.top, z0 + 0.01, z1, M.paintCream, 'desk:endPanel'));
  g.add(boxMinMax(x0, x0 + 0.03, 0, top - DESK.top, z0 + 0.04, z1, M.paintCream, 'desk:wallPanel'));
  // 兩個抽屜（靠東側，無把手，只有分割縫）
  const dW = 0.5, dH = 0.15, dy1 = top - DESK.top, dy0 = dy1 - dH;
  const dx1 = x1 - 0.03, dx0 = dx1 - dW * 2;
  g.add(boxMinMax(dx0, dx1, dy0, dy1, z0 + 0.02, z1, M.paintCream, 'desk:drawerBox'));
  for (let i = 0; i < 2; i++) {
    const a = dx0 + i * dW + 0.003, b = a + dW - 0.006;
    g.add(boxMinMax(a, b, dy0 + 0.004, dy1 - 0.004, z0, z0 + 0.02, M.paintCream, `desk:drawer${i}`, 0.003));
    g.add(boxMinMax(a + 0.12, b - 0.12, dy0 + 0.004, dy0 + 0.012, z0 - 0.002, z0 + 0.004, M.woodOak, `desk:drawerPull${i}`));
  }
  // 吊櫃：整排淺木紋，櫃門無把手（推彈）
  const ux0 = I.x0, ux1 = upperX1, uz0 = z1 - UPPER.d, uy0 = UPPER.y0, uy1 = L.CEILING_HEIGHT - 0.005;
  g.add(boxMinMax(ux0, ux1, uy0, uy1, uz0 + 0.02, z1, M.paintWhite, 'upper:carcass'));
  const nDoors = Math.max(2, Math.round((ux1 - ux0) / 0.45));
  const dw = (ux1 - ux0) / nDoors;
  for (let i = 0; i < nDoors; i++) {
    const a = ux0 + i * dw + 0.0035, b = a + dw - 0.007;
    g.add(boxMinMax(a, b, uy0, uy1 - 0.002, uz0, uz0 + 0.02, M.woodAsh, `upper:door${i}`, 0.002));
    // 木紋：幾條直向細線
    for (let k = 0; k < 3; k++) {
      const gx = a + rng.range(0.05, dw - 0.05);
      g.add(boxMinMax(gx, gx + 0.003, uy0 + 0.05, uy1 - 0.05, uz0 - 0.001, uz0, M.woodOak, `upper:grain${i}`));
    }
  }
  for (let i = 1; i < nDoors; i++) {
    const gx = ux0 + i * dw;
    g.add(boxMinMax(gx - 0.004, gx + 0.004, uy0 + 0.004, uy1 - 0.006, uz0 + 0.02, uz0 + 0.024, M.woodOakDark, 'upper:gapShadow'));
  }
  // 櫃底 LED 燈條（靠前緣）
  g.add(boxMinMax(ux0 + 0.02, ux1 - 0.02, uy0 - 0.008, uy0, uz0 + 0.03, uz0 + 0.045, M.ledStrip, 'upper:led'));

  // ── 桌上物件 ──
  // 打開的書／雜誌（中段）
  const bk = new THREE.Group();
  bk.name = `${ROOM}:openBook`;
  bk.add(box(0.42, 0.004, 0.28, M.fabricOat, 'openBook:cover', 0, 0.002, 0));
  for (const s of [-1, 1]) {
    const page = box(0.2, 0.01, 0.27, M.paperWhite, 'openBook:page', s * 0.102, 0.009, 0);
    page.rotation.z = -s * 0.05;
    bk.add(page);
    const ill = box(0.08, 0.001, 0.06, M.leafOlive, 'openBook:illustration', s * 0.11, 0.0155, rng.jitter(0, 0.03));
    ill.rotation.z = -s * 0.05;
    bk.add(ill);
    for (let k = 0; k < 4; k++) bk.add(box(0.15, 0.001, 0.006, M.paintCharcoal, 'openBook:text', s * 0.1, 0.0155, 0.07 + k * 0.018));
  }
  bk.position.set(dx0 - 0.1, top, z0 + 0.2);
  bk.rotation.y = rng.jitter(-0.18, 0.05);
  g.add(bk);
  // 木頭圓錐擺飾（靠牆）
  const cones = [[0.035, 0.12, M.woodOak], [0.03, 0.17, M.woodOakDark]];
  cones.forEach(([r, h, mat], i) => {
    const cx = x0 + 0.62 + i * 0.09, cz = z1 - 0.08;
    g.add(cyl(r * 0.9, r * 0.9, 0.012, M.ceramicMatte, 'ornament:base', cx, top + 0.006, cz, 16));
    const c = place(G.lathe([[0, 0], [r, 0], [r * 0.98, 0.004], [r * 0.5, h * 0.55], [0.003, h - 0.002], [0, h]], 40), mat, 'ornament:cone', cx, top + 0.012, cz);
    g.add(c);
  });
  // 書堆（西端）
  let yy = top;
  for (let i = 0; i < 3; i++) {
    const w = rng.range(0.16, 0.22), d = rng.range(0.22, 0.27), t = rng.range(0.015, 0.03);
    const b = new THREE.Group();
    b.add(box(w, t, d, [M.bookColors[4], M.paperWhite, M.bookColors[6]][i], 'books:cover', 0, t / 2, 0));
    b.add(box(w - 0.006, t - 0.006, d - 0.012, M.paperWhite, 'books:pages', 0.004, t / 2, 0));
    b.position.set(x0 + 0.25, yy, z1 - 0.2);
    b.rotation.y = rng.jitter(0.1, 0.12);
    g.add(b);
    yy += t;
  }
  // 綠植（東端，霧面陶瓶插枝葉）
  const px = x1 - 0.14, pz = z1 - 0.12;
  g.add(mesh(G.lathe([[0, 0], [0.045, 0], [0.052, 0.006], [0.062, 0.05], [0.052, 0.12], [0.03, 0.16], [0.033, 0.176], [0.03, 0.18], [0.024, 0.176], [0.02, 0.16], [0, 0.155]], 48), M.ceramicMatte, 'plant:vase'));
  g.children[g.children.length - 1].position.set(px, top, pz);
  const stems = [], leaves = [];
  for (let s = 0; s < 6; s++) {
    const a = rng.range(0, Math.PI * 2), tilt = rng.range(0.15, 0.5), h = rng.range(0.22, 0.36);
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const base = new THREE.Vector3(px, top + 0.16, pz);
    const sg = new THREE.CylinderGeometry(0.0025, 0.003, h, 5);
    sg.translate(0, h / 2, 0);
    sg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    sg.translate(base.x, base.y, base.z);
    stems.push(sg);
    for (let k = 0; k < 7; k++) {
      const p = base.clone().addScaledVector(dir, h * (0.3 + 0.7 * (k / 6)));
      const lg = new THREE.SphereGeometry(0.022, 7, 5).scale(1, 0.18, 0.75);
      lg.rotateZ(rng.jitter(0, 0.6));
      lg.rotateY(rng.range(0, Math.PI * 2));
      lg.translate(p.x + rng.jitter(0, 0.015), p.y, p.z + rng.jitter(0, 0.015));
      leaves.push(lg);
    }
  }
  g.add(mesh(mergeGeometries(stems), M.stem, 'plant:stems'));
  g.add(mesh(mergeGeometries(leaves), M.leafGreen, 'plant:leaves'));
  // 桌下電源插座（牆面小方塊，照片中的白色插座）
  g.add(boxMinMax(x0 + 0.85, x0 + 0.93, top + 0.18, top + 0.24, z1 - 0.008, z1, M.plasticWhite, 'outlet'));
  return { group: g, x0, x1, z0, z1, dx0, dx1, uy0, uz0, ux0, ux1 };
}

// ═══════════════════════════════════════════════════════
// 殼型椅（灰色殼＋橡木腳），面向 +z（書桌）
// ═══════════════════════════════════════════════════════
function buildChair(cx, cz, rotY, rng) {
  const g = new THREE.Group();
  g.name = `${ROOM}:chair`;
  const y = CHAIR.seatH;
  // 椅殼：有厚度的封閉輪廓車削（外壁→圓唇→內壁），開口朝 +z，兩端封面
  const phiStart = 0.3 * Math.PI, phiLen = 1.4 * Math.PI;
  const loop = [[0.2, 0], [0.222, 0.06], [0.24, 0.15], [0.252, 0.25], [0.258, 0.29], [0.255, 0.305], [0.247, 0.306], [0.243, 0.29],
    [0.238, 0.25], [0.226, 0.15], [0.209, 0.06], [0.19, 0.014], [0.2, 0]];
  const shell = new THREE.LatheGeometry(loop.map(([r, yy]) => new THREE.Vector2(r, yy)), 40, phiStart, phiLen);
  const capShape = new THREE.Shape(loop.slice(0, -1).map(([r, yy]) => new THREE.Vector2(r, yy)));
  const caps = [];
  for (const phi of [phiStart, phiStart + phiLen]) {
    for (const flip of [false, true]) {
      const c = new THREE.ShapeGeometry(capShape);
      if (flip) { const ix = c.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; }
      c.rotateY(phi - Math.PI / 2);
      caps.push(c);
    }
  }
  const shellGeo = mergeGeometries([shell, ...caps]);
  shellGeo.computeVertexNormals();
  g.add(place(cylUV(shellGeo), M.fabricGreyThrow, 'chair:shell', 0, y - 0.005, -0.01, [-0.07, 0, 0]));
  // 座面：橢圓、厚倒角像軟墊
  g.add(place(G.extrudeRounded(G.ellipseShape(0.42, 0.41), 0.04, 0.012), M.fabricGreyThrow, 'chair:seat', 0, y - 0.015, 0.01));
  // 座下連接座＋四支外斜橡木腳（tube）
  g.add(place(G.lathe([[0, 0], [0.07, 0], [0.075, 0.01], [0.06, 0.03], [0, 0.03]], 32), M.woodOak, 'chair:hub', 0, y - 0.045, 0));
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const c = Math.cos(a), s = Math.sin(a);
    // 錐形車削腳，往外斜（頂端在連接座下、底端外張）
    const spread = 0.16, tilt = Math.atan2(spread, y - 0.04);
    const lh = (y - 0.04) / Math.cos(tilt) - 0.004;
    const lg = G.lathe([[0, 0], [0.011, 0], [0.014, lh * 0.5], [0.016, lh], [0, lh]], 16);
    cylUV(lg, 'u'); // 木紋沿腳長方向
    lg.rotateX(Math.PI); // 頂端朝下 → 以連接座為原點往下長
    lg.rotateZ(c * tilt); lg.rotateX(-s * tilt);
    lg.translate(c * 0.06, y - 0.04, s * 0.06);
    legs.push(lg);
  }
  g.add(mesh(mergeGeometries(legs), M.woodOak, 'chair:legs'));
  // 椅上的米白毛圈抱枕（斜靠椅背）
  g.add(place(G.cushion(0.34, 0.11, 0.32, { seam: 0.2, wrinkle: 0.005, rng: rng.fork('chairCushion') }), M.fabricBoucle, 'chair:cushion', 0.02, y + 0.2, -0.12, [-Math.PI / 2 - 0.25, 0.1, 0.05]));
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;
  return g;
}

// ═══════════════════════════════════════════════════════
// 東北角高櫃（淺橡木，下門板、中段開放層格、上門板），面向 +z
// ═══════════════════════════════════════════════════════
/** 北牆衣櫃：頂天、兩扇淺橡木門（長條把手）、退縮踢腳，面向 +z */
function buildWardrobe(I, x0, x1, z1) {
  const g = new THREE.Group();
  g.name = `${ROOM}:wardrobe`;
  const z0 = I.z0, H = L.CEILING_HEIGHT - 0.005, t = 0.018, kick = 0.07;
  g.add(boxMinMax(x0 + 0.02, x1 - 0.02, 0, kick, z0, z1 - 0.04, M.paintCream, 'wardrobe:kick'));
  g.add(boxMinMax(x0, x1, kick, H, z0, z1 - 0.02, M.woodOakDark, 'wardrobe:carcass'));
  const n = Math.max(2, Math.round((x1 - x0) / 0.45));
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w + 0.0035, b = x0 + (i + 1) * w - 0.0035;
    g.add(boxMinMax(a, b, kick + 0.004, H - 0.004, z1 - 0.02, z1, M.woodOak, `wardrobe:door${i}`, 0.002));
    const hx = i % 2 === 0 ? b - 0.035 : a + 0.035;
    g.add(place(G.roundedBox(0.012, 0.4, 0.014, 0.004), M.woodOakDark, `wardrobe:pull${i}`, hx, 1.05, z1 + 0.007));
  }
  void t;
  return g;
}

function buildTallCabinet(I, rng, x0, z1) {
  const g = new THREE.Group();
  g.name = `${ROOM}:tallCabinet`;
  const x1 = I.x1, z0 = I.z0, H = TALL.h, t = 0.018;
  g.add(boxMinMax(x0, x0 + t, 0, H, z0, z1, M.woodOak, 'tall:side'));
  g.add(boxMinMax(x1 - t, x1, 0, H, z0, z1, M.woodOak, 'tall:side'));
  g.add(boxMinMax(x0, x1, H - t, H, z0, z1, M.woodOak, 'tall:top'));
  g.add(boxMinMax(x0 + t, x1 - t, 0, 0.06, z0, z1 - 0.03, M.paintCream, 'tall:kick'));
  g.add(boxMinMax(x0 + t, x1 - t, 0.06, H - t, z0, z0 + 0.01, M.woodOak, 'tall:back'));
  const lowTop = 0.85, upBot = 1.95;
  // 下門板
  g.add(boxMinMax(x0 + 0.002, x1 - 0.002, 0.062, lowTop, z1 - 0.018, z1, M.woodOak, 'tall:doorLow', 0.002));
  g.add(boxMinMax(x1 - 0.06, x1 - 0.045, lowTop - 0.2, lowTop - 0.04, z1, z1 + 0.003, M.woodOakDark, 'tall:pullLow'));
  // 上門板
  g.add(boxMinMax(x0 + 0.002, x1 - 0.002, upBot, H - t - 0.002, z1 - 0.018, z1, M.woodOak, 'tall:doorUp', 0.002));
  g.add(boxMinMax(x1 - 0.06, x1 - 0.045, upBot + 0.04, upBot + 0.2, z1, z1 + 0.003, M.woodOakDark, 'tall:pullUp'));
  // 開放層格
  const shelves = [lowTop, lowTop + 0.37, lowTop + 0.73, upBot - t];
  for (const sy of shelves) g.add(boxMinMax(x0 + t, x1 - t, sy, sy + t, z0 + 0.01, z1 - 0.018, M.woodOak, 'tall:shelf'));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 - 0.01;
  // 層 1：藤編收納籃
  g.add(boxMinMax(x0 + 0.05, x1 - 0.05, shelves[0] + t, shelves[0] + t + 0.22, z0 + 0.04, z1 - 0.05, M.rattan, 'tall:basket', 0.02));
  // 層 2：霧面陶瓶＋幾本直立書
  const vase = mesh(lathe([[0.001, 0], [0.045, 0.002], [0.06, 0.08], [0.04, 0.16], [0.022, 0.2], [0.025, 0.22], [0.019, 0.22]], 20), M.ceramicMatte, 'tall:vase');
  vase.position.set(x0 + 0.13, shelves[1] + t, cz);
  g.add(vase);
  let bx = x1 - t - 0.01;
  for (let i = 0; i < 6; i++) {
    const th = rng.range(0.02, 0.035), h = rng.range(0.2, 0.27), d = rng.range(0.17, 0.22);
    bx -= th;
    g.add(box(th, h, d, [M.bookColors[4], M.paperWhite, M.bookColors[6], M.paintCream][i % 4], 'tall:book', bx + th / 2, shelves[1] + t + h / 2, z0 + 0.02 + d / 2));
    bx -= 0.001;
  }
  // 層 3：小盆栽＋相框
  g.add(cyl(0.055, 0.045, 0.1, M.ceramicWhite, 'tall:pot', cx + 0.1, shelves[2] + t + 0.05, cz, 16));
  const leaves = [];
  for (let i = 0; i < 14; i++) {
    const lg = new THREE.SphereGeometry(0.03, 7, 5).scale(1, 0.2, 0.6);
    lg.rotateZ(rng.range(-0.8, 0.8));
    lg.rotateY(rng.range(0, Math.PI * 2));
    lg.translate(cx + 0.1 + rng.jitter(0, 0.05), shelves[2] + t + rng.range(0.12, 0.22), cz + rng.jitter(0, 0.05));
    leaves.push(lg);
  }
  g.add(mesh(mergeGeometries(leaves), M.leafGreen, 'tall:plantLeaves'));
  const fr = new THREE.Group();
  fr.name = `${ROOM}:tall:photo`;
  fr.add(boxMinMax(-0.07, 0.07, 0, 0.18, -0.01, 0.01, M.woodOak, 'tall:photoFrame'));
  fr.add(boxMinMax(-0.05, 0.05, 0.025, 0.155, 0.01, 0.012, M.paintCharcoal, 'tall:photoArt'));
  fr.position.set(x0 + 0.13, shelves[2] + t, z0 + 0.08);
  fr.rotation.x = -0.08;
  g.add(fr);
  return g;
}

// ═══════════════════════════════════════════════════════
export function build() {
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;
  const rng = rngFor(ROOM);

  const I = L.roomInterior(ROOM);
  const ops = L.openingsOfRoom(ROOM);
  const win = ops.find((o) => o.category === 'window' && o.side === 'x0');
  const winSill = win?.sill ?? L.WINDOW.sill;
  const slide = ops.find((o) => o.category === 'door' && o.side === 'x1');
  const balcony = ops.find((o) => o.category === 'door' && o.side === 'z0');

  // 書桌／吊櫃：沿南牆，東端在拉門前留出通道
  const deskX1 = I.x1 - DESK.endGap;
  const upperX1 = I.x1 - 0.14;
  const desk = buildDeskWall(I, rng, deskX1, upperX1);
  root.add(desk.group);

  // 床：西牆窗下、床頭朝北，床尾留 6cm 到書桌；床寬不碰陽台門通道
  const bedLen = Math.min(BED.l, desk.z0 - 0.06 - I.z0);
  const bed = buildBed(I, rng, { ...win, sill: winSill }, bedLen);
  if (balcony && bed.x1 > balcony.from - 0.15) console.warn('smallRoom: 床太寬，侵入陽台門通道');
  root.add(bed.group);

  // 殼型椅：在抽屜段的桌前（抽屜很薄，膝蓋可進桌下），略拉出、微轉
  const chairX = (desk.dx0 + desk.dx1) / 2 - 0.12;
  root.add(buildChair(chairX, desk.z0 - 0.2, rng.jitter(0.2, 0.08), rng));

  // 東北角高櫃：陽台門東側到東牆，深度不超過拉門起點
  const tallX0 = Math.max(balcony ? balcony.to + 0.04 : I.x1 - TALL.w, I.x1 - TALL.w);
  const tallZ1 = Math.min(I.z0 + TALL.d, slide ? slide.from : I.z0 + TALL.d);
  root.add(buildTallCabinet(I, rng, tallX0, tallZ1));

  // 北牆已無陽台門：床頭到高櫃之間加一座頂天衣櫃（兩扇門），與高櫃同深
  if (!balcony) {
    const wx0 = bed.x1 + 0.08, wx1 = tallX0 - 0.004;
    if (wx1 - wx0 > 0.5) root.add(buildWardrobe(I, wx0, wx1, tallZ1));
  }

  // 踢腳板（避開陽台門與拉門）
  const bb = new THREE.Group();
  bb.name = `${ROOM}:baseboards`;
  const bh = 0.08, bt = 0.012;
  bb.add(boxMinMax(desk.x1, I.x1, 0, bh, I.z1 - bt, I.z1, M.baseboard, 'baseboard'));
  if (slide) bb.add(boxMinMax(I.x1 - bt, I.x1, 0, bh, slide.to + 0.01, I.z1, M.baseboard, 'baseboard'));
  if (balcony) bb.add(boxMinMax(bed.x1, balcony.from - 0.01, 0, bh, I.z0, I.z0 + bt, M.baseboard, 'baseboard'));
  root.add(bb);

  // 吊櫃底 LED 照明（2 盞暖光，不開陰影）
  for (const [i, f] of [[0, 0.3], [1, 0.72]]) {
    const pl = new THREE.PointLight(L.LIGHT_COLORS.k3000, 1.3, 2.4, 2);
    pl.name = `${ROOM}:light:underCabinet${i}`;
    pl.position.set(desk.ux0 + (desk.ux1 - desk.ux0) * f, desk.uy0 - 0.05, desk.uz0 + 0.08);
    pl.castShadow = false;
    root.add(pl);
  }
  return root;
}
