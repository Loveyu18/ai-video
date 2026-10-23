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
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';

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
function box(w, h, d, mat, name, x, y, z, r = 0) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999) : new THREE.BoxGeometry(w, h, d);
  const m = mesh(geo, mat, name);
  m.position.set(x, y, z);
  return m;
}
function boxMinMax(x0, x1, y0, y1, z0, z1, mat, name, r = 0) {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, name, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, r);
}
function cyl(rTop, rBot, h, mat, name, x, y, z, seg = 20) {
  const m = mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, name);
  m.position.set(x, y, z);
  return m;
}
const lathe = (pts, seg, phiStart, phiLen) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLen);

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
  // 床墊＋灰色床包
  const mx0 = bx0 + 0.01, mx1 = x1 - 0.02, mY0 = BED.baseH, mY1 = mY0 + BED.mattressH;
  g.add(boxMinMax(mx0, mx1, mY0, mY1, bz0 + 0.01, z1 - 0.02, M.fabricBoucle, 'bed:mattress', 0.045));
  const cx = (mx0 + mx1) / 2;

  // 深灰針織毯：鋪在床下半段，往東側（房內）垂下，末端流蘇
  const tz0 = z1 - 1.0, tz1 = z1 - 0.12;
  g.add(boxMinMax(mx0 + 0.05, mx1 + 0.01, mY1 - 0.005, mY1 + 0.02, tz0, tz1, M.fabricGreyThrow, 'bed:throw', 0.01));
  g.add(boxMinMax(mx1 + 0.005, mx1 + 0.03, mY1 - 0.32, mY1 + 0.015, tz0, tz1, M.fabricGreyThrow, 'bed:throwDrape', 0.01));
  const fringe = [];
  for (let fz = tz0 + 0.012; fz < tz1 - 0.008; fz += 0.02) {
    const fg = new THREE.BoxGeometry(0.008, 0.07 + rng.range(-0.01, 0.01), 0.008);
    fg.translate(mx1 + 0.018, mY1 - 0.32 - 0.035, fz);
    fringe.push(fg);
  }
  g.add(mesh(mergeGeometries(fringe), M.fabricGreyThrow, 'bed:throwFringe'));

  // 枕頭（白）＋四個抱枕：黑白圖騰、粉色、格紋、灰色
  // 高於窗台的部分要離西牆 BLIND_CLEAR 以上
  const safeX0 = I.x0 + BLIND_CLEAR;
  const pillow = box(0.66, 0.13, 0.4, M.fabricWhite, 'bed:pillow', Math.max(cx, safeX0 + 0.34), mY1 + 0.05, bz0 + 0.25, 0.06);
  pillow.rotation.x = -0.1;
  g.add(pillow);

  const cushion = (name, mat, size, x, z, rot) => {
    const c = new THREE.Group();
    c.name = `${ROOM}:bed:${name}`;
    c.add(box(size, size, 0.12, mat, `bed:${name}`, 0, 0, 0, 0.05));
    c.position.set(Math.max(x, safeX0 + size / 2 + 0.02), mY1 + 0.08 + size / 2, z);
    c.rotation.set(...rot);
    return c;
  };
  // 後排靠床頭板
  const pattern = cushion('cushionPattern', M.fabricWhite, 0.42, mx0 + 0.27, bz0 + 0.14, [0.3, rng.jitter(0, 0.08), rng.jitter(0, 0.06)]);
  for (const [a, b, rz] of [[-0.12, 0.05, 0.6], [0.05, -0.08, -0.4], [0.1, 0.12, 1.1]]) {
    pattern.add(box(0.2, 0.035, 0.004, M.fabricCharcoal, 'bed:cushionPattern:stroke', a, b, 0.062).rotateZ(rz));
  }
  pattern.add(box(0.07, 0.07, 0.004, M.fabricCharcoal, 'bed:cushionPattern:dot', -0.05, -0.12, 0.062).rotateZ(0.5));
  g.add(pattern);
  g.add(cushion('cushionPink', M.fabricBlush, 0.4, mx1 - 0.25, bz0 + 0.16, [0.28, rng.jitter(-0.1, 0.05), rng.jitter(0, 0.06)]));
  // 前排
  const plaid = cushion('cushionPlaid', M.fabricWhite, 0.38, mx0 + 0.3, bz0 + 0.36, [0.4, 0.15, -0.08]);
  for (const k of [-0.11, -0.04, 0.04, 0.11]) {
    plaid.add(box(0.006, 0.3, 0.004, M.fabricCharcoal, 'bed:cushionPlaid:lineV', k, 0, 0.062));
    plaid.add(box(0.3, 0.006, 0.004, M.fabricCharcoal, 'bed:cushionPlaid:lineH', 0, k, 0.062));
  }
  g.add(plaid);
  g.add(cushion('cushionGrey', M.fabricLinen, 0.36, mx1 - 0.22, bz0 + 0.4, [0.45, -0.2, 0.06]));
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
    const a = ux0 + i * dw + 0.002, b = a + dw - 0.004;
    g.add(boxMinMax(a, b, uy0, uy1 - 0.002, uz0, uz0 + 0.02, M.woodAsh, `upper:door${i}`, 0.002));
    // 木紋：幾條直向細線
    for (let k = 0; k < 3; k++) {
      const gx = a + rng.range(0.05, dw - 0.05);
      g.add(boxMinMax(gx, gx + 0.003, uy0 + 0.05, uy1 - 0.05, uz0 - 0.001, uz0, M.woodOak, `upper:grain${i}`));
    }
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
    const c = mesh(new THREE.ConeGeometry(r, h, 20), mat, 'ornament:cone');
    c.position.set(cx, top + 0.012 + h / 2, cz);
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
  g.add(mesh(lathe([[0.001, 0], [0.05, 0.002], [0.06, 0.05], [0.05, 0.12], [0.03, 0.16], [0.032, 0.18], [0.026, 0.18]], 20), M.ceramicMatte, 'plant:vase'));
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
function buildChair(cx, cz, rotY) {
  const g = new THREE.Group();
  g.name = `${ROOM}:chair`;
  const y = CHAIR.seatH;
  const phiStart = 0.33 * Math.PI, phiLen = 1.34 * Math.PI; // 開口朝 +z
  const outer = [[0.2, 0], [0.23, 0.07], [0.25, 0.18], [0.265, 0.3]];
  const inner = outer.map(([r, yy]) => [r - 0.012, yy]).reverse(); // 反向 → 法向朝內
  const shellO = mesh(lathe(outer, 28, phiStart, phiLen), M.fabricGreyThrow, 'chair:shellOuter');
  const shellI = mesh(lathe(inner, 28, phiStart, phiLen), M.fabricGreyThrow, 'chair:shellInner');
  // 殼的前緣兩側略低：用 y 方向縮放做不出來，改成整體後仰一點
  for (const s of [shellO, shellI]) { s.position.y = y; s.rotation.x = -0.06; g.add(s); }
  // 座面
  g.add(cyl(0.215, 0.205, 0.035, M.fabricGreyThrow, 'chair:seat', 0, y + 0.0, 0.015, 32));
  g.add(cyl(0.2, 0.2, 0.012, M.fabricGreyThrow, 'chair:seatPad', 0, y + 0.022, 0.02, 32));
  // 橡木腳（外斜）＋座下連接件
  g.add(cyl(0.05, 0.06, 0.03, M.woodOak, 'chair:hub', 0, y - 0.03, 0, 16));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const leg = cyl(0.016, 0.012, y - 0.05, M.woodOak, 'chair:leg', Math.cos(a) * 0.15, (y - 0.04) / 2 + 0.006, Math.sin(a) * 0.15, 12);
    leg.rotation.set(Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16);
    g.add(leg);
  }
  // 椅上的米白毛圈抱枕
  const cush = box(0.34, 0.32, 0.1, M.fabricBoucle, 'chair:cushion', 0.02, y + 0.2, -0.13, 0.045);
  cush.rotation.set(-0.25, 0.1, 0.05);
  g.add(cush);
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;
  return g;
}

// ═══════════════════════════════════════════════════════
// 東北角高櫃（淺橡木，下門板、中段開放層格、上門板），面向 +z
// ═══════════════════════════════════════════════════════
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
  root.add(buildChair(chairX, desk.z0 - 0.2, rng.jitter(0.2, 0.08)));

  // 東北角高櫃：陽台門東側到東牆，深度不超過拉門起點
  const tallX0 = Math.max(balcony ? balcony.to + 0.04 : I.x1 - TALL.w, I.x1 - TALL.w);
  const tallZ1 = Math.min(I.z0 + TALL.d, slide ? slide.from : I.z0 + TALL.d);
  root.add(buildTallCabinet(I, rng, tallX0, tallZ1));

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
