/**
 * rooms/masterBed.js — 主臥（依屋主實拍：極簡、淺色、淺橡木＋白）v3 質感版
 *
 * 所有擺放位置都由 layout.js 推出：
 *   I     = roomInterior('masterBed')         可擺家具的內側範圍
 *   swing = doorSwingZone('masterBed')        房門掃掠區（北牆 z0 東端）
 *   winS / winW = openingsOfRoom() 的南窗 / 西窗（窗台 0.45）
 *
 * 配置（對照實拍）：
 *   北牆：一整片低矮淺橡木床頭長板（高 0.9，頂端可放畫），靠一幅白底藍點畫
 *   床：mattress 床墊、drapeOver 白被（三邊垂、床頭反摺）、焦糖針織床旗橫鋪下半段、
 *       cushion 枕頭（白枕深灰滾邊）＋灰褐、米色抱枕互相倚靠
 *   西北角（床頭與西窗之間）：lathe 圓筒紙燈（燈 1）
 *   南牆：窗上方整排淺橡木吊櫃；curtain() 白紗簾（西側收攏）＋收束的米色遮光簾＋綁帶；
 *         窗下淺橡木臥榻，轉角延續到西窗下
 *   東南角：淺橡木小化妝桌（兩抽）＋毛圈蘑菇凳
 *   東牆：白色無把手平板衣櫃（避開門掃掠區）
 *   燈 2：吊櫃下方暖光，打亮紗簾
 */
import * as THREE from 'three';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import * as G from '../geo.js';

const ROOM = 'masterBed';

// ═══════════════════════════════════════════════════════
// 家具尺寸常數（公尺）
// ═══════════════════════════════════════════════════════
const LAMP = { r: 0.125, h: 1.2 };                       // 圓筒紙燈
const HEADBOARD = { h: 0.9, d: 0.15 };                   // 床頭長板
const BED = { w: 1.66, l: 2.0, baseH: 0.28 };            // 床座（外尺寸）
const MAT = { w: 1.60, l: 1.95, h: 0.26 };               // 床墊
const SEAT = { h: 0.45, d: 0.32, top: 0.035 };           // 窗台臥榻
const UPPER = { d: 0.37 };                               // 吊櫃深（背面離牆 5cm）
const VANITY = { w: 0.88, d: 0.45, h: 0.75 };
const WARDROBE = { d: 0.60 };
const STOOL = { r: 0.18, h: 0.44 };
const GAP = 0.003;                                       // 門縫
const BEVEL = 0.003;                                     // 硬邊倒角

// ═══════════════════════════════════════════════════════
// 小工具
// ═══════════════════════════════════════════════════════
const mk = (geo, mat, name, opt) => G.mesh(geo, mat, `${ROOM}:${name}`, opt);

/** 倒角方塊：x/z 為中心，y 為底 */
function rb(w, h, d, mat, name, x, y, z, r = BEVEL, opt) {
  const m = mk(G.roundedBox(w, h, d, r), mat, name, opt);
  m.position.set(x, y + h / 2, z);
  return m;
}
/** 倒角方塊：以範圍給 */
const rbXZ = (x0, x1, y0, y1, z0, z1, mat, name, r, opt) =>
  rb(x1 - x0, y1 - y0, z1 - z0, mat, name, (x0 + x1) / 2, y0, (z0 + z1) / 2, r, opt);

/** 合併多個幾何成一個 mesh（重算法線與公尺 UV） */
function mergedMesh(geos, mat, name, opt) {
  const g = G.mergeGeoms(geos);
  g.computeVertexNormals();
  return mk(G.worldUV(g), mat, name, opt);
}

/** 讓物件底部落在 y */
function sitOn(obj, y) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  obj.position.y += y - b.min.y;
}

