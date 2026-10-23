/**
 * rooms/masterBed.js — 主臥（依屋主實拍重做：極簡、淺色、淺橡木＋白）
 *
 * 所有擺放位置都由 layout.js 推出：
 *   I     = roomInterior('masterBed')         可擺家具的內側範圍
 *   swing = doorSwingZone('masterBed')        房門掃掠區（北牆 z0 東端）
 *   winS / winW = openingsOfRoom() 的南窗 / 西窗（窗台 0.45）
 *
 * 配置（對照實拍）：
 *   北牆：一整片低矮淺橡木床頭長板（高 0.9，頂端可放畫），靠一幅白底藍點畫
 *   床：白色被（垂到近地）、下半段焦糖針織床旗、白枕滾深灰邊、灰褐＋米色抱枕
 *   西北角（床頭與西窗之間）：圓筒紙燈（燈 1）
 *   南牆：窗上方整排淺橡木吊櫃（窗頂 → 天花），白紗簾從吊櫃底垂到臥榻，
 *         西端收一束米色遮光簾＋綁帶；窗下淺橡木臥榻，轉角延續到西窗下
 *   東南角：淺橡木小化妝桌（兩抽）＋毛圈蘑菇凳
 *   東牆：白色無把手平板衣櫃（避開門掃掠區）
 *   燈 2：吊櫃下方暖光，打亮紗簾
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';

const ROOM = 'masterBed';
const TAU = Math.PI * 2;

// ═══════════════════════════════════════════════════════
// 家具尺寸常數（公尺）
// ═══════════════════════════════════════════════════════
const LAMP = { r: 0.125, h: 1.2 };                       // 圓筒紙燈
const HEADBOARD = { h: 0.9, d: 0.15 };                   // 床頭長板
const BED = { w: 1.66, l: 2.0, baseH: 0.30 };            // 床座（外尺寸）
const MAT = { w: 1.60, l: 1.95, h: 0.25 };               // 床墊
const SEAT = { h: 0.45, d: 0.32, top: 0.035 };           // 窗台臥榻
const UPPER = { d: 0.37 };                               // 吊櫃深（背面離牆留 5cm 走管線）
const VANITY = { w: 0.88, d: 0.45, h: 0.75 };
const WARDROBE = { d: 0.60 };
const STOOL = { r: 0.18, h: 0.44 };
const CURTAIN = { amp: 0.03, t: 0.006 };

// ═══════════════════════════════════════════════════════
// 小工具
// ═══════════════════════════════════════════════════════
function mk(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** 方塊：x/z 為中心，y 為底 */
function box(w, h, d, mat, name, x, y, z, opt) {
  const m = mk(new THREE.BoxGeometry(w, h, d), mat, name, opt);
  m.position.set(x, y + h / 2, z);
  return m;
}

/** 圓角方塊：x/z 為中心，y 為底 */
function rbox(w, h, d, r, mat, name, x, y, z, seg = 3, opt) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const m = mk(new RoundedBoxGeometry(w, h, d, seg, rr), mat, name, opt);
  m.position.set(x, y + h / 2, z);
  return m;
}

/** 依 x0..x1 / z0..z1 放方塊 */
function boxXZ(x0, x1, y0, y1, z0, z1, mat, name, opt) {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, name, (x0 + x1) / 2, y0, (z0 + z1) / 2, opt);
}

/** 圓柱：y 為底 */
function cyl(rTop, rBot, h, seg, mat, name, x, y, z, opt) {
  const m = mk(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, name, opt);
  m.position.set(x, y + h / 2, z);
  return m;
}

