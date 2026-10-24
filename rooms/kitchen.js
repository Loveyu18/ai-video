/**
 * rooms/kitchen.js — 廚房（依屋主實拍 p06 重做）
 *
 * 配置（全部由 layout.js 推出，不寫死世界座標）：
 *   - 一字型廚具靠西牆 x0，由南（門那側）往北：
 *       瓦斯爐＋下方嵌入式烤箱 → 抽屜 → 下嵌水槽 → 北端空檯面
 *   - 檯面到吊櫃之間整片黑玻璃背牆（含插座）
 *   - 淺橡木無把手吊櫃一路到天花，南端下掛玻璃斜面薄型抽油煙機，北端嵌白色微波爐
 *   - 北、東、南牆從地到天花貼 60×120 大板白大理石紋磚（含磚縫）
 *   - 東北角：直立吸塵器、藍色掃把畚箕、紙箱
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import * as G from '../geo.js';

const ROOM = 'kitchen';

// —— 尺寸常數（公尺） ——
const DEPTH = 0.6;            // 下櫃深
const TOE = 0.1;              // 踢腳高
const TOE_RECESS = 0.06;
const CTR_T = 0.04;           // 檯面厚
const CTR_TOP = 0.88;         // 檯面高
const CAB_TOP = CTR_TOP - CTR_T;
const OVERHANG = 0.02;
const FRONT_T = 0.02;         // 門片厚
const GAP = 0.006;            // 無把手門片的細溝
const WALL_CAB_D = 0.35;      // 吊櫃深
const WALL_CAB_BOTTOM = 1.52;
const CEIL_GAP = 0.005;       // 吊櫃頂與天花留縫
const TILE_W = 1.2, TILE_H = 0.6, TILE_T = 0.01, GROUT = 0.003;
const GLASS_T = 0.006;        // 黑玻璃背牆厚

// 由南往北的分段長度
const SEG_STOVE = 0.8;
const SEG_DRAWER = 0.4;
const SEG_SINK = 0.75;

export function build() {
  const rng = rngFor(ROOM);
  const root = new THREE.Group();
  root.name = `room:${ROOM}`;

  const I = L.roomInterior(ROOM);
  const H = L.CEILING_HEIGHT;
  const X0 = I.x0, X1 = I.x1, Z0 = I.z0, Z1 = I.z1;
  const swing = L.doorSwingZone(ROOM);
  const southDoors = L.openingsOfRoom(ROOM).filter((o) => o.side === 'z1');

  // 廚具沿西牆；北端讓出北牆磁磚厚度
  const RZ0 = Z0 + TILE_T + 0.002;      // 廚具北端
  const RZ1 = Z1;                       // 廚具南端（南牆在廚具後段不貼磚）
  const FX = X0 + DEPTH;                // 下櫃門片外側
  if (swing && FX + OVERHANG > swing.x0) throw new Error('kitchen: 廚具會撞到門的掃掠區');

  // 分段（z 範圍，南→北）
  const zStove = [RZ1 - SEG_STOVE, RZ1];
  const zDrawer = [zStove[0] - SEG_DRAWER, zStove[0]];
  const zSink = [zDrawer[0] - SEG_SINK, zDrawer[0]];
  const zNorth = [RZ0, zSink[0]];

  // ───────────────────── 小工具 ─────────────────────
  const mesh = (geo, mat, name, parent = root, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `${ROOM}:${name}`;
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** 倒角方塊（預設 2mm 倒角）：依 [x0,x1]×[y0,y1]×[z0,z1] 擺放 */
  const boxAt = (name, mat, x0, x1, y0, y1, z0, z1, parent = root, shadow = true, r = 0.002, seg = 1) => {
    const m = mesh(G.roundedBox(x1 - x0, y1 - y0, z1 - z0, r, seg), mat, name, parent, shadow);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return m;
  };
  const cyl = (name, mat, rTop, rBot, h, x, y, z, seg = 24, parent = root) => {
    const m = mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, name, parent);
    m.position.set(x, y + h / 2, z);
    return m;
  };
  const lathe = (name, mat, pts, x, y, z, seg = 28, parent = root) => {
    const m = mesh(G.lathe(pts, seg), mat, name, parent);
    m.position.set(x, y, z);
    return m;
  };
  const group = (name, parent = root) => {
    const g = new THREE.Group();
    g.name = `${ROOM}:${name}`;
    parent.add(g);
    return g;
  };
  /** 管件（geo.tube）：points 為世界座標 */
  const tubeAt = (name, mat, pts, r, parent = root, opts = {}) => mesh(G.tube(pts, r, opts), mat, name, parent);
  /** 圓弧取點（2D） */
  const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  /**
   * 帶孔的倒角擠出板：outer / holes 為 2D 點（逆時針 / 任意），厚度沿 +z（0~depth）。
   * 倒角往內收，外形尺寸＝輪廓尺寸。
   */
  const extrudeHoles = (outer, holes, depth, bevel = 0.003) => {
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
      bevelOffset: -bevel, bevelSegments: 3, curveSegments: 12,
    });
    geo.translate(0, 0, bevel);
    return geo;
  };
  /** 圓角矩形 2D 輪廓（逆時針），範圍 [x0,x1]×[y0,y1]，r 可給四角各自半徑 [右下,右上,左上,左下] */
  const rrect = (x0, x1, y0, y1, r) => {
    const [r0, r1, r2, r3] = Array.isArray(r) ? r : [r, r, r, r];
    const pts = [];
    // 右下 → 右上 → 左上 → 左下
    const cs = [[x1 - r0, y0 + r0, r0, -Math.PI / 2], [x1 - r1, y1 - r1, r1, 0], [x0 + r2, y1 - r2, r2, Math.PI / 2], [x0 + r3, y0 + r3, r3, Math.PI]];
    for (const [cx, cy, rr, a0] of cs) {
      if (rr <= 0) pts.push([cx, cy]);
      else pts.push(...arc(cx, cy, rr, a0, a0 + Math.PI / 2, 6));
    }
    return pts;
  };
  /** 面向 +x 的面板：z 範圍 [a,b]、高度 [y0,y1]、前表面在 xFront */
  const panelX = (name, mat, xFront, t, a, b, y0, y1, parent, gap = GAP, r = 0.003) => {
    const geo = G.roundedBox(t, y1 - y0 - gap, b - a - gap, r, 2);
    const m = mesh(geo, mat, name, parent);
    m.position.set(xFront - t / 2, (y0 + y1) / 2, (a + b) / 2);
    return m;
  };

  // ═════════════════════ 下櫃（淺橡木、無把手細溝） ═════════════════════
  const base = group('baseCabinets');
  // 門片後的深色底板，讓門縫看起來是細黑溝
  boxAt('grooveBacker', M.paintCharcoal, FX - FRONT_T - 0.004, FX - FRONT_T, TOE, CAB_TOP, RZ0, RZ1, base, false);
  boxAt('toeKick', M.paintCharcoal, X0, FX - TOE_RECESS, 0, TOE, RZ0, RZ1, base);

  const front = (name, a, b, y0, y1) => panelX(name, M.woodOak, FX, FRONT_T, a, b, y0, y1, base);
  // 北端：單門
  front('front:north', ...zNorth, TOE, CAB_TOP);
  // 水槽下：雙門
  const sinkMidZ = (zSink[0] + zSink[1]) / 2;
  front('front:sinkN', zSink[0], sinkMidZ, TOE, CAB_TOP);
  front('front:sinkS', sinkMidZ, zSink[1], TOE, CAB_TOP);
  // 抽屜：三層（上淺下深），頂部留取手溝
  {
    const hs = [0.2, 0.25, 0.29];
    let y = CAB_TOP - 0.03;
    hs.forEach((r, i) => {
      const h = (CAB_TOP - 0.03 - TOE) * r / 0.74;
      front(`front:drawer${i}`, ...zDrawer, y - h, y);
      y -= h;
    });
  }
  // 爐下：嵌入式烤箱＋下方抽屜＋上方淺面板
  const OVEN_H = 0.4, OVEN_W = 0.58;
  const ovenY1 = CAB_TOP - 0.06, ovenY0 = ovenY1 - OVEN_H;
  const ovenZ1 = zStove[0] + 0.02 + OVEN_W, ovenZ0 = zStove[0] + 0.02;   // 靠抽屜側
  front('front:stoveTop', ...zStove, ovenY1 + 0.005, CAB_TOP);
  front('front:stoveBottom', ...zStove, TOE, ovenY0 - 0.005);
  if (zStove[1] - ovenZ1 > 0.05) front('front:stoveSide', ovenZ1, zStove[1], ovenY0 - 0.005, ovenY1 + 0.005);
  const oven = group('oven');
  boxAt('oven:frame', M.metalBrushed, FX - FRONT_T, FX + 0.004, ovenY0, ovenY1, ovenZ0, ovenZ1, oven);
  const ovenDoorZ1 = ovenZ1 - 0.12;
  boxAt('oven:door', M.glassBlack, FX + 0.004, FX + 0.012, ovenY0 + 0.03, ovenY1 - 0.03, ovenZ0 + 0.02, ovenDoorZ1, oven);
  boxAt('oven:window', M.screenOff, FX + 0.012, FX + 0.013, ovenY0 + 0.07, ovenY1 - 0.08, ovenZ0 + 0.06, ovenDoorZ1 - 0.04, oven);
  boxAt('oven:sticker', M.paperWhite, FX + 0.0125, FX + 0.0135, ovenY0 + 0.06, ovenY0 + 0.1, ovenZ0 + 0.06, ovenZ0 + 0.1, oven);
  boxAt('oven:display', M.screenOff, FX + 0.004, FX + 0.008, ovenY1 - 0.08, ovenY1 - 0.045, ovenDoorZ1 + 0.03, ovenZ1 - 0.03, oven);
  boxAt('oven:displayDigits', M.lampBulb, FX + 0.008, FX + 0.009, ovenY1 - 0.072, ovenY1 - 0.055, ovenDoorZ1 + 0.045, ovenZ1 - 0.045, oven, false);
  for (const [i, dy] of [[0, 0.17], [1, 0.27]]) {
    const knob = cyl(`oven:knob${i}`, M.metalChrome, 0.022, 0.022, 0.02, 0, 0, 0, 24, oven);
    knob.rotation.z = -Math.PI / 2;
    knob.position.set(FX + 0.014, ovenY1 - dy, (ovenDoorZ1 + ovenZ1) / 2);
  }
  // 門把：不鏽鋼彎管，兩端彎回門片
  {
    const hy = ovenY1 - 0.05;
    tubeAt('oven:handle', M.metalBrushed, [
      [FX + 0.012, hy, ovenZ0 + 0.06], [FX + 0.03, hy, ovenZ0 + 0.075], [FX + 0.036, hy, ovenZ0 + 0.12],
      [FX + 0.036, hy, ovenDoorZ1 - 0.08], [FX + 0.03, hy, ovenDoorZ1 - 0.035], [FX + 0.012, hy, ovenDoorZ1 - 0.02],
    ], 0.007, oven, { segments: 48, radial: 12 });
  }
  for (let k = 0; k < 3; k++) {
    boxAt('oven:button', M.plasticBlack, FX + 0.004, FX + 0.008, ovenY0 + 0.05 + k * 0.03, ovenY0 + 0.07 + k * 0.03, ovenDoorZ1 + 0.035, ovenZ1 - 0.035, oven);
  }

  // ═════════════════════ 檯面（白色石英、水槽開孔） ═════════════════════
  const ctr = group('countertop');
  const SW = 0.5, SD = 0.4;                               // 水槽開孔（沿 z × 沿 x）
  const sinkZ = sinkMidZ, sinkX = X0 + 0.07 + SD / 2;
  const cx1 = FX + OVERHANG;
  // 櫃體：水槽下方的頂板降到水槽底下，不然會封住水槽
  {
    const cxb = FX - FRONT_T - 0.004;
    const a = sinkZ - SW / 2 - 0.01, b = sinkZ + SW / 2 + 0.01;
    boxAt('carcass:north', M.paintWhite, X0, cxb, TOE, CAB_TOP, RZ0, a, base);
    boxAt('carcass:sink', M.paintWhite, X0, cxb, TOE, CTR_TOP - 0.23, a, b, base);
    boxAt('carcass:south', M.paintWhite, X0, cxb, TOE, CAB_TOP, b, RZ1, base);
  }
  {
    // 一整塊石英檯面：2D 輪廓 (x, -z) 擠出後轉成水平，前緣與水槽開孔都有 3mm 倒角
    const outer = rrect(X0, cx1, -RZ1, -RZ0, [0.004, 0.004, 0, 0]);
    const hole = rrect(sinkX - SD / 2, sinkX + SD / 2, -(sinkZ + SW / 2), -(sinkZ - SW / 2), 0.03);
    const geo = extrudeHoles(outer, [hole], CTR_T, 0.003);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, CAB_TOP, 0);
    mesh(G.worldUV(geo), M.stoneCountertop, 'counter', ctr);
  }

  // ═════════════════════ 水槽與龍頭 ═════════════════════
  const sink = group('sink');
  const sb = CTR_TOP - 0.2, wt = 0.008;
  const sx0 = sinkX - SD / 2, sx1 = sinkX + SD / 2, sz0 = sinkZ - SW / 2, sz1 = sinkZ + SW / 2;
  boxAt('sink:bottom', M.metalBrushed, sx0, sx1, sb, sb + wt, sz0, sz1, sink);
  boxAt('sink:wallBack', M.metalBrushed, sx0, sx0 + wt, sb, CTR_TOP - 0.002, sz0, sz1, sink);
  boxAt('sink:wallFront', M.metalBrushed, sx1 - wt, sx1, sb, CTR_TOP - 0.002, sz0, sz1, sink);
  boxAt('sink:wallN', M.metalBrushed, sx0, sx1, sb, CTR_TOP - 0.002, sz0, sz0 + wt, sink);
  boxAt('sink:wallS', M.metalBrushed, sx0, sx1, sb, CTR_TOP - 0.002, sz1 - wt, sz1, sink);
  cyl('sink:drain', M.metalChrome, 0.042, 0.042, 0.004, sinkX + 0.05, sb + wt, sinkZ - 0.1, 24, sink);
  cyl('sink:drainHole', M.plasticBlack, 0.014, 0.014, 0.005, sinkX + 0.05, sb + wt, sinkZ - 0.1, 12, sink);

  // 黑色鵝頸龍頭（出水口朝 +x）
  const fX = X0 + 0.045, fZ = sinkZ - 0.04;
  // 底座（車削，上緣圓潤）
  lathe('faucet:base', M.metalBlack, [[0, 0], [0.029, 0], [0.03, 0.004], [0.027, 0.03], [0.02, 0.05], [0.013, 0.056], [0, 0.056]], fX, CTR_TOP, fZ, 32, sink);
  // 握把座＋單把手
  const hub = mesh(G.lathe([[0, 0], [0.017, 0], [0.018, 0.03], [0.015, 0.038], [0, 0.04]], 24), M.metalBlack, 'faucet:leverHub', sink);
  hub.rotation.x = -Math.PI / 2;
  hub.position.set(fX, CTR_TOP + 0.11, fZ + 0.012);
  tubeAt('faucet:lever', M.metalBlack, [
    [fX, CTR_TOP + 0.11, fZ + 0.05], [fX + 0.01, CTR_TOP + 0.13, fZ + 0.08], [fX + 0.02, CTR_TOP + 0.16, fZ + 0.12],
  ], 0.006, sink, { segments: 16, radial: 10 });
  // 鵝頸：一根連續彎管
  const neckPts = [
    [fX, CTR_TOP + 0.05, fZ], [fX, CTR_TOP + 0.2, fZ], [fX, CTR_TOP + 0.36, fZ],
    [fX + 0.03, CTR_TOP + 0.45, fZ], [fX + 0.11, CTR_TOP + 0.48, fZ], [fX + 0.19, CTR_TOP + 0.45, fZ],
    [fX + 0.23, CTR_TOP + 0.38, fZ], [fX + 0.24, CTR_TOP + 0.31, fZ],
  ];
  tubeAt('faucet:neck', M.metalBlack, neckPts, 0.012, sink, { segments: 80, radial: 16 });
  lathe('faucet:aerator', M.metalBlack, [[0, 0], [0.011, 0], [0.0135, 0.004], [0.0135, 0.03], [0.012, 0.034], [0, 0.034]], fX + 0.24, CTR_TOP + 0.285, fZ, 20, sink);
  // 淨水龍頭（不鏽鋼細管）
  const fz2 = sinkZ + 0.13;
  lathe('filterTap:base', M.metalChrome, [[0, 0], [0.019, 0], [0.019, 0.004], [0.014, 0.02], [0.009, 0.035], [0, 0.035]], fX, CTR_TOP, fz2, 24, sink);
  tubeAt('filterTap:neck', M.metalChrome, [
    [fX, CTR_TOP + 0.03, fz2], [fX, CTR_TOP + 0.25, fz2], [fX + 0.03, CTR_TOP + 0.34, fz2],
    [fX + 0.1, CTR_TOP + 0.36, fz2], [fX + 0.16, CTR_TOP + 0.32, fz2], [fX + 0.17, CTR_TOP + 0.26, fz2],
  ], 0.0065, sink, { segments: 64, radial: 12 });
  const ftKnob = mesh(G.lathe([[0, 0], [0.012, 0], [0.012, 0.02], [0, 0.022]], 16), M.metalChrome, 'filterTap:knob', sink);
  ftKnob.position.set(fX, CTR_TOP + 0.2, fz2);
  ftKnob.rotation.z = -Math.PI / 2;

  // ═════════════════════ 兩口黑玻璃瓦斯爐 ═════════════════════
  const stove = group('stove');
  const stZ = (zStove[0] + zStove[1]) / 2;
  const stX = X0 + 0.3;
  const gTop = CTR_TOP + 0.01;
  boxAt('stove:glass', M.glassBlack, stX - 0.24, stX + 0.24, CTR_TOP, gTop, stZ - 0.36, stZ + 0.36, stove);
  boxAt('stove:trim', M.metalBrushed, stX - 0.245, stX + 0.245, CTR_TOP, CTR_TOP + 0.006, stZ - 0.365, stZ + 0.365, stove);
  for (const [i, dz] of [[0, -0.18], [1, 0.18]]) {
    const bx = stX - 0.02, bz = stZ + dz;
    // 承液盤（不鏽鋼，車削出淺碟）＋黃銅色爐頭＋黑色爐蓋
    lathe(`stove:burner${i}:drip`, M.metalBrushed, [
      [0.03, 0.004], [0.06, 0.003], [0.082, 0.001], [0.085, 0], [0.087, 0.002], [0.084, 0.006], [0.06, 0.008], [0.048, 0.012], [0.046, 0.014],
    ], bx, gTop, bz, 48, stove);
    lathe(`stove:burner${i}:crown`, M.metalBrushed, [
      [0, 0.004], [0.05, 0.004], [0.052, 0.01], [0.052, 0.022], [0.048, 0.025], [0, 0.025],
    ], bx, gTop, bz, 40, stove);
    lathe(`stove:burner${i}:cap`, M.metalBlack, [
      [0, 0.024], [0.044, 0.024], [0.046, 0.027], [0.043, 0.031], [0.03, 0.034], [0, 0.035],
    ], bx, gTop, bz, 40, stove);
    // 爐架：外圈圓環＋四支往內的爪（各自往下彎成腳）
    const gy = gTop + 0.038, GR = 0.112;
    const ringPts = Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return [bx + Math.cos(a) * GR, gy, bz + Math.sin(a) * GR];
    });
    tubeAt(`stove:burner${i}:grateRing`, M.metalBlack, ringPts, 0.0045, stove, { segments: 72, radial: 8, closed: true });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const c = Math.cos(a), sn = Math.sin(a);
      const at = (r, y) => [bx + c * r, y, bz + sn * r];
      tubeAt(`stove:burner${i}:grateArm`, M.metalBlack, [
        at(0.055, gy + 0.006), at(0.08, gy + 0.004), at(GR, gy), at(GR + 0.012, gy - 0.015), at(GR + 0.014, gTop + 0.002),
      ], 0.004, stove, { segments: 24, radial: 8 });
    }
    // 旋鈕（車削）＋握把
    const knob = lathe(`stove:knob${i}`, M.metalChrome, [[0, 0], [0.024, 0], [0.025, 0.004], [0.022, 0.018], [0.019, 0.022], [0, 0.023]], stX + 0.17, gTop, bz, 32, stove);
    knob.rotation.y = rng.range(0, Math.PI);
    boxAt(`stove:knob${i}:grip`, M.plasticBlack, stX + 0.155, stX + 0.185, gTop + 0.02, gTop + 0.034, bz - 0.004, bz + 0.004, stove, true, 0.003, 2);
  }

  // ═════════════════════ 黑玻璃背牆＋插座 ═════════════════════
  const back = group('backsplash');
  boxAt('backsplash:glass', M.glassBlack, X0, X0 + GLASS_T, CTR_TOP, WALL_CAB_BOTTOM, RZ0, RZ1, back);
  const outlet = (name, z, y) => {
    boxAt(`${name}:plate`, M.plasticWhite, X0 + GLASS_T, X0 + GLASS_T + 0.008, y - 0.035, y + 0.035, z - 0.06, z + 0.06, back);
    for (const dz of [-0.025, 0.025]) {
      for (const dy of [-0.008, 0.008]) {
        boxAt(`${name}:slot`, M.plasticBlack, X0 + GLASS_T + 0.008, X0 + GLASS_T + 0.009, y + dy - 0.005, y + dy + 0.005, z + dz - 0.002, z + dz + 0.002, back, false);
      }
    }
  };
  outlet('outlet0', (zDrawer[0] + zDrawer[1]) / 2 - 0.05, CTR_TOP + 0.3);
  outlet('outlet1', (zNorth[0] + zNorth[1]) / 2 + 0.05, CTR_TOP + 0.3);

  // ═════════════════════ 吊櫃（到天花）＋微波爐＋抽油煙機 ═════════════════════
  const upper = group('wallCabinets');
  const UX1 = X0 + WALL_CAB_D;
  const UTOP = H - CEIL_GAP;
  boxAt('upper:carcass', M.paintWhite, X0, UX1 - FRONT_T - 0.004, WALL_CAB_BOTTOM, UTOP, RZ0, RZ1, upper);
  boxAt('upper:grooveBacker', M.paintCharcoal, UX1 - FRONT_T - 0.004, UX1 - FRONT_T, WALL_CAB_BOTTOM, UTOP, RZ0, RZ1, upper, false);
  const upperFront = (name, a, b, y0, y1) => panelX(name, M.woodOak, UX1, FRONT_T, a, b, y0, y1, upper);
  const SPLIT_Y = 2.38;                      // 上方掀門與下方門片分割線
  // 北端：嵌入式白色微波爐（霧玻璃門）
  const MW_W = 0.52, MW_H = 0.32;
  const mwZ0 = RZ0 + 0.02, mwZ1 = mwZ0 + MW_W;
  const mw = group('microwave', upper);
  boxAt('microwave:body', M.plasticWhite, X0 + 0.02, UX1 + 0.01, WALL_CAB_BOTTOM, WALL_CAB_BOTTOM + MW_H, mwZ0, mwZ1, mw);
  boxAt('microwave:frame', M.plasticWhite, UX1 + 0.01, UX1 + 0.02, WALL_CAB_BOTTOM, WALL_CAB_BOTTOM + MW_H, mwZ0, mwZ1, mw);
  boxAt('microwave:door', M.glassFrosted, UX1 + 0.02, UX1 + 0.024, WALL_CAB_BOTTOM + 0.035, WALL_CAB_BOTTOM + MW_H - 0.035, mwZ0 + 0.035, mwZ1 - 0.035, mw, false);
  boxAt('microwave:cavity', M.paintCharcoal, UX1 + 0.019, UX1 + 0.02, WALL_CAB_BOTTOM + 0.06, WALL_CAB_BOTTOM + MW_H - 0.06, mwZ0 + 0.06, mwZ1 - 0.06, mw, false);
  boxAt('microwave:handle', M.plasticWhite, UX1 + 0.024, UX1 + 0.034, WALL_CAB_BOTTOM + 0.004, WALL_CAB_BOTTOM + 0.02, mwZ0 + 0.1, mwZ1 - 0.1, mw);
  upperFront('upper:aboveMicrowave', RZ0, mwZ1 + 0.02, WALL_CAB_BOTTOM + MW_H + 0.01, SPLIT_Y);
  // 其餘吊櫃：門片寬約 0.4，平均分割
  const doorsFrom = mwZ1 + 0.02;
  const nDoors = Math.max(1, Math.round((RZ1 - doorsFrom) / 0.42));
  const dw = (RZ1 - doorsFrom) / nDoors;
  for (let k = 0; k < nDoors; k++) {
    upperFront(`upper:door${k}`, doorsFrom + k * dw, doorsFrom + (k + 1) * dw, WALL_CAB_BOTTOM, SPLIT_Y);
  }
  // 頂層掀門
  const nTop = Math.max(1, Math.round((RZ1 - RZ0) / 0.62));
  const tw = (RZ1 - RZ0) / nTop;
  for (let k = 0; k < nTop; k++) upperFront(`upper:topFlap${k}`, RZ0 + k * tw, RZ0 + (k + 1) * tw, SPLIT_Y, UTOP);
  // 吊櫃底 LED 燈條（照在黑玻璃上）
  boxAt('upper:ledStrip', M.ledStrip, X0 + 0.04, X0 + 0.055, WALL_CAB_BOTTOM - 0.006, WALL_CAB_BOTTOM, mwZ1 + 0.03, zStove[0] - 0.03, upper, false);

  // 玻璃斜面薄型抽油煙機（爐子上方、吊櫃下）
  const hood = group('hood');
  const hz0 = zStove[0] + 0.02, hz1 = zStove[1] - 0.01;
  const HOOD_H = 0.11;
  const hb = WALL_CAB_BOTTOM - HOOD_H;
  boxAt('hood:body', M.metalBrushed, X0 + GLASS_T, X0 + 0.42, hb, WALL_CAB_BOTTOM, hz0, hz1, hood);
  boxAt('hood:underside', M.metalAluminium, X0 + 0.03, X0 + 0.4, hb - 0.004, hb, hz0 + 0.03, hz1 - 0.03, hood);
  for (const dz of [-0.2, 0.2]) {
    const lamp = cyl('hood:lamp', M.lampBulb, 0.03, 0.03, 0.006, X0 + 0.25, hb - 0.01, (hz0 + hz1) / 2 + dz, 20, hood);
    lamp.castShadow = false;
    cyl('hood:lampRing', M.metalChrome, 0.036, 0.036, 0.004, X0 + 0.25, hb - 0.005, (hz0 + hz1) / 2 + dz, 20, hood);
  }
  // 前方斜玻璃擋板：從機身前緣往外、往上翹
  const visorLen = 0.2, visorAng = 0.32;
  const visor = mesh(G.roundedBox(visorLen, 0.006, hz1 - hz0, 0.0025, 2), M.glassFrosted, 'hood:glassVisor', hood, false);
  visor.rotation.z = visorAng;
  visor.position.set(X0 + 0.42 + Math.cos(visorAng) * visorLen / 2, hb + 0.02 + Math.sin(visorAng) * visorLen / 2, (hz0 + hz1) / 2);
  const tipX = X0 + 0.42 + Math.cos(visorAng) * visorLen, tipY = hb + 0.02 + Math.sin(visorAng) * visorLen;
  const trim = cyl('hood:visorTrim', M.metalChrome, 0.004, 0.004, hz1 - hz0, 0, 0, 0, 8, hood);
  trim.rotation.x = Math.PI / 2;
  trim.position.set(tipX, tipY, (hz0 + hz1) / 2);
  boxAt('hood:panel', M.plasticWhite, X0 + 0.38, X0 + 0.42, hb, hb + 0.04, hz0 + 0.02, hz0 + 0.2, hood);
  for (let k = 0; k < 4; k++) boxAt('hood:button', M.plasticBlack, X0 + 0.42, X0 + 0.423, hb + 0.012, hb + 0.026, hz0 + 0.04 + k * 0.035, hz0 + 0.06 + k * 0.035, hood);
  // 機身上方遮板（吊櫃底到抽油煙機頂之間的木作收邊）
  if (tipX > UX1) boxAt('hood:safety', M.paintCharcoal, UX1, Math.min(tipX, FX), WALL_CAB_BOTTOM - 0.001, WALL_CAB_BOTTOM, hz0, hz1, hood, false);

  // ═════════════════════ 大理石紋大板磚（北、東、南牆） ═════════════════════
  const tiles = group('wallTiles');
  /**
   * 一面牆貼 60×120 橫向大板磚。axis 'x'＝牆沿 x；'z'＝牆沿 z。plane 為牆面座標，nSign 指向房內。
   * holes：[u0,u1,v0,v1] 開口（門）不貼。
   */
  function tileWall(id, axis, plane, nSign, u0, u1, holes = []) {
    const buckets = new Map();        // 依門洞分區，各自成一個 mesh（包圍盒才不會蓋到門）
    const tRng = rng.fork(`tiles:${id}`);
    const edges = holes.flatMap(([h0, h1]) => [h0, h1]);
    for (let v = 0; v < H - 0.001; v += TILE_H) {
      const vTop = Math.min(v + TILE_H, H);
      for (let u = u0; u < u1 - 0.001; u += TILE_W) {
        // 每塊磚依開口切成可貼的片段 [a, b, va, vb]
        let pieces = [[u, Math.min(u + TILE_W, u1), v, vTop]];
        for (const [h0, h1, hv0, hv1] of holes) {
          if (hv1 <= v || hv0 >= vTop) continue;
          pieces = pieces.flatMap(([a, b, pv0, pv1]) => {
            if (h1 <= a || h0 >= b) return [[a, b, pv0, pv1]];
            const out = [];
            if (h0 > a) out.push([a, h0, pv0, pv1]);
            if (h1 < b) out.push([h1, b, pv0, pv1]);
            if (hv1 < pv1) out.push([Math.max(a, h0), Math.min(b, h1), hv1, pv1]);
            return out;
          });
        }
        const ou = tRng.range(0, 2), ov = tRng.range(0, 2), flip = tRng.chance(0.5);
        for (const [a, b, pv0, pv1] of pieces) {
          const pa = a + GROUT / 2, pb = b - GROUT / 2;
          const va = pv0 + GROUT / 2, vb = pv1 - (pv1 >= H ? 0 : GROUT / 2);
          if (pb - pa < 0.01 || vb - va < 0.01) continue;
          // 每塊磚 1mm 倒角，像真的磚邊
          const geo = axis === 'x'
            ? G.roundedBox(pb - pa, vb - va, TILE_T, 0.001, 1)
            : G.roundedBox(TILE_T, vb - va, pb - pa, 0.001, 1);
          const n = plane + nSign * TILE_T / 2;
          if (axis === 'x') geo.translate((pa + pb) / 2, (va + vb) / 2, n);
          else geo.translate(n, (va + vb) / 2, (pa + pb) / 2);
          // 公尺單位 UV，再給每塊磚不同的偏移／翻面，紋路才不會重複
          G.worldUV(geo);
          const uv = geo.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setXY(i, (flip ? -1 : 1) * uv.getX(i) + ou, uv.getY(i) + ov);
          const key = edges.filter((e) => e < (pa + pb) / 2).length;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(geo);
        }
      }
    }
    for (const [key, geos] of buckets) mesh(mergeGeometries(geos), M.marbleTileWall, `wallTiles:${id}:${key}`, tiles);
    // 磚縫底板
    const span = u1 - u0;
    const g = axis === 'x' ? new THREE.BoxGeometry(span, H, 0.002) : new THREE.BoxGeometry(0.002, H, span);
    const grout = mesh(g, M.groutLight, `wallTiles:${id}:grout`, tiles, false);
    if (axis === 'x') grout.position.set((u0 + u1) / 2, H / 2, plane + nSign * 0.001);
    else grout.position.set(plane + nSign * 0.001, H / 2, (u0 + u1) / 2);
    // 磚縫底板不能蓋到門洞
    if (holes.length) {
      tiles.remove(grout);
      const parts = [];
      let cur = u0;
      for (const [h0, h1, , hv1] of [...holes].sort((p, q) => p[0] - q[0])) {
        if (h0 > cur) parts.push([cur, h0, 0, H]);
        parts.push([Math.max(h0, cur), h1, hv1 + 0.001, H]);
        cur = h1;
      }
      if (cur < u1) parts.push([cur, u1, 0, H]);
      parts.forEach(([a, b, y0, y1], i) => {
        if (b - a < 0.005 || y1 - y0 < 0.005) return;
        if (axis === 'x') boxAt(`wallTiles:${id}:grout${i}`, M.groutLight, a, b, y0, y1, plane, plane + nSign * 0.002, tiles, false);
        else boxAt(`wallTiles:${id}:grout${i}`, M.groutLight, plane, plane + nSign * 0.002, y0, y1, a, b, tiles, false);
      });
    }
  }
  const wallsU0 = FX + OVERHANG + 0.002;    // 廚具前緣以東才貼（廚具後方看不到）
  tileWall('north', 'x', Z0, 1, wallsU0, X1);
  tileWall('east', 'z', X1, -1, Z0 + TILE_T, Z1 - TILE_T);
  const holes = southDoors.map((o) => [o.from, o.to, o.sill ?? 0, o.head ?? L.DOOR_HEIGHT]);
  tileWall('south', 'x', Z1, -1, wallsU0, X1, holes);
  // 廚具上方吊櫃北端／南端側面已經靠牆，廚具前緣到磚面之間的北端側邊補一條收邊
  boxAt('north:edgeTrim', M.groutLight, FX, wallsU0, 0, H, Z0, Z0 + TILE_T, tiles, false);

  // ═════════════════════ 檯面擺飾 ═════════════════════
  const props = group('props');
  const top = CTR_TOP;
  // 兩塊木砧板斜靠背牆（爐子與水槽之間）：倒角擠出、手把挖孔
  const boardZ = zDrawer[1] - 0.12;
  const BOARD_T = 0.02;
  const standBoard = (name, mat, outer, holes, x, z, lean) => {
    const g = group(name, props);
    const geo = extrudeHoles(outer, holes, BOARD_T, 0.004);
    geo.translate(0, 0, -BOARD_T / 2);
    const b = mesh(G.worldUV(geo, 0.5), mat, name, g);
    // 板面朝 +x，底部離牆、頂端靠在玻璃上
    b.rotation.set(0, Math.PI / 2, 0);
    g.position.set(x, top + 0.002, z);
    g.rotation.z = lean;
    return g;
  };
  {
    // 長形砧板：板身＋圓頭手把（肩部圓角過渡）
    const w = 0.2, h = 0.36, r = 0.028, hw = 0.042, hl = 0.12, f = 0.016;
    const outer = [
      ...arc(w / 2 - r, r, r, -Math.PI / 2, 0, 8),
      ...arc(w / 2 - r, h - r, r, 0, Math.PI / 2, 8),
      ...arc(hw / 2 + f, h + f, f, -Math.PI / 2, -Math.PI, 6),
      ...arc(0, h + hl, hw / 2, 0, Math.PI, 12),
      ...arc(-hw / 2 - f, h + f, f, 0, -Math.PI / 2, 6),
      ...arc(-w / 2 + r, h - r, r, Math.PI / 2, Math.PI, 8),
      ...arc(-w / 2 + r, r, r, Math.PI, Math.PI * 1.5, 8),
    ];
    const hole = arc(0, h + hl, 0.009, 0, Math.PI * 2, 16).slice(0, -1);
    standBoard('cuttingBoard:paddle', M.woodOakDark, outer, [hole], X0 + 0.12, boardZ, 0.16);
  }
  {
    // 圓形砧板＋短手把
    const R = 0.13, hw = 0.0225, hy = 0.33;
    const a1 = Math.acos(hw / R);
    const outer = [
      ...arc(0, R, R, Math.PI - a1, Math.PI * 2 + a1, 56),
      ...arc(0, hy, hw, 0, Math.PI, 12),
    ];
    const hole = arc(0, hy, 0.008, 0, Math.PI * 2, 16).slice(0, -1);
    standBoard('cuttingBoard:round', M.woodOak, outer, [hole], X0 + 0.19, boardZ + 0.14, 0.36);
  }
  // 桌巾＋托盤＋兩支高腳杯＋乾燥花（爐子與水槽之間偏水槽側）
  const trayZ = (zDrawer[0] + zDrawer[1]) / 2 - 0.12;
  const trayX = X0 + 0.38;
  boxAt('tableRunner', M.fabricLinen, X0 + 0.16, FX - 0.02, top, top + 0.003, trayZ - 0.2, trayZ + 0.2, props, true, 0.001);
  const TRAY_W = 0.2, TRAY_D = 0.3, TRAY_B = 0.01;
  const tray = mesh(G.extrudeRounded(G.roundedRectShape(TRAY_W, TRAY_D, 0.025), TRAY_B, 0.003), M.woodWalnut, 'tray', props);
  tray.position.set(trayX, top + 0.003, trayZ);
  {
    // 托盤邊框：外圈與內圈圓角矩形之間擠出
    const rim = extrudeHoles(
      rrect(-TRAY_W / 2, TRAY_W / 2, -TRAY_D / 2, TRAY_D / 2, 0.025),
      [rrect(-TRAY_W / 2 + 0.01, TRAY_W / 2 - 0.01, -TRAY_D / 2 + 0.01, TRAY_D / 2 - 0.01, 0.016)],
      0.012, 0.0025,
    );
    rim.rotateX(-Math.PI / 2);
    const m = mesh(G.worldUV(rim), M.woodWalnut, 'tray:rim', props);
    m.position.set(trayX, top + 0.003 + TRAY_B - 0.001, trayZ);
  }
  const trayTop = top + 0.003 + TRAY_B;
  // 高腳杯：底座、細柄、杯身（有杯壁厚度）
  const goblet = [
    [0, 0], [0.036, 0], [0.0375, 0.0015], [0.036, 0.003], [0.014, 0.007], [0.006, 0.014], [0.0042, 0.03],
    [0.0038, 0.07], [0.0045, 0.085], [0.009, 0.095], [0.022, 0.104], [0.034, 0.118], [0.041, 0.14],
    [0.042, 0.165], [0.039, 0.198], [0.0375, 0.2], [0.0365, 0.198], [0.0395, 0.165], [0.0385, 0.141],
    [0.032, 0.121], [0.02, 0.108], [0.006, 0.1], [0, 0.099],
  ];
  for (const [i, dz] of [[0, -0.07], [1, 0.07]]) {
    const gm = lathe(`goblet${i}`, M.glass, goblet, trayX, trayTop, trayZ + dz, 48, props);
    gm.castShadow = false;
  }
  // 乾燥花：細枝用彎管，往南散開平放在檯面
  const flRng = rng.fork('driedFlowers');
  const flX = X0 + 0.22, flZ = trayZ - 0.2;
  for (let k = 0; k < 11; k++) {
    const len = flRng.range(0.22, 0.32);
    const yaw = flRng.range(-0.45, 0.45);
    const lift = flRng.range(0.03, 0.08);
    const sx = flX + flRng.jitter(0, 0.006), sz = flZ - 0.08;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const pts = [0, 0.35, 0.7, 1].map((t) => [
      sx + dx * len * t + flRng.jitter(0, 0.004),
      top + 0.006 + lift * Math.sin(t * Math.PI * 0.8),
      sz + dz * len * t,
    ]);
    tubeAt('driedFlowers:stem', M.stem, pts, 0.0018, props, { segments: 12, radial: 5 });
    const tip = pts[3];
    for (let j = 0; j < 4; j++) {
      const head = mesh(new THREE.SphereGeometry(flRng.range(0.006, 0.012), 8, 6), flRng.pick([M.leafOlive, M.fabricBlush, M.rattan, M.fabricOat]), 'driedFlowers:head', props);
      head.position.set(tip[0] + flRng.jitter(0, 0.015), tip[1] + flRng.range(0, 0.012), tip[2] - flRng.range(0, 0.05));
    }
    // 小葉片
    if (k % 3 === 0) {
      const leaf = mesh(new THREE.SphereGeometry(0.01, 8, 4), M.leafOlive, 'driedFlowers:leaf', props);
      leaf.scale.set(0.4, 0.15, 1.6);
      leaf.position.set(pts[2][0] + 0.008, pts[2][1], pts[2][2]);
      leaf.rotation.y = yaw + 0.5;
    }
  }
  boxAt('driedFlowers:tie', M.fabricLinen, flX - 0.012, flX + 0.012, top + 0.003, top + 0.018, flZ - 0.075, flZ - 0.055, props, true, 0.004, 2);

  // ═════════════════════ 東北角地上：吸塵器、掃把畚箕、紙箱 ═════════════════════
  const corner = group('cornerItems');
  const nwZ = Z0 + TILE_T;      // 北牆磁磚面
  const ewX = X1 - TILE_T;      // 東牆磁磚面
  // 直立吸塵器（靠北牆，偏中）
  const vX = ewX - 0.6, vZ = nwZ + 0.12;
  {
    const g = group('vacuum', corner);
    const head = mesh(G.roundedBox(0.26, 0.045, 0.1, 0.016, 3), M.plasticWhite, 'vacuum:head', g);
    head.position.set(vX, 0.0225, vZ + 0.04);
    const bumper = mesh(G.roundedBox(0.262, 0.016, 0.012, 0.005, 2), M.plasticBlack, 'vacuum:bumper', g);
    bumper.position.set(vX, 0.009, vZ + 0.088);
    const joint = mesh(new THREE.SphereGeometry(0.022, 20, 14), M.plasticBlack, 'vacuum:joint', g);
    joint.position.set(vX, 0.05, vZ + 0.03);
    tubeAt('vacuum:tube', M.plasticWhite, [[vX, 0.05, vZ + 0.03], [vX, 0.25, vZ + 0.025], [vX, 0.45, vZ + 0.02]], 0.016, g, { segments: 16, radial: 16 });
    // 主機：車削成圓潤膠囊，下段是霧面集塵杯
    lathe('vacuum:dustCup', M.glassFrosted, [[0, 0], [0.034, 0], [0.04, 0.008], [0.04, 0.14], [0, 0.14]], vX, 0.44, vZ + 0.03, 32, g).castShadow = false;
    lathe('vacuum:body', M.plasticWhite, [
      [0, 0], [0.036, 0], [0.042, 0.01], [0.044, 0.04], [0.044, 0.18], [0.04, 0.21], [0.028, 0.23], [0.016, 0.24], [0, 0.24],
    ], vX, 0.58, vZ + 0.03, 40, g);
    lathe('vacuum:collar', M.plasticBlack, [[0, 0], [0.043, 0], [0.045, 0.005], [0.045, 0.015], [0.043, 0.02], [0, 0.02]], vX, 0.575, vZ + 0.03, 40, g);
    tubeAt('vacuum:upperTube', M.plasticWhite, [[vX, 0.8, vZ + 0.03], [vX, 0.95, vZ + 0.028], [vX, 1.08, vZ + 0.025]], 0.013, g, { segments: 12, radial: 14 });
    // D 形握把（連續彎管）
    tubeAt('vacuum:grip', M.plasticWhite, [
      [vX, 1.07, vZ + 0.025], [vX, 1.13, vZ + 0.02], [vX, 1.18, vZ + 0.035], [vX, 1.19, vZ + 0.075],
      [vX, 1.15, vZ + 0.095], [vX, 1.09, vZ + 0.07], [vX, 1.06, vZ + 0.04],
    ], 0.012, g, { segments: 48, radial: 12 });
    // 掛在機身上的黑色電線（繞兩圈垂下）
    const cordPts = [];
    for (let k = 0; k <= 28; k++) {
      const t = k / 28;
      const a = t * Math.PI * 4;
      cordPts.push([vX + 0.05 + Math.cos(a) * 0.012, 1.0 - t * 0.2 - Math.sin(a) * 0.08 * (1 - t * 0.3), vZ + 0.0 + Math.sin(a) * 0.01]);
    }
    tubeAt('vacuum:cord', M.plasticBlack, cordPts, 0.0035, g, { segments: 120, radial: 6 });
  }
  // 掃把＋畚箕（靠北牆、近東北角）
  const bX = ewX - 0.3, bZ = nwZ + 0.08;
  {
    const g = group('broom', corner);
    tubeAt('broom:pole', M.metalAluminium, [[bX + 0.004, 0.22, bZ + 0.09], [bX - 0.008, 0.7, bZ + 0.045], [bX - 0.02, 1.18, bZ + 0.005]], 0.011, g, { segments: 16, radial: 14 });
    tubeAt('broom:grip', M.plasticBlue, [[bX - 0.018, 1.1, bZ + 0.012], [bX - 0.02, 1.18, bZ + 0.005], [bX - 0.021, 1.22, bZ + 0.003]], 0.0135, g, { segments: 8, radial: 14 });
    const cap = mesh(new THREE.SphereGeometry(0.0135, 14, 10), M.plasticBlue, 'broom:gripCap', g);
    cap.position.set(bX - 0.021, 1.22, bZ + 0.003);
    const head = mesh(G.roundedBox(0.27, 0.05, 0.045, 0.012, 3), M.plasticBlue, 'broom:head', g);
    head.position.set(bX + 0.005, 0.2, bZ + 0.1);
    head.rotation.x = -0.4;
    const bristle = mesh(G.roundedBox(0.28, 0.15, 0.035, 0.006, 2), M.plasticBlue, 'broom:bristles', g);
    bristle.position.set(bX + 0.005, 0.1, bZ + 0.145);
    bristle.rotation.x = -0.45;
    // 畚箕：倒角底板＋圓角側板＋彎管長柄
    const dpZ = bZ + 0.22;
    const dp = group('dustpan', corner);
    const dpb = mesh(G.extrudeRounded(G.roundedRectShape(0.3, 0.27, 0.03), 0.012, 0.003), M.plasticBlue, 'dustpan:base', dp);
    dpb.position.set(bX, 0, dpZ + 0.135);
    boxAt('dustpan:back', M.plasticBlue, bX - 0.15, bX + 0.15, 0, 0.12, dpZ - 0.012, dpZ, dp, true, 0.005, 2);
    boxAt('dustpan:sideW', M.plasticBlue, bX - 0.16, bX - 0.148, 0, 0.1, dpZ - 0.012, dpZ + 0.25, dp, true, 0.005, 2);
    boxAt('dustpan:sideE', M.plasticBlue, bX + 0.148, bX + 0.16, 0, 0.1, dpZ - 0.012, dpZ + 0.25, dp, true, 0.005, 2);
    boxAt('dustpan:label', M.paperWhite, bX - 0.1, bX + 0.1, 0.012, 0.0135, dpZ + 0.06, dpZ + 0.2, dp, false, 0.0005);
    tubeAt('dustpan:handle', M.plasticBlue, [[bX + 0.06, 0.1, dpZ - 0.006], [bX + 0.062, 0.4, dpZ - 0.03], [bX + 0.064, 0.66, dpZ - 0.06]], 0.01, dp, { segments: 12, radial: 12 });
  }
  // 紙箱（靠東牆，直立）
  {
    const bxX1 = ewX - 0.005, bxX0 = bxX1 - 0.17;
    const bz0 = nwZ + 0.62, bz1 = bz0 + 0.3;
    boxAt('cardboardBox', M.paperWhite, bxX0, bxX1, 0, 0.55, bz0, bz1, corner);
    boxAt('cardboardBox:print', M.paintCharcoal, bxX0 - 0.001, bxX0, 0.42, 0.48, bz0 + 0.05, bz0 + 0.25, corner, false);
    boxAt('cardboardBox:photo', M.plasticBlue, bxX0 - 0.001, bxX0, 0.15, 0.36, bz0 + 0.08, bz0 + 0.18, corner, false);
    boxAt('cardboardBox:tape', M.rattan, bxX0 + 0.06, bxX0 + 0.11, 0.55, 0.552, bz0, bz1, corner, false);
  }

  // ═════════════════════ 燈光（2 盞、不開陰影、暖色） ═════════════════════
  const led = new THREE.PointLight(L.LIGHT_COLORS.k3000, 1.4, 1.8, 2);
  led.name = `${ROOM}:light:underCabinet`;
  led.position.set(X0 + 0.25, WALL_CAB_BOTTOM - 0.1, (zSink[0] + zDrawer[1]) / 2);
  led.castShadow = false;
  root.add(led);
  const hoodLight = new THREE.PointLight(L.LIGHT_COLORS.k3500, 1.0, 1.4, 2);
  hoodLight.name = `${ROOM}:light:hood`;
  hoodLight.position.set(X0 + 0.25, hb - 0.08, (hz0 + hz1) / 2);
  hoodLight.castShadow = false;
  root.add(hoodLight);

  return root;
}