/** 車削 mesh，底部在 (x, y, z) */
function latheAt(profile, mat, name, x, y, z, seg = 48, opt) {
  const m = mk(G.lathe(profile, seg), mat, name, opt);
  m.position.set(x, y, z);
  return m;
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
  const lamp = { x: I.x0 + 0.04 + LAMP.r, z: Math.min(I.z0 + 0.03 + LAMP.r, winW.from - 0.01 - LAMP.r) };
  const hb = { x0: lamp.x + LAMP.r + 0.04, x1: swing.x0 - 0.02, z0: I.z0, z1: I.z0 + HEADBOARD.d };
  const bedX0 = hb.x0 + 0.38, bedX1 = bedX0 + BED.w, bedCx = (bedX0 + bedX1) / 2;
  const bedZ0 = hb.z1 + 0.005, bedZ1 = bedZ0 + BED.l;
  const matZ0 = bedZ0 + (BED.l - MAT.l) / 2, matZ1 = matZ0 + MAT.l;
  const matTop = BED.baseH + MAT.h;
  const van = { x1: I.x1 - 0.02, z1: I.z1 - 0.02 };
  van.x0 = van.x1 - VANITY.w; van.z0 = van.z1 - VANITY.d;
  const stool = { x: (van.x0 + van.x1) / 2, z: van.z0 - 0.06 };
  const ward = { x0: I.x1 - WARDROBE.d, x1: I.x1, z0: swing.z1 + 0.05, z1: stool.z - STOOL.r - 0.05 };
  const seatS = { x0: I.x0, x1: van.x0 - 0.005, z0: I.z1 - SEAT.d, z1: I.z1 };
  const seatW = { x0: I.x0, x1: I.x0 + SEAT.d, z0: winW.from + 0.02, z1: seatS.z0 };
  // 吊櫃：西端退到西窗百葉簾之外；背面距牆中心線 > 0.15，不觸發擋窗
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
    g.add(rbXZ(hb.x0 + 0.02, hb.x1 - 0.02, 0, kick, hb.z0, hb.z1 - 0.03, M.woodOakDark, 'headboard:kick'));
    // 系統板材：分成數片，片與片之間留 3mm 縫
    const nPanel = Math.max(1, Math.round((hb.x1 - hb.x0) / 0.9));
    const pw = (hb.x1 - hb.x0) / nPanel;
    for (let i = 0; i < nPanel; i++) {
      const a = hb.x0 + i * pw + (i ? GAP / 2 : 0), b = hb.x0 + (i + 1) * pw - (i < nPanel - 1 ? GAP / 2 : 0);
      g.add(rbXZ(a, b, kick, HEADBOARD.h - top, hb.z0, hb.z1 - 0.008, M.woodOak, 'headboard:panel', 0.004));
    }
    g.add(rb(hb.x1 - hb.x0, top, HEADBOARD.d, M.woodOak, 'headboard:top', (hb.x0 + hb.x1) / 2, HEADBOARD.h - top, (hb.z0 + hb.z1) / 2, 0.005));

    // 白底藍點畫：靠在床頭板頂、偏西側
    const ar = rng.fork('art');
    const aw = 0.42, ah = 0.56;
    const art = new THREE.Group();
    art.name = `${ROOM}:art`;
    art.add(rb(aw, ah, 0.012, M.paperWhite, 'art:board', 0, 0, 0, 0.002));
    const dots = [];
    for (let i = 0; i < 70; i++) {
      const t = ar.next();
      const yy = ah * (0.25 + 0.5 * t);
      const half = aw * 0.2 * (0.45 + 0.55 * t) * Math.sin(Math.PI * Math.min(1, 0.15 + t));
      const r = ar.range(0.009, 0.017);
      dots.push(new THREE.CylinderGeometry(r, r, 0.002, 14).rotateX(Math.PI / 2).translate(ar.range(-half, half), yy, 0.007));
    }
    art.add(mergedMesh(dots, M.bookColors[1], 'art:dots', { cast: false }));
    art.position.set(bedX0 + 0.42, HEADBOARD.h, hb.z0 + 0.07);
    art.rotation.x = -0.12;
    g.add(art);

    // 右端小物：霧面陶瓶＋乾燥枝、兩本書
    const vx = hb.x1 - 0.18, vz = (hb.z0 + hb.z1) / 2;
    g.add(latheAt([[0, 0], [0.04, 0], [0.052, 0.03], [0.056, 0.07], [0.048, 0.12], [0.026, 0.165], [0.022, 0.19], [0.025, 0.2], [0.018, 0.2]], M.ceramicMatte, 'headboard:vase', vx, HEADBOARD.h, vz));
    const tr = rng.fork('twigs');
    const twigs = [];
    for (let i = 0; i < 4; i++) {
      const len = tr.range(0.25, 0.38), lean = tr.jitter(0, 0.3), lz = tr.jitter(0, 0.08);
      twigs.push(G.tube([[vx, HEADBOARD.h + 0.15, vz], [vx + lean * len * 0.5, HEADBOARD.h + 0.15 + len * 0.55, vz + lz * len], [vx + lean * len, HEADBOARD.h + 0.15 + len, vz + lz * len * 1.6]], 0.0025, { segments: 8, radial: 4 }));
    }
    g.add(mergedMesh(twigs, M.stem, 'headboard:twigs'));
    let y = HEADBOARD.h;
    for (const [i, c] of [[0, 4], [1, 6]]) {
      const bh = 0.022 + i * 0.006;
      const b = rb(0.15, bh, 0.11, M.bookColors[c], 'headboard:book', hb.x1 - 0.42, y, vz, 0.002);
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
    g.add(rb(BED.w - 0.1, BED.baseH, BED.l - 0.1, M.paintWhite, 'bed:base', bedCx, 0, bz, 0.01));
    const mat = mk(G.mattress(MAT.w, MAT.h, MAT.l, { radius: 0.05, crown: 0.012, wrinkle: 0.002, rng: br.fork('mat') }), M.fabricWhite, 'bed:mattress');
    mat.position.set(bedCx, BED.baseH + MAT.h / 2, (matZ0 + matZ1) / 2);
    g.add(mat);

    // 白被：從枕頭下蓋到床尾，兩側與床尾垂到近地
    const duvetY = matTop + 0.02;
    const dHead = matZ0 + 0.5;
    const dw = MAT.w + 0.01, dd = matZ1 - dHead;
    const hang = duvetY - 0.06;
    const duvet = mk(G.drapeOver({
      w: dw, d: dd, overhang: { x0: hang, x1: hang, z0: 0, z1: hang },
      thickness: 0.03, wrinkle: 0.024, edgeRadius: 0.06, rng: br.fork('duvet'), res: 0.025,
    }), M.fabricWhite, 'bed:duvet');
    duvet.position.set(bedCx, duvetY, dHead + dd / 2);
    g.add(duvet);
    // 床頭反摺：頭端捲下蓋住被緣，兩側跟著垂
    const foldD = 0.3;
    const fold = mk(G.drapeOver({
      w: dw, d: foldD, overhang: { x0: hang - 0.06, x1: hang - 0.06, z0: 0.045, z1: 0.025 },
      thickness: 0.02, wrinkle: 0.014, edgeRadius: 0.095, rng: br.fork('fold'), res: 0.025,
    }), M.fabricWhite, 'bed:duvetFold');
    fold.position.set(bedCx, duvetY + 0.035, dHead + foldD / 2 - 0.02);
    g.add(fold);

    // 焦糖針織床旗：橫鋪在下半段，兩側垂下
    const runD = 0.72;
    const runner = mk(G.drapeOver({
      w: dw, d: runD, overhang: { x0: 0.36, x1: 0.36, z0: 0, z1: 0 },
      thickness: 0.012, wrinkle: 0.02, edgeRadius: 0.105, rng: br.fork('runner'), res: 0.025,
    }), M.fabricBrownKnit, 'bed:runner');
    runner.position.set(bedCx, duvetY + 0.03, matZ1 - 0.12 - runD / 2);
    g.add(runner);

    // 枕頭與抱枕：立著、往床頭倒、互相倚靠
    const pillow = (name, w, h, d, m, x, z, lean, yaw, roll, r2, piping, { seam = 0.1, wrinkle = 0.009 } = {}) => {
      const o = mk(G.cushion(w, h, d, { seam, wrinkle, rng: r2, segments: 24 }), m, name);
      if (piping) o.add(pipingLoop(w, h, d, 0.12, 0.1, `${name}:piping`));
      o.rotation.set(-Math.PI / 2 - lean, yaw, roll, 'YXZ');
      o.position.set(x, 0, z);
      sitOn(o, matTop - 0.02);
      return o;
    };
    // 後排：兩個白枕（深灰滾邊），靠在床頭板上
    for (const s of [-1, 1]) {
      g.add(pillow('bed:pillow', 0.72, 0.24, 0.5, M.fabricWhite, bedCx + s * 0.38, matZ0 + 0.15, 0.36, s * 0.04, s * 0.03, br.fork(`pil${s}`), true));
    }
    // 中排：灰褐抱枕倚在白枕前
    g.add(pillow('bed:cushionTaupe', 0.46, 0.2, 0.46, M.fabricTaupe, bedCx - 0.42, matZ0 + 0.33, 0.42, -0.14, -0.06, br.fork('t1')));
    g.add(pillow('bed:cushionTaupe', 0.46, 0.2, 0.46, M.fabricTaupe, bedCx + 0.3, matZ0 + 0.33, 0.45, 0.1, 0.05, br.fork('t2')));
    // 前排：米色織紋抱枕斜靠在灰褐抱枕上
    g.add(pillow('bed:cushionOat', 0.42, 0.19, 0.42, M.fabricOat, bedCx - 0.14, matZ0 + 0.47, 0.6, 0.2, 0.12, br.fork('o1')));
    // 腰枕：加厚、邊緣縫線較厚、皺褶多一點，避免看起來像硬板
    g.add(pillow('bed:cushionLinen', 0.55, 0.24, 0.34, M.fabricLinen, bedCx + 0.52, matZ0 + 0.5, 0.62, -0.22, -0.08, br.fork('o2'), false, { seam: 0.06, wrinkle: 0.016 }));
    return g;
  }

  /** 枕頭內縮滾邊：沿 cushion 頂面與底面各一圈（與 geo.cushion 的鼓起公式一致） */
  function pipingLoop(w, h, d, inset, seam, name) {
    const geos = [];
    const N = 80, k = 1 - inset;
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i < N; i++) {
        const p = (i / N) * 4, s = Math.floor(p), f = p - s;
        const [nx, nz] = [[-k + 2 * k * f, -k], [k, -k + 2 * k * f], [k - 2 * k * f, k], [-k, k - 2 * k * f]][s];
        const e = (1 - nx ** 4) * (1 - nz ** 4);
        const thick = seam + (1 - seam) * Math.sqrt(Math.max(e, 0));
        pts.push([nx * w / 2, side * (h / 2 * thick + 0.0035), nz * d / 2]);
      }
      geos.push(G.tube(pts, 0.004, { segments: N, radial: 5, closed: true }));
    }
    return mergedMesh(geos, M.fabricCharcoal, name, { cast: false });
  }

  // ─────────────────────────────────────────────────────
  // 圓筒紙燈（燈 1）
  // ─────────────────────────────────────────────────────
  function buildPaperLamp() {
    const g = new THREE.Group();
    g.name = `${ROOM}:paperLamp`;
    const R = LAMP.r, h = LAMP.h;
    g.add(latheAt([[0, 0], [R * 0.92, 0], [R * 0.95, 0.004], [R * 0.95, 0.018], [R * 0.9, 0.022], [0, 0.022]], M.woodOak, 'lamp:base', lamp.x, 0, lamp.z));
    // 和紙筒身：微微鼓起，頂端收口
    const prof = [[0, 0.022]];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      prof.push([R * (0.985 + 0.015 * Math.sin(Math.PI * t)), 0.022 + t * (h - 0.04)]);
    }
    prof.push([R * 0.96, h - 0.012], [R * 0.85, h], [0, h]);
    g.add(latheAt(prof, M.paperLamp, 'lamp:paper', lamp.x, 0, lamp.z, 48, { cast: false, receive: false }));
    // 竹骨細橫紋
    const rings = [];
    for (let k = 1; k < 8; k++) {
      const y = 0.022 + ((h - 0.04) * k) / 8;
      rings.push(new THREE.TorusGeometry(R * (0.985 + 0.015 * Math.sin((Math.PI * k) / 8)) + 0.001, 0.0012, 4, 48).rotateX(Math.PI / 2).translate(lamp.x, y, lamp.z));
    }
    g.add(mergedMesh(rings, M.paperWhite, 'lamp:ribs', { cast: false }));
    const light = new THREE.PointLight(L.LIGHT_COLORS.k2700, 2.2, 4, 2);
    light.name = `${ROOM}:paperLampLight`;
    light.castShadow = false;
    light.position.set(lamp.x + 0.02, h * 0.6, lamp.z + 0.02);
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
    g.add(rbXZ(seatS.x0, seatS.x1, 0, kick, seatS.z0 + 0.04, seatS.z1, M.woodOakDark, 'seat:kick'));
    g.add(rbXZ(seatS.x0, seatS.x1, kick, SEAT.h - t, seatS.z0 + 0.012, seatS.z1, M.woodOak, 'seat:body'));
    g.add(rbXZ(seatS.x0, seatS.x1, SEAT.h - t, SEAT.h, seatS.z0, seatS.z1, M.woodOak, 'seat:top', 0.005));
    g.add(rbXZ(seatW.x0, seatW.x1 - 0.04, 0, kick, seatW.z0, seatW.z1, M.woodOakDark, 'seat:kick'));
    g.add(rbXZ(seatW.x0, seatW.x1 - 0.012, kick, SEAT.h - t, seatW.z0, seatW.z1, M.woodOak, 'seat:body'));
    g.add(rbXZ(seatW.x0, seatW.x1, SEAT.h - t, SEAT.h, seatW.z0, seatS.z0 - GAP, M.woodOak, 'seat:top', 0.005));
    // 臥榻上的小深灰碗（實拍）
    g.add(latheAt([[0, 0], [0.035, 0], [0.05, 0.008], [0.065, 0.025], [0.075, 0.045], [0.071, 0.047], [0.06, 0.03], [0.045, 0.016], [0, 0.012]],
      M.stoneDark, 'seat:bowl', winS.from + (winS.to - winS.from) * 0.72, SEAT.h, seatS.z0 + 0.1));
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 南牆吊櫃（窗頂 → 天花）
  // ─────────────────────────────────────────────────────
  function buildUpperCabinets() {
    const g = new THREE.Group();
    g.name = `${ROOM}:upperCabinets`;
    const t = 0.018;
    g.add(rbXZ(up.x0, up.x1, up.y0, up.y1, up.z0 + t, up.z1, M.woodOakDark, 'upper:carcass'));
    g.add(rbXZ(up.x0, up.x1, up.y0, up.y0 + t, up.z0, up.z1, M.woodOak, 'upper:bottom'));
    const n = Math.max(1, Math.round((up.x1 - up.x0) / 0.55));
    const w = (up.x1 - up.x0) / n;
    for (let i = 0; i < n; i++) {
      const a = up.x0 + i * w + GAP / 2, b = a + w - GAP;
      g.add(rbXZ(a, b, up.y0 + t + GAP, up.y1 - GAP, up.z0 - 0.001, up.z0 + t - 0.001, M.woodOak, 'upper:door'));
    }
    // 紗簾軌道（藏在吊櫃底）
    g.add(rbXZ(up.x0, seatS.x1, up.y0 - 0.02, up.y0, up.z1 - 0.13, up.z1 - 0.09, M.metalAluminium, 'upper:track', 0.003));
    // 燈 2：吊櫃下方暖光洗紗簾
    const light = new THREE.PointLight(L.LIGHT_COLORS.k2700, 1.0, 3.2, 2);
    light.name = `${ROOM}:curtainWash`;
    light.castShadow = false;
    light.position.set((winS.from + winS.to) / 2, up.y0 - 0.15, up.z0 - 0.2);
    g.add(light);
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 白紗簾（西側收攏）＋收束的米色遮光簾
  // ─────────────────────────────────────────────────────
  function buildCurtains(r) {
    const g = new THREE.Group();
    g.name = `${ROOM}:curtains`;
    const yTop = up.y0 - 0.02, yBot = SEAT.h + 0.01;
    const ch = yTop - yBot;
    const sheerZ = up.z1 - 0.11;
    const sx0 = westClear + 0.01, sx1 = seatS.x1 - 0.02;
    const gatherW = 0.42;
    /** curtain() 面向 +z；轉 180° 讓正面朝房內（-z） */
    const hang = (geo, m, name, xL, z, opt) => {
      const o = mk(geo, m, name, opt);
      o.rotation.y = Math.PI;
      o.position.set(xL, yTop, z);
      return o;
    };
    // 紗簾：西側一段收攏（摺子密、深），其餘展開
    const wGather = gatherW, wOpen = sx1 - sx0 - wGather;
    g.add(hang(G.curtain(wGather, ch, { folds: 8, depth: 0.045, rng: r.fork('sg'), sway: 0.015 }), M.sheerCurtain, 'curtain:sheerGathered', sx0 + wGather / 2, sheerZ, { cast: false }));
    g.add(hang(G.curtain(wOpen, ch, { folds: Math.round(wOpen / 0.13), depth: 0.028, rng: r.fork('so'), sway: 0.02 }), M.sheerCurtain, 'curtain:sheer', sx0 + wGather + wOpen / 2, sheerZ + 0.012, { cast: false }));

    // 遮光簾：curtain() 再收腰，做成綁起來的一束
    const bw = 0.5, bz = sheerZ - 0.08, bx = sx0 + bw / 2 + 0.005;
    const tieT = 0.58;                       // 綁帶位置（由上往下比例）
    const geo = G.curtain(bw, ch, { folds: 6, depth: 0.04, rng: r.fork('bo'), sway: 0.01 });
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = -y / ch;
      const waist = 1 - 0.58 * Math.exp(-(((t - tieT) / 0.22) ** 2)) - 0.25 * Math.max(0, t - tieT) * (1 - (t - 1) ** 2 * 0);
      const below = t > tieT ? 0.12 * ((t - tieT) / (1 - tieT)) : 0;   // 綁帶下方再散開
      const s = Math.min(1, waist + below);
      p.setXYZ(i, x * s, y, z * (0.6 + 0.6 * s) + (1 - s) * 0.02);
    }
    geo.computeVertexNormals();
    G.worldUV(geo);
    g.add(hang(geo, M.fabricLinen, 'curtain:blackout', bx, bz));
    // 背面也要看得到（布料材質是單面）：疊一層翻面的
    const back = geo.clone();
    const idx = back.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    back.computeVertexNormals();
    g.add(hang(back, M.fabricLinen, 'curtain:blackoutBack', bx, bz, { cast: false }));
    // 綁帶：繞在收腰處的一圈布帶
    const tieY = yTop - tieT * ch;
    const tw = bw * 0.32 / 2, td = 0.05;
    const ring = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ring.push([bx + Math.cos(a) * (tw + 0.012), tieY + Math.sin(a * 2) * 0.004, bz + Math.sin(a) * td]);
    }
    g.add(mk(G.tube(ring, 0.011, { segments: 48, radial: 8, closed: true }), M.fabricOat, 'curtain:tieback'));
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
    g.add(rb(VANITY.w, top, VANITY.d, M.woodOak, 'vanity:top', (x0 + x1) / 2, VANITY.h - top, (z0 + z1) / 2, 0.005));
    g.add(rbXZ(x0, x0 + t, 0, VANITY.h - top - GAP, z0, z1, M.woodOak, 'vanity:side'));
    g.add(rbXZ(x1 - t, x1, 0, VANITY.h - top - GAP, z0, z1, M.woodOak, 'vanity:side'));
    g.add(rbXZ(x0 + t, x1 - t, 0.06, VANITY.h - top, z1 - 0.015, z1, M.woodOak, 'vanity:back'));
    const dy0 = VANITY.h - top - drawerH;
    g.add(rbXZ(x0 + t, x1 - t, dy0 - 0.015, dy0, z0 + 0.02, z1 - 0.015, M.woodOak, 'vanity:drawerBase'));
    g.add(rbXZ(x0 + t, x1 - t, dy0, VANITY.h - top, z0 + 0.02, z1 - 0.015, M.woodOakDark, 'vanity:drawerBox'));
    const dw = (x1 - x0 - 2 * t) / 2;
    for (let i = 0; i < 2; i++) {
      const a = x0 + t + i * dw + GAP, b = a + dw - 2 * GAP;
      g.add(rbXZ(a, b, dy0 + GAP, VANITY.h - top - GAP, z0, z0 + 0.019, M.woodOak, 'vanity:drawer'));
      // 無把手：下緣取手溝
      g.add(rbXZ(a + 0.012, b - 0.012, dy0 + GAP, dy0 + 0.014, z0 - 0.0015, z0 + 0.004, M.woodOakDark, 'vanity:pull', 0.002, { cast: false }));
    }
    // 面紙盒（木盒＋紙巾）
    const tx = x0 + 0.2, tz = (z0 + z1) / 2 + 0.03;
    g.add(rb(0.24, 0.09, 0.13, M.woodOak, 'vanity:tissueBox', tx, VANITY.h, tz, 0.006));
    const tissue = mk(G.cushion(0.09, 0.04, 0.06, { seam: 0.3, wrinkle: 0.004, rng: rng.fork('tissue') }), M.paperWhite, 'vanity:tissue');
    tissue.rotation.set(-1.2, 0, 0.3);
    tissue.position.set(tx, VANITY.h + 0.115, tz);
    g.add(tissue);
    g.add(latheAt([[0, 0], [0.03, 0], [0.045, 0.006], [0.062, 0.024], [0.07, 0.05], [0.066, 0.052], [0.056, 0.03], [0.04, 0.017], [0, 0.014]],
      M.stoneDark, 'vanity:bowl', x1 - 0.18, VANITY.h, (z0 + z1) / 2));
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 毛圈蘑菇凳（車削）
  // ─────────────────────────────────────────────────────
  function buildStool() {
    const g = new THREE.Group();
    g.name = `${ROOM}:stool`;
    const R = STOOL.r, h = STOOL.h;
    g.add(latheAt([[0, 0], [R * 0.8, 0], [R * 0.84, 0.01], [R * 0.82, 0.04], [R * 0.68, 0.1], [R * 0.56, 0.18], [R * 0.52, h - 0.1], [0, h - 0.1]],
      M.fabricBoucle, 'stool:stem', stool.x, 0, stool.z, 48));
    const capY = h - 0.13;
    g.add(latheAt([[0, 0], [R * 0.7, 0], [R * 0.9, 0.008], [R * 0.99, 0.03], [R, 0.06], [R * 0.97, 0.095], [R * 0.86, 0.12], [R * 0.6, 0.13], [0, 0.132]],
      M.fabricBoucle, 'stool:cap', stool.x, capY, stool.z, 48));
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
    g.add(rbXZ(x0 + 0.05, x1, 0, plinth, z0, z1, M.paintCream, 'wardrobe:plinth'));
    g.add(rbXZ(x0 + t, x1, plinth, topY, z0, z1, M.paintCream, 'wardrobe:carcass'));
    const n = Math.max(1, Math.round((z1 - z0) / 0.6));
    const w = (z1 - z0) / n;
    for (let i = 0; i < n; i++) {
      const a = z0 + i * w + GAP / 2, b = a + w - GAP;
      g.add(rbXZ(x0, x0 + t, plinth + GAP, topY - GAP, a, b, M.paintWhite, 'wardrobe:door', 0.004));
    }
    return g;
  }

  // ─────────────────────────────────────────────────────
  // 踢腳板（露出的牆段）
  // ─────────────────────────────────────────────────────
  function buildBaseboards() {
    const g = new THREE.Group();
    g.name = `${ROOM}:baseboards`;
    const h = 0.06, t = 0.01;
    g.add(rbXZ(I.x0, hb.x0, 0, h, I.z0, I.z0 + t, M.baseboard, 'baseboard:north', 0.002));
    g.add(rbXZ(I.x0, I.x0 + t, 0, h, I.z0 + t, seatW.z0, M.baseboard, 'baseboard:west', 0.002));
    g.add(rbXZ(I.x1 - t, I.x1, 0, h, swing.z1, ward.z0, M.baseboard, 'baseboard:east', 0.002));
    g.add(rbXZ(I.x1 - t, I.x1, 0, h, ward.z1, van.z0, M.baseboard, 'baseboard:east', 0.002));
    return g;
  }
}