/** 合併幾何（統一成 non-indexed、只留 position/normal） */
function merge(geos) {
  const list = geos.map((g) => {
    let n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  return mergeGeometries(list);
}

/** 讓物件底部落在 y */
function sitOn(obj, y) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  obj.position.y += y - b.min.y;
}

/** 平滑雜訊（幾個正弦疊加，相位由 rng 決定） */
function makeNoise(rng, amp, freq = 1) {
  const terms = Array.from({ length: 4 }, (_, i) => ({
    fx: rng.range(2, 6) * freq * (i + 1) * 0.6,
    fz: rng.range(2, 6) * freq * (i + 1) * 0.6,
    p: rng.range(0, TAU),
    a: amp / (i + 1),
  }));
  return (x, z) => terms.reduce((s, t) => s + t.a * Math.sin(t.fx * x + t.p) * Math.cos(t.fz * z + t.p * 0.7), 0);
}

/** 由 (cols+1)×(rows+1) 個點建 indexed 網格；vert(i,j) 回傳 [x,y,z] */
function gridGeo(cols, rows, vert) {
  const pos = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) pos.push(...vert(i, j));
  const idx = [];
  const at = (i, j) => j * (cols + 1) + i;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1);
      idx.push(a, b, c, c, b, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ═══════════════════════════════════════════════════════
// 軟裝幾何
// ═══════════════════════════════════════════════════════

/** 枕頭：中間鼓、四邊收薄、角略內縮。w(x) × t(y 厚) × d(z) */
function pillowGeo(w, t, d, rng, { puff = 0.82, pinch = 0.06 } = {}) {
  let g = new THREE.BoxGeometry(w, t, d, 16, 4, 12);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const n = makeNoise(rng, 0.006, 1.5);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = (2 * x) / w, v = (2 * z) / d;
    const fu = 1 - Math.abs(u) ** 2.6, fv = 1 - Math.abs(v) ** 2.6;
    const k = Math.sqrt(Math.max(0, fu * fv));
    y = y * (1 - puff + puff * k) + Math.sign(y) * n(x, z) * k;
    x *= 1 - pinch * v * v;
    z *= 1 - pinch * u * u;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * 垂墜布面（被子、反摺、毯子）：中間平（可鼓起），四邊以圓角折下垂墜。
 * 區域座標：x 以床中心為 0；z 由 zHead 到 zFoot。
 * baseTop(x,z) 給平坦區頂面高度；drop* 為各邊垂下長度。
 */
function drapeGeo({ halfW, zHead, zFoot, r, dropSide, dropHead, dropFoot, baseTop, wrinkle, rng, seg = 0.03, minY = -Infinity }) {
  const a = halfW - r;                          // x 平坦區半寬
  const zh = zHead + (dropHead > 0 ? r : 0);    // z 平坦區
  const zf = zFoot - (dropFoot > 0 ? r : 0);
  const arc = (drop) => (drop > 0 ? (Math.PI * r) / 2 + Math.max(0, drop - r) : 0);
  const sMax = a + arc(dropSide);
  const qTot = arc(dropHead) + (zf - zh) + arc(dropFoot);
  const cols = Math.ceil((2 * sMax) / seg), rows = Math.ceil(qTot / seg);
  const nTop = makeNoise(rng, wrinkle, 1.2);
  const nOut = makeNoise(rng, wrinkle * 1.4, 2.2);

  /** 弧長 t（超出平坦區的量）→ [往外, 往下] */
  const bend = (t, drop) => {
    if (t <= 0) return [0, 0];
    const quarter = Math.min(r, drop);
    if (t <= (Math.PI * quarter) / 2) {
      const th = t / quarter;
      return [quarter * Math.sin(th), quarter * (1 - Math.cos(th))];
    }
    return [quarter, quarter + (t - (Math.PI * quarter) / 2)];
  };

  return gridGeo(cols, rows, (i, j) => {
    const s = -sMax + (2 * sMax * i) / cols;
    const q = (qTot * j) / rows;
    // x
    const tx = Math.abs(s) - a;
    const [ox, dx] = bend(tx, dropSide);
    const xFlat = Math.sign(s) * Math.min(Math.abs(s), a);
    // z
    let zFlat, oz = 0, dz = 0, zDir = 0;
    const qh = arc(dropHead);
    if (q < qh) { [oz, dz] = bend(qh - q, dropHead); zFlat = zh; zDir = -1; }
    else if (q > qh + (zf - zh)) { [oz, dz] = bend(q - qh - (zf - zh), dropFoot); zFlat = zf; zDir = 1; }
    else zFlat = zh + (q - qh);
    const down = Math.max(dx, dz) + 0.35 * Math.min(dx, dz);
    const hang = Math.min(1, down / 0.06);
    const push = nOut(s * 0.7, q) * hang;
    const x = xFlat + Math.sign(s) * (ox + (tx > 0 ? push : 0));
    const z = zFlat + zDir * (oz + (zDir ? push : 0));
    const y = Math.max(minY, baseTop(xFlat, zFlat) - down + nTop(xFlat, zFlat) * (1 - hang));
    return [x, y, z];
  });
}

/** 窗簾：沿 x 的波浪褶，厚度 t；x 0..w、y 0..h、z 置中 */
function curtainGeo(w, h, rng) {
  const segX = Math.max(8, Math.ceil(w / 0.012));
  const g = new THREE.BoxGeometry(w, h, CURTAIN.t, segX, 8, 1);
  const p = g.attributes.position;
  const period = 0.11;
  const ph = rng.range(0, TAU);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + w / 2, y = p.getY(i) + h / 2;
    // 下擺略微張開
    const flare = 1 + 0.25 * (1 - y / h);
    p.setXYZ(i, x, y, p.getZ(i) + CURTAIN.amp * flare * 0.85 * Math.sin((TAU * x) / period + ph));
  }
  g.computeVertexNormals();
  return g;
}

/** 枕頭滾邊：沿枕面內縮 inset 的一圈（上下兩面），座標與 pillowGeo 同一套 */
function pipingGeo(w, t, d, inset, { puff = 0.82, pinch = 0.06 } = {}) {
  const geos = [];
  const N = 96;
  for (const side of [1, -1]) {
    const pts = [];
    for (let i = 0; i < N; i++) {
      // 沿正方形 (u,v) ∈ [-k,k] 的周長走一圈
      const k = 1 - inset;
      const p = (i / N) * 4;
      const seg = Math.floor(p), f = p - seg;
      const [u, v] = [[-k + 2 * k * f, -k], [k, -k + 2 * k * f], [k - 2 * k * f, k], [-k, k - 2 * k * f]][seg];
      const fu = 1 - Math.abs(u) ** 2.6, fv = 1 - Math.abs(v) ** 2.6;
      const kk = Math.sqrt(Math.max(0, fu * fv));
      const y = side * ((t / 2) * (1 - puff + puff * kk) + 0.003);
      pts.push(new THREE.Vector3((u * w) / 2 * (1 - pinch * v * v), y, (v * d) / 2 * (1 - pinch * u * u)));
    }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), N, 0.0045, 5, true));
  }
  return merge(geos);
}

/** 收束的遮光布簾：上段直褶、綁帶處收腰、下段微微散開 */
function gatheredCurtainGeo(w, h, tieY, rng) {
  const segX = 28;
  const g = new THREE.BoxGeometry(w, h, 0.012, segX, 30, 1);
  const p = g.attributes.position;
  const ph = rng.range(0, TAU);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + h / 2;
    const waist = 1 - 0.6 * Math.exp(-(((y - tieY) / 0.28) ** 2));
    const flare = y < tieY ? 1 + 0.25 * (1 - y / tieY) : 1;
    const amp = 0.035 * (y < tieY ? 1.3 : 1);
    p.setXYZ(i, x * waist * flare, y, p.getZ(i) + amp * Math.sin((TAU * (x + w / 2)) / 0.075 + ph));
  }
  g.computeVertexNormals();
  return g;
}

// ═══════════════════════════════════════════════════════
// build
// ═══════════════════════════════════════════════════════
export function build() {
  const rng = rngFor(ROOM);
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;

  const I = L.roomInterior(ROOM);
  const H = L.CEILING_HEIGHT;
  const swing = L.doorSwingZone(ROOM);
  const openings = L.openingsOfRoom(ROOM);
  const winS = openings.find((o) => o.category === 'window' && o.side === 'z1');
  const winW = openings.find((o) => o.category === 'window' && o.side === 'x0');
  const headS = winS.head ?? L.WINDOW.head;

  // —— 錨點（全部由房間邊界、門、窗推出）——
  // 紙燈：西北角，落在西窗北緣之前（不擋窗）
  const lamp = { x: I.x0 + 0.04 + LAMP.r, z: Math.min(I.z0 + 0.03 + LAMP.r, winW.from - 0.01 - LAMP.r) };
  // 床頭長板：紙燈右側 → 門掃掠區左緣
  const hb = { x0: lamp.x + LAMP.r + 0.04, x1: swing.x0 - 0.02, z0: I.z0, z1: I.z0 + HEADBOARD.d };
  const bedX0 = hb.x0 + 0.38, bedX1 = bedX0 + BED.w, bedCx = (bedX0 + bedX1) / 2;
  const bedZ0 = hb.z1 + 0.005, bedZ1 = bedZ0 + BED.l;
  const matZ0 = bedZ0 + (BED.l - MAT.l) / 2, matZ1 = matZ0 + MAT.l;
  const matTop = BED.baseH + MAT.h;
  // 化妝桌：東南角；臥榻：南牆從西牆排到化妝桌、西牆延續到窗北緣
  const van = { x1: I.x1 - 0.02, z1: I.z1 - 0.02 };
  van.x0 = van.x1 - VANITY.w; van.z0 = van.z1 - VANITY.d;
  const stool = { x: (van.x0 + van.x1) / 2, z: van.z0 - 0.06 };
  // 衣櫃：東牆，從門掃掠區下緣到蘑菇凳前
  const ward = { x0: I.x1 - WARDROBE.d, x1: I.x1, z0: swing.z1 + 0.05, z1: stool.z - STOOL.r - 0.05 };
  const seatS = { x0: I.x0, x1: van.x0 - 0.005, z0: I.z1 - SEAT.d, z1: I.z1 };
  const seatW = { x0: I.x0, x1: I.x0 + SEAT.d, z0: winW.from + 0.02, z1: seatS.z0 };
  // 吊櫃：南牆整排，窗頂到天花；背面距牆中心線 ≥ 0.15，不觸發擋窗
  // 西端退到西窗百葉簾（窗框外 0.15）之外
  const westClear = winW.center[0] + 0.18;
  const up = { y0: headS, y1: H - 0.005, z1: winS.center[1] - 0.152, x0: westClear, x1: I.x1 };
  up.z0 = up.z1 - UPPER.d;

  root.add(buildHeadboard());
  root.add(buildBed());
  root.add(buildPaperLamp());
  root.add(buildWindowSeat());
  root.add(buildUpperCabinets());
  root.add(buildCurtains(rng.fork('curtain')));
  root.add(buildVanity());
  root.add(buildStool());
  root.add(buildWardrobe());
  root.add(buildBaseboards());
  return root;

  // ─────────────────────────────────────────────────────
  // 床頭長板＋藍點畫＋小物
  // ─────────────────────────────────────────────────────
  function buildHeadboard() {
    const g = new THREE.Group();
    g.name = `${ROOM}:headboard`;
    const kick = 0.06, top = 0.03;
    g.add(boxXZ(hb.x0 + 0.02, hb.x1 - 0.02, 0, kick, hb.z0, hb.z1 - 0.03, M.woodOakDark, 'headboard:kick'));
    g.add(boxXZ(hb.x0, hb.x1, kick, HEADBOARD.h - top, hb.z0, hb.z1 - 0.008, M.woodOak, 'headboard:body'));
    g.add(rbox(hb.x1 - hb.x0, top, HEADBOARD.d, 0.004, M.woodOak, 'headboard:top', (hb.x0 + hb.x1) / 2, HEADBOARD.h - top, (hb.z0 + hb.z1) / 2, 2));
    // 板與板的接縫（系統板材分割線）
    const seams = [];
    const nSeam = Math.round((hb.x1 - hb.x0) / 0.9);
    for (let i = 1; i < nSeam; i++) {
      const x = hb.x0 + ((hb.x1 - hb.x0) * i) / nSeam;
      seams.push(new THREE.BoxGeometry(0.003, HEADBOARD.h - kick - top, 0.002).translate(x, (HEADBOARD.h + kick - top) / 2, hb.z1 - 0.007));
    }
    if (seams.length) g.add(mk(merge(seams), M.woodOakDark, 'headboard:seam', { cast: false }));

    // 白底藍點畫：靠在床頭板頂、偏西側
    const ar = rng.fork('art');
    const aw = 0.42, ah = 0.56, ax = bedX0 + 0.42;
    const art = new THREE.Group();
    art.name = `${ROOM}:art`;
    const board = mk(new THREE.BoxGeometry(aw, ah, 0.012), M.paperWhite, 'art:board');
    board.position.set(0, ah / 2, 0);
    art.add(board);
    const dots = [];
    for (let i = 0; i < 70; i++) {
      // 葡萄串狀的橢圓分布，上寬下窄
      const t = ar.next();
      const yy = ah * (0.25 + 0.5 * t);
      const half = aw * 0.2 * (0.45 + 0.55 * t) * Math.sin(Math.PI * Math.min(1, 0.15 + t));
      const xx = ar.range(-half, half);
      const r = ar.range(0.009, 0.017);
      dots.push(new THREE.CylinderGeometry(r, r, 0.002, 14).rotateX(Math.PI / 2).translate(xx + ar.jitter(0, 0.004), yy, 0.007));
    }
    art.add(mk(merge(dots), M.bookColors[1], 'art:dots', { cast: false }));
    art.position.set(ax, HEADBOARD.h, hb.z0 + 0.07);
    art.rotation.x = -0.12;
    g.add(art);

    // 右端小物：霧面陶瓶＋乾燥枝、兩本書
    const vx = hb.x1 - 0.18, vz = (hb.z0 + hb.z1) / 2;
    const vase = mk(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.04, 0), new THREE.Vector2(0.055, 0.05),
      new THREE.Vector2(0.05, 0.12), new THREE.Vector2(0.022, 0.17), new THREE.Vector2(0.024, 0.2),
    ], 24), M.ceramicMatte, 'headboard:vase');
    vase.position.set(vx, HEADBOARD.h, vz);
    g.add(vase);
    const tr = rng.fork('twigs');
    const twigs = [];
    for (let i = 0; i < 4; i++) {
      const len = tr.range(0.25, 0.38);
      twigs.push(new THREE.CylinderGeometry(0.002, 0.0035, len, 5).translate(0, len / 2, 0).rotateZ(tr.jitter(0, 0.3)).rotateX(tr.jitter(0, 0.1)).translate(vx, HEADBOARD.h + 0.18, vz));
    }
    g.add(mk(merge(twigs), M.stem, 'headboard:twigs'));
    let y = HEADBOARD.h;
    for (const [i, c] of [[0, 4], [1, 6]]) {
      const bh = 0.022 + i * 0.006;
      const b = box(0.15, bh, 0.11, M.bookColors[c], 'headboard:book', hb.x1 - 0.42, y, vz);
      b.rotation.y = 0.12 - i * 0.2;
      g.add(b);
      y += bh;
    }
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 床
  // ─────────────────────────────────────────────────────
  function buildBed() {
    const g = new THREE.Group();
    g.name = `${ROOM}:bed`;
    const br = rng.fork('bed');
    const bz = (bedZ0 + bedZ1) / 2;
    g.add(box(BED.w - 0.1, BED.baseH, BED.l - 0.1, M.paintWhite, 'bed:base', bedCx, 0, bz));
    g.add(rbox(MAT.w, MAT.h, MAT.l, 0.05, M.fabricWhite, 'bed:mattress', bedCx, BED.baseH, (matZ0 + matZ1) / 2, 4));

    // 白被：從枕頭下方蓋到床尾，兩側與床尾垂到近地
    const half = MAT.w / 2 + 0.025;
    const dHead = matZ0 + 0.55;
    const loft = 0.055;
    const dTop = (x, z) => {
      const bx = 1 - Math.min(1, Math.abs(x) / half) ** 4;
      const bzF = 1 - Math.min(1, Math.abs((z - (dHead + matZ1) / 2) / ((matZ1 - dHead) / 2 + 0.02))) ** 6;
      return matTop + 0.015 + loft * bx * Math.max(0.35, bzF);
    };
    const hang = matTop - 0.07;
    const local = (geo) => geo.translate(bedCx, 0, 0);
    g.add(mk(local(drapeGeo({
      halfW: half, zHead: dHead, zFoot: matZ1 + 0.03, r: 0.06,
      dropSide: hang, dropHead: 0, dropFoot: hang,
      baseTop: dTop, wrinkle: 0.006, rng: br.fork('duvet'), minY: 0.035,
    })), M.fabricWhite, 'bed:duvet'));
    // 頭端反摺
    g.add(mk(local(drapeGeo({
      halfW: half + 0.012, zHead: dHead - 0.04, zFoot: dHead + 0.26, r: 0.03,
      dropSide: hang - 0.05, dropHead: 0.05, dropFoot: 0.03,
      baseTop: (x, z) => dTop(x, z) + 0.035, wrinkle: 0.005, rng: br.fork('fold'),
    })), M.fabricWhite, 'bed:duvetFold'));
    // 焦糖針織床旗：下半段，兩側與床尾垂下
    const rTop = (x, z) => dTop(x, z) + 0.03;
    g.add(mk(local(drapeGeo({
      halfW: half + 0.03, zHead: matZ0 + MAT.l * 0.42, zFoot: matZ1 + 0.06, r: 0.07,
      dropSide: 0.36, dropHead: 0.015, dropFoot: 0.32,
      baseTop: rTop, wrinkle: 0.006, rng: br.fork('runner'),
    })), M.fabricBrownKnit, 'bed:runner'));

    // 枕頭
    const pillow = (name, w, t, d, mat, x, z, tilt, yaw, r2, piping) => {
      const m = mk(pillowGeo(w, t, d, r2), mat, name);
      if (piping) m.add(mk(pipingGeo(w, t, d, 0.14), M.fabricCharcoal, `${name}:piping`, { cast: false }));
      m.rotation.set(tilt, yaw, 0, 'YXZ');
      m.position.set(x, 0, z);
      sitOn(m, matTop - 0.015);
      return m;
    };
    for (const s of [-1, 1]) {
      g.add(pillow('bed:pillow', 0.72, 0.2, 0.5, M.fabricWhite, bedCx + s * 0.38, matZ0 + 0.16, -(Math.PI / 2 + 0.38), s * 0.03, br.fork(`pil${s}`), true));
    }
    g.add(pillow('bed:cushionTaupe', 0.46, 0.15, 0.46, M.fabricTaupe, bedCx - 0.42, matZ0 + 0.36, -(Math.PI / 2 + 0.42), -0.12, br.fork('t1')));
    g.add(pillow('bed:cushionTaupe', 0.46, 0.15, 0.46, M.fabricTaupe, bedCx + 0.3, matZ0 + 0.36, -(Math.PI / 2 + 0.45), 0.1, br.fork('t2')));
    g.add(pillow('bed:cushionOat', 0.42, 0.14, 0.42, M.fabricOat, bedCx - 0.12, matZ0 + 0.5, -(Math.PI / 2 + 0.55), 0.18, br.fork('o1')));
    g.add(pillow('bed:cushionLinen', 0.55, 0.14, 0.34, M.fabricLinen, bedCx + 0.5, matZ0 + 0.52, -(Math.PI / 2 + 0.6), -0.2, br.fork('o2')));
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 圓筒紙燈（燈 1）
  // ─────────────────────────────────────────────────────
  function buildPaperLamp() {
    const g = new THREE.Group();
    g.name = `${ROOM}:paperLamp`;
    g.add(cyl(LAMP.r * 0.9, LAMP.r * 0.95, 0.02, 32, M.woodOak, 'lamp:base', lamp.x, 0, lamp.z));
    g.add(cyl(LAMP.r, LAMP.r, LAMP.h - 0.02, 40, M.paperLamp, 'lamp:paper', lamp.x, 0.02, lamp.z, { cast: false, receive: false }));
    // 紙燈的細橫紋（和紙接縫）
    const rings = [];
    for (let k = 1; k < 6; k++) rings.push(new THREE.TorusGeometry(LAMP.r + 0.001, 0.0012, 4, 48).rotateX(Math.PI / 2).translate(lamp.x, 0.02 + ((LAMP.h - 0.02) * k) / 6, lamp.z));
    g.add(mk(merge(rings), M.paperWhite, 'lamp:seams', { cast: false }));
    const light = new THREE.PointLight(L.LIGHT_COLORS.k2700, 2.2, 4, 2);
    light.name = `${ROOM}:paperLampLight`;
    light.castShadow = false;
    light.position.set(lamp.x + 0.02, LAMP.h * 0.6, lamp.z + 0.02);
    g.add(light);
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 窗台臥榻（南牆＋西牆延續）
  // ─────────────────────────────────────────────────────
  function buildWindowSeat() {
    const g = new THREE.Group();
    g.name = `${ROOM}:windowSeat`;
    const kick = 0.06, t = SEAT.top;
    // 南段
    g.add(boxXZ(seatS.x0, seatS.x1, 0, kick, seatS.z0 + 0.04, seatS.z1, M.woodOakDark, 'seat:kick'));
    g.add(boxXZ(seatS.x0, seatS.x1, kick, SEAT.h - t, seatS.z0 + 0.012, seatS.z1, M.woodOak, 'seat:body'));
    g.add(rbox(seatS.x1 - seatS.x0, t, SEAT.d, 0.004, M.woodOak, 'seat:top', (seatS.x0 + seatS.x1) / 2, SEAT.h - t, (seatS.z0 + seatS.z1) / 2, 2));
    // 西段（轉角接南段）
    g.add(boxXZ(seatW.x0, seatW.x1 - 0.04, 0, kick, seatW.z0, seatW.z1, M.woodOakDark, 'seat:kick'));
    g.add(boxXZ(seatW.x0, seatW.x1 - 0.012, kick, SEAT.h - t, seatW.z0, seatW.z1, M.woodOak, 'seat:body'));
    g.add(rbox(SEAT.d, t, seatW.z1 - seatW.z0, 0.004, M.woodOak, 'seat:top', (seatW.x0 + seatW.x1) / 2, SEAT.h - t, (seatW.z0 + seatW.z1) / 2, 2));
    // 臥榻上的小深灰碗（實拍）
    const bowl = mk(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.035, 0), new THREE.Vector2(0.06, 0.02), new THREE.Vector2(0.075, 0.045),
      new THREE.Vector2(0.07, 0.046), new THREE.Vector2(0.055, 0.022), new THREE.Vector2(0, 0.012),
    ], 28), M.stoneDark, 'seat:bowl');
    bowl.position.set(winS.from + (winS.to - winS.from) * 0.72, SEAT.h, seatS.z0 + 0.1);
    g.add(bowl);
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 南牆吊櫃（窗頂 → 天花）
  // ─────────────────────────────────────────────────────
  function buildUpperCabinets() {
    const g = new THREE.Group();
    g.name = `${ROOM}:upperCabinets`;
    const t = 0.018;
    g.add(boxXZ(up.x0, up.x1, up.y0, up.y1, up.z0 + t, up.z1, M.woodOakDark, 'upper:carcass'));
    g.add(boxXZ(up.x0, up.x1, up.y0, up.y0 + t, up.z0, up.z1, M.woodOak, 'upper:bottom'));
    const n = Math.max(1, Math.round((up.x1 - up.x0) / 0.55));
    const w = (up.x1 - up.x0) / n, gap = 0.003;
    const doors = [];
    for (let i = 0; i < n; i++) {
      const a = up.x0 + i * w + gap / 2, b = a + w - gap;
      doors.push(new THREE.BoxGeometry(b - a, up.y1 - up.y0 - t - gap * 2, t).translate((a + b) / 2, (up.y0 + t + up.y1) / 2, up.z0 + t / 2));
    }
    g.add(mk(merge(doors), M.woodOak, 'upper:doors'));
    // 紗簾軌道（藏在吊櫃底）
    g.add(boxXZ(up.x0, seatS.x1, up.y0 - 0.02, up.y0, up.z1 - 0.13, up.z1 - 0.09, M.metalAluminium, 'upper:track'));
    // 燈 2：吊櫃下方暖光洗紗簾
    const light = new THREE.PointLight(L.LIGHT_COLORS.k2700, 1.0, 3.2, 2);
    light.name = `${ROOM}:curtainWash`;
    light.castShadow = false;
    light.position.set((winS.from + winS.to) / 2, up.y0 - 0.15, up.z0 - 0.2);
    g.add(light);
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 白紗簾＋西端收束的米色遮光簾
  // ─────────────────────────────────────────────────────
  function buildCurtains(r) {
    const g = new THREE.Group();
    g.name = `${ROOM}:curtains`;
    const yTop = up.y0 - 0.02, yBot = SEAT.h + 0.008;
    const sheerZ = up.z1 - 0.1;
    // 紗簾分兩片，中間微開
    const sx0 = westClear + 0.01, sx1 = seatS.x1 - 0.02;
    const mid = winS.from + (winS.to - winS.from) * 0.55;
    for (const [a, b] of [[sx0, mid - 0.01], [mid + 0.01, sx1]]) {
      const m = mk(curtainGeo(b - a, yTop - yBot, r), M.sheerCurtain, 'curtain:sheer', { cast: false });
      m.position.set(a, yBot, sheerZ);
      g.add(m);
    }
    // 遮光簾：西端收一束＋綁帶
    const bw = 0.34, bx = sx0 + 0.02 + bw / 2, bz = sheerZ - 0.07;
    const ch = yTop - yBot, tieY = 0.42 * ch + 0.15;
    const bo = mk(gatheredCurtainGeo(bw, ch, tieY, r), M.fabricLinen, 'curtain:blackout');
    bo.position.set(bx, yBot, bz);
    g.add(bo);
    const tie = mk(new THREE.TorusGeometry(bw * 0.22, 0.012, 6, 24).scale(1, 1, 0.7).rotateX(Math.PI / 2), M.fabricOat, 'curtain:tieback');
    tie.position.set(bx, yBot + tieY, bz);
    g.add(tie);
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 化妝桌（兩抽、無把手）＋面紙盒、小碗
  // ─────────────────────────────────────────────────────
  function buildVanity() {
    const g = new THREE.Group();
    g.name = `${ROOM}:vanity`;
    const { x0, x1, z0, z1 } = van;
    const t = 0.025, top = 0.03, drawerH = 0.14;
    g.add(rbox(VANITY.w, top, VANITY.d, 0.005, M.woodOak, 'vanity:top', (x0 + x1) / 2, VANITY.h - top, (z0 + z1) / 2, 2));
    g.add(boxXZ(x0, x0 + t, 0, VANITY.h - top, z0, z1, M.woodOak, 'vanity:side'));
    g.add(boxXZ(x1 - t, x1, 0, VANITY.h - top, z0, z1, M.woodOak, 'vanity:side'));
    g.add(boxXZ(x0 + t, x1 - t, 0.06, VANITY.h - top, z1 - 0.015, z1, M.woodOak, 'vanity:back'));
    const dy0 = VANITY.h - top - drawerH;
    g.add(boxXZ(x0 + t, x1 - t, dy0 - 0.015, dy0, z0 + 0.02, z1 - 0.015, M.woodOak, 'vanity:drawerBase'));
    const dw = (x1 - x0 - 2 * t) / 2;
    for (let i = 0; i < 2; i++) {
      const a = x0 + t + i * dw + 0.002, b = a + dw - 0.004;
      g.add(boxXZ(a, b, dy0 + 0.003, VANITY.h - top - 0.003, z0, z0 + 0.018, M.woodOak, 'vanity:drawer'));
      // 無把手：下緣斜切取手溝（深色細縫）
      g.add(boxXZ(a + 0.01, b - 0.01, dy0 + 0.003, dy0 + 0.012, z0 - 0.001, z0 + 0.002, M.woodOakDark, 'vanity:pull', { cast: false }));
    }
    // 面紙盒（木盒＋紙巾）
    const tx = x0 + 0.2, tz = (z0 + z1) / 2 + 0.03;
    g.add(rbox(0.24, 0.09, 0.13, 0.008, M.woodOak, 'vanity:tissueBox', tx, VANITY.h, tz, 2));
    const tissue = mk(pillowGeo(0.08, 0.05, 0.05, rng.fork('tissue'), { puff: 0.9, pinch: 0.2 }), M.paperWhite, 'vanity:tissue');
    tissue.position.set(tx, VANITY.h + 0.095, tz);
    tissue.rotation.z = 0.4;
    g.add(tissue);
    // 小碗
    const bowl = mk(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.03, 0), new THREE.Vector2(0.06, 0.025), new THREE.Vector2(0.07, 0.05),
      new THREE.Vector2(0.065, 0.051), new THREE.Vector2(0.05, 0.028), new THREE.Vector2(0, 0.014),
    ], 28), M.stoneDark, 'vanity:bowl');
    bowl.position.set(x1 - 0.18, VANITY.h, (z0 + z1) / 2);
    g.add(bowl);
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 毛圈蘑菇凳
  // ─────────────────────────────────────────────────────
  function buildStool() {
    const g = new THREE.Group();
    g.name = `${ROOM}:stool`;
    const R = STOOL.r, h = STOOL.h;
    const stem = mk(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(R * 0.82, 0), new THREE.Vector2(R * 0.84, 0.015), new THREE.Vector2(R * 0.72, 0.08),
      new THREE.Vector2(R * 0.55, 0.2), new THREE.Vector2(R * 0.5, h - 0.1), new THREE.Vector2(0, h - 0.1),
    ], 36), M.fabricBoucle, 'stool:stem');
    const cap = mk(new THREE.LatheGeometry([
      new THREE.Vector2(0, h - 0.12), new THREE.Vector2(R * 0.8, h - 0.12), new THREE.Vector2(R * 0.97, h - 0.1),
      new THREE.Vector2(R, h - 0.07), new THREE.Vector2(R * 0.95, h - 0.025), new THREE.Vector2(R * 0.75, h - 0.003), new THREE.Vector2(0, h),
    ], 36), M.fabricBoucle, 'stool:cap');
    for (const m of [stem, cap]) { m.position.set(stool.x, 0, stool.z); g.add(m); }
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 東牆白色無把手平板衣櫃
  // ─────────────────────────────────────────────────────
  function buildWardrobe() {
    const g = new THREE.Group();
    g.name = `${ROOM}:wardrobe`;
    const { x0, x1, z0, z1 } = ward;
    const plinth = 0.07, topY = H - 0.005, t = 0.02;
    g.add(boxXZ(x0 + 0.05, x1, 0, plinth, z0, z1, M.paintCream, 'wardrobe:plinth'));
    g.add(boxXZ(x0 + t, x1, plinth, topY, z0, z1, M.paintCream, 'wardrobe:carcass'));
    const n = Math.max(1, Math.round((z1 - z0) / 0.6));
    const w = (z1 - z0) / n, gap = 0.003;
    const doors = [];
    for (let i = 0; i < n; i++) {
      const a = z0 + i * w + gap / 2, b = a + w - gap;
      doors.push(new THREE.BoxGeometry(t, topY - plinth - gap * 2, b - a).translate(x0 + t / 2, (plinth + topY) / 2, (a + b) / 2));
    }
    g.add(mk(merge(doors), M.paintWhite, 'wardrobe:doors'));
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 踢腳板（北牆露出段）
  // ─────────────────────────────────────────────────────
  function buildBaseboards() {
    const g = new THREE.Group();
    g.name = `${ROOM}:baseboards`;
    const h = 0.06, t = 0.01;
    g.add(boxXZ(I.x0, hb.x0, 0, h, I.z0, I.z0 + t, M.baseboard, 'baseboard:north'));
    g.add(boxXZ(I.x0, I.x0 + t, 0, h, I.z0 + t, seatW.z0, M.baseboard, 'baseboard:west'));
    g.add(boxXZ(I.x1 - t, I.x1, 0, h, swing.z1, ward.z0, M.baseboard, 'baseboard:east'));
    g.add(boxXZ(I.x1 - t, I.x1, 0, h, ward.z1, van.z0, M.baseboard, 'baseboard:east'));
    return g;
  }
}
