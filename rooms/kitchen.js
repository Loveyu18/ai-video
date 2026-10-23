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
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';

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
const GAP = 0.005;            // 無把手門片的細溝
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
  const boxAt = (name, mat, x0, x1, y0, y1, z0, z1, parent = root, shadow = true) => {
    const m = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, name, parent, shadow);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return m;
  };
  const cyl = (name, mat, rTop, rBot, h, x, y, z, seg = 24, parent = root) => {
    const m = mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, name, parent);
    m.position.set(x, y + h / 2, z);
    return m;
  };
  const lathe = (name, mat, pts, x, y, z, seg = 28, parent = root) => {
    const m = mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat, name, parent);
    m.position.set(x, y, z);
    return m;
  };
  const group = (name, parent = root) => {
    const g = new THREE.Group();
    g.name = `${ROOM}:${name}`;
    parent.add(g);
    return g;
  };
  /** 面向 +x 的面板：z 範圍 [a,b]、高度 [y0,y1]、前表面在 xFront */
  const panelX = (name, mat, xFront, t, a, b, y0, y1, parent, gap = GAP, r = 0.003) => {
    const geo = new RoundedBoxGeometry(t, y1 - y0 - gap, b - a - gap, 2, r);
    const m = mesh(geo, mat, name, parent);
    m.position.set(xFront - t / 2, (y0 + y1) / 2, (a + b) / 2);
    return m;
  };

  // ═════════════════════ 下櫃（淺橡木、無把手細溝） ═════════════════════
  const base = group('baseCabinets');
  boxAt('carcass', M.paintWhite, X0, FX - FRONT_T - 0.004, TOE, CAB_TOP, RZ0, RZ1, base);
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
  for (let k = 0; k < 3; k++) {
    boxAt('oven:button', M.plasticBlack, FX + 0.004, FX + 0.008, ovenY0 + 0.05 + k * 0.03, ovenY0 + 0.07 + k * 0.03, ovenDoorZ1 + 0.035, ovenZ1 - 0.035, oven);
  }

  // ═════════════════════ 檯面（白色石英、水槽開孔） ═════════════════════
  const ctr = group('countertop');
  const SW = 0.5, SD = 0.4;                               // 水槽開孔（沿 z × 沿 x）
  const sinkZ = sinkMidZ, sinkX = X0 + 0.07 + SD / 2;
  const cx1 = FX + OVERHANG;
  boxAt('counter:north', M.stoneCountertop, X0, cx1, CAB_TOP, CTR_TOP, RZ0, sinkZ - SW / 2, ctr);
  boxAt('counter:south', M.stoneCountertop, X0, cx1, CAB_TOP, CTR_TOP, sinkZ + SW / 2, RZ1, ctr);
  boxAt('counter:sinkBack', M.stoneCountertop, X0, sinkX - SD / 2, CAB_TOP, CTR_TOP, sinkZ - SW / 2, sinkZ + SW / 2, ctr);
  boxAt('counter:sinkFront', M.stoneCountertop, sinkX + SD / 2, cx1, CAB_TOP, CTR_TOP, sinkZ - SW / 2, sinkZ + SW / 2, ctr);

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
  cyl('faucet:base', M.metalBlack, 0.024, 0.028, 0.04, fX, CTR_TOP, fZ, 24, sink);
  const neck = new THREE.CubicBezierCurve3(
    new THREE.Vector3(fX, CTR_TOP + 0.03, fZ),
    new THREE.Vector3(fX, CTR_TOP + 0.46, fZ),
    new THREE.Vector3(fX + 0.24, CTR_TOP + 0.46, fZ),
    new THREE.Vector3(fX + 0.24, CTR_TOP + 0.3, fZ),
  );
  mesh(new THREE.TubeGeometry(neck, 40, 0.012, 12, false), M.metalBlack, 'faucet:neck', sink);
  cyl('faucet:tip', M.metalBlack, 0.014, 0.015, 0.035, fX + 0.24, CTR_TOP + 0.27, fZ, 16, sink);
  const lever = cyl('faucet:lever', M.metalBlack, 0.007, 0.007, 0.1, 0, 0, 0, 12, sink);
  lever.rotation.x = Math.PI / 2.8;
  lever.position.set(fX + 0.005, CTR_TOP + 0.14, fZ + 0.05);
  cyl('faucet:leverHub', M.metalBlack, 0.016, 0.016, 0.035, fX, CTR_TOP + 0.1, fZ + 0.02, 16, sink).rotation.x = Math.PI / 2;
  // 淨水龍頭（不鏽鋼細管）
  const fz2 = sinkZ + 0.13;
  cyl('filterTap:base', M.metalChrome, 0.016, 0.018, 0.03, fX, CTR_TOP, fz2, 16, sink);
  const tap = new THREE.CubicBezierCurve3(
    new THREE.Vector3(fX, CTR_TOP + 0.02, fz2),
    new THREE.Vector3(fX, CTR_TOP + 0.36, fz2),
    new THREE.Vector3(fX + 0.17, CTR_TOP + 0.36, fz2),
    new THREE.Vector3(fX + 0.17, CTR_TOP + 0.26, fz2),
  );
  mesh(new THREE.TubeGeometry(tap, 32, 0.007, 10, false), M.metalChrome, 'filterTap:neck', sink);

  // ═════════════════════ 兩口黑玻璃瓦斯爐 ═════════════════════
  const stove = group('stove');
  const stZ = (zStove[0] + zStove[1]) / 2;
  const stX = X0 + 0.3;
  const gTop = CTR_TOP + 0.01;
  boxAt('stove:glass', M.glassBlack, stX - 0.24, stX + 0.24, CTR_TOP, gTop, stZ - 0.36, stZ + 0.36, stove);
  boxAt('stove:trim', M.metalBrushed, stX - 0.245, stX + 0.245, CTR_TOP, CTR_TOP + 0.006, stZ - 0.365, stZ + 0.365, stove);
  for (const [i, dz] of [[0, -0.18], [1, 0.18]]) {
    const bx = stX - 0.02, bz = stZ + dz;
    cyl(`stove:burner${i}:ring`, M.metalBrushed, 0.075, 0.08, 0.012, bx, gTop, bz, 36, stove);
    cyl(`stove:burner${i}:crown`, M.metalBlack, 0.05, 0.052, 0.016, bx, gTop + 0.012, bz, 32, stove);
    cyl(`stove:burner${i}:cap`, M.metalBlack, 0.032, 0.036, 0.008, bx, gTop + 0.028, bz, 32, stove);
    const ring = mesh(new THREE.TorusGeometry(0.105, 0.005, 8, 40), M.metalBrushed, `stove:burner${i}:grate`, stove);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(bx, gTop + 0.03, bz);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const bar = mesh(new THREE.BoxGeometry(0.07, 0.008, 0.008), M.metalBrushed, `stove:burner${i}:grateBar`, stove);
      bar.position.set(bx + Math.cos(a) * 0.1, gTop + 0.03, bz + Math.sin(a) * 0.1);
      bar.rotation.y = -a;
      const leg = mesh(new THREE.BoxGeometry(0.008, 0.03, 0.008), M.metalBrushed, `stove:burner${i}:grateLeg`, stove);
      leg.position.set(bx + Math.cos(a) * 0.105, gTop + 0.015, bz + Math.sin(a) * 0.105);
    }
    const knob = cyl(`stove:knob${i}`, M.metalChrome, 0.02, 0.023, 0.024, stX + 0.17, gTop, bz, 24, stove);
    knob.rotation.y = rng.range(0, Math.PI);
    boxAt(`stove:knob${i}:grip`, M.plasticBlack, stX + 0.155, stX + 0.185, gTop + 0.024, gTop + 0.032, bz - 0.003, bz + 0.003, stove);
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
  const visor = mesh(new THREE.BoxGeometry(visorLen, 0.006, hz1 - hz0), M.glassFrosted, 'hood:glassVisor', hood, false);
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
          const geo = axis === 'x'
            ? new THREE.BoxGeometry(pb - pa, vb - va, TILE_T)
            : new THREE.BoxGeometry(TILE_T, vb - va, pb - pa);
          // 讓每塊磚取紋理的不同區域，紋路才不會重複
          const uv = geo.attributes.uv;
          const su = (pb - pa) / 2, sv = (vb - va) / 2;
          for (let i = 0; i < uv.count; i++) {
            const x = uv.getX(i), y = uv.getY(i);
            uv.setXY(i, (flip ? 1 - x : x) * su + ou, y * sv + ov);
          }
          const n = plane + nSign * TILE_T / 2;
          if (axis === 'x') geo.translate((pa + pb) / 2, (va + vb) / 2, n);
          else geo.translate(n, (va + vb) / 2, (pa + pb) / 2);
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
        parts.push([Math.max(h0, cur), h1, hv1, H]);
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
  // 兩塊木砧板斜靠背牆（爐子與水槽之間）
  const boardZ = zDrawer[1] - 0.12;
  {
    const g = group('cuttingBoard:paddle', props);
    const shape = new THREE.Shape();
    const w = 0.2, h = 0.38, hw = 0.035, hh = 0.13, r = 0.025;
    shape.moveTo(-w / 2 + r, 0);
    shape.lineTo(w / 2 - r, 0);
    shape.quadraticCurveTo(w / 2, 0, w / 2, r);
    shape.lineTo(w / 2, h - 0.04);
    shape.quadraticCurveTo(w / 2, h, w / 2 - 0.05, h);
    shape.lineTo(hw / 2, h);
    shape.lineTo(hw / 2, h + hh - hw / 2);
    shape.absarc(0, h + hh - hw / 2, hw / 2, 0, Math.PI, false);
    shape.lineTo(-hw / 2, h);
    shape.lineTo(-w / 2 + 0.05, h);
    shape.quadraticCurveTo(-w / 2, h, -w / 2, h - 0.04);
    shape.lineTo(-w / 2, r);
    shape.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0);
    const hole = new THREE.Path();
    hole.absarc(0, h + hh - hw / 2, 0.009, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1, curveSegments: 8 });
    geo.translate(0, 0, -0.011);
    const b = mesh(geo, M.woodOakDark, 'cuttingBoard:paddle', g);
    // 板面朝 +x，底部離牆、頂端靠在玻璃上
    b.rotation.set(0, Math.PI / 2, 0);
    g.position.set(X0 + 0.12, top + 0.003, boardZ);
    g.rotation.z = 0.16;
  }
  {
    const g = group('cuttingBoard:round', props);
    // 圓盤＋短柄（本地 y 往上、板面朝 +z）
    const disk = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.018, 40), M.woodOak, 'cuttingBoard:round', g);
    disk.rotation.x = Math.PI / 2;
    disk.position.y = 0.13;
    const hdl = mesh(new RoundedBoxGeometry(0.045, 0.11, 0.018, 2, 0.008), M.woodOak, 'cuttingBoard:roundHandle', g);
    hdl.position.y = 0.3;
    const b = new THREE.Group();
    b.add(disk, hdl);
    g.add(b);
    // 斜靠背牆，疊在長砧板前方（偏南）
    b.rotation.set(0, Math.PI / 2, 0);
    g.position.set(X0 + 0.19, top + 0.003, boardZ + 0.14);
    g.rotation.z = 0.36;
  }
  // 桌巾＋托盤＋兩支高腳杯＋乾燥花（爐子與水槽之間偏水槽側）
  const trayZ = (zDrawer[0] + zDrawer[1]) / 2 - 0.12;
  const trayX = X0 + 0.38;
  boxAt('tableRunner', M.fabricLinen, X0 + 0.16, FX - 0.02, top, top + 0.003, trayZ - 0.2, trayZ + 0.2, props);
  const tray = mesh(new RoundedBoxGeometry(0.2, 0.018, 0.3, 2, 0.006), M.woodWalnut, 'tray', props);
  tray.position.set(trayX, top + 0.003 + 0.009, trayZ);
  const trayTop = top + 0.021;
  const goblet = [[0, 0], [0.035, 0], [0.036, 0.004], [0.006, 0.01], [0.004, 0.09], [0.012, 0.1], [0.036, 0.13], [0.04, 0.17], [0.038, 0.2], [0.036, 0.2], [0.037, 0.17], [0.033, 0.135], [0.01, 0.105], [0, 0.105]];
  for (const [i, dz] of [[0, -0.07], [1, 0.07]]) {
    const gm = lathe(`goblet${i}`, M.glassFrosted, goblet, trayX, trayTop, trayZ + dz, 28, props);
    gm.castShadow = false;
    lathe(`goblet${i}:stem`, M.glassBlack, goblet.slice(0, 6), trayX, trayTop, trayZ + dz, 16, props);
  }
  // 乾燥花：一束細枝＋小花頭
  const flRng = rng.fork('driedFlowers');
  const flX = X0 + 0.22, flZ = trayZ - 0.2;
  for (let k = 0; k < 9; k++) {
    const len = flRng.range(0.22, 0.32);
    const tilt = flRng.range(0.6, 1.0);
    const yaw = flRng.range(-0.5, 0.5);
    const stem = mesh(new THREE.CylinderGeometry(0.0018, 0.0022, len, 5), M.stem, 'driedFlowers:stem', props);
    // 平放在檯面、往南散開
    const dir = new THREE.Vector3(Math.sin(yaw) * 0.6, Math.cos(tilt) * 0.3, Math.cos(yaw)).normalize();
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    stem.position.set(flX + dir.x * len / 2, top + 0.006 + dir.y * len / 2, flZ - 0.08 + dir.z * len / 2);
    const tip = stem.position.clone().addScaledVector(dir, len / 2);
    for (let j = 0; j < 3; j++) {
      const head = mesh(new THREE.SphereGeometry(flRng.range(0.008, 0.014), 6, 4), flRng.pick([M.leafOlive, M.fabricBlush, M.rattan, M.fabricOat]), 'driedFlowers:head', props);
      head.position.copy(tip).add(new THREE.Vector3(flRng.jitter(0, 0.015), flRng.range(0, 0.012), -flRng.range(0, 0.04)));
    }
  }
  boxAt('driedFlowers:tie', M.fabricLinen, flX - 0.012, flX + 0.012, top + 0.003, top + 0.018, flZ + 0.0, flZ + 0.02, props);

  // ═════════════════════ 東北角地上：吸塵器、掃把畚箕、紙箱 ═════════════════════
  const corner = group('cornerItems');
  const nwZ = Z0 + TILE_T;      // 北牆磁磚面
  const ewX = X1 - TILE_T;      // 東牆磁磚面
  // 直立吸塵器（靠北牆，偏中）
  const vX = ewX - 0.6, vZ = nwZ + 0.12;
  {
    const g = group('vacuum', corner);
    boxAt('vacuum:head', M.plasticWhite, vX - 0.13, vX + 0.13, 0, 0.05, vZ - 0.02, vZ + 0.09, g);
    boxAt('vacuum:headStrip', M.plasticBlack, vX - 0.13, vX + 0.13, 0, 0.012, vZ + 0.088, vZ + 0.092, g);
    cyl('vacuum:neck', M.plasticBlack, 0.022, 0.022, 0.06, vX, 0.04, vZ + 0.03, 16, g);
    const stick = cyl('vacuum:tube', M.plasticWhite, 0.016, 0.016, 0.7, vX, 0.08, vZ + 0.02, 16, g);
    stick.rotation.x = -0.05;
    const body = mesh(new RoundedBoxGeometry(0.09, 0.32, 0.1, 2, 0.03), M.plasticWhite, 'vacuum:body', g);
    body.position.set(vX, 0.62, vZ + 0.05);
    cyl('vacuum:dustCup', M.glassFrosted, 0.038, 0.038, 0.15, vX, 0.45, vZ + 0.1, 20, g).castShadow = false;
    cyl('vacuum:upperTube', M.plasticWhite, 0.014, 0.014, 0.35, vX, 0.78, vZ + 0.02, 12, g);
    const grip = mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20, Math.PI * 1.2), M.plasticWhite, 'vacuum:grip', g);
    grip.position.set(vX, 1.16, vZ + 0.02);
    grip.rotation.set(0, Math.PI / 2, Math.PI * 0.4);
    // 掛在機身上的黑色電線
    const cord = new THREE.CatmullRomCurve3([
      new THREE.Vector3(vX + 0.02, 1.0, vZ + 0.01), new THREE.Vector3(vX + 0.05, 0.85, vZ + 0.0),
      new THREE.Vector3(vX + 0.03, 0.75, vZ + 0.02), new THREE.Vector3(vX + 0.01, 0.95, vZ + 0.02),
    ]);
    mesh(new THREE.TubeGeometry(cord, 24, 0.004, 6, false), M.plasticBlack, 'vacuum:cord', g);
  }
  // 掃把＋畚箕（靠北牆、近東北角）
  const bX = ewX - 0.3, bZ = nwZ + 0.08;
  {
    const g = group('broom', corner);
    const pole = cyl('broom:pole', M.metalAluminium, 0.011, 0.011, 1.0, bX, 0.2, bZ, 12, g);
    pole.rotation.z = 0.04;
    cyl('broom:grip', M.plasticBlue, 0.013, 0.013, 0.12, bX - 0.02, 1.08, bZ, 12, g);
    const head = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), M.plasticBlue, 'broom:head', g);
    head.position.set(bX + 0.005, 0.22, bZ + 0.09);
    head.rotation.x = -0.4;
    const bristle = mesh(new THREE.BoxGeometry(0.28, 0.16, 0.04), M.plasticBlue, 'broom:bristles', g);
    bristle.position.set(bX + 0.005, 0.12, bZ + 0.15);
    bristle.rotation.x = -0.45;
    // 畚箕：底板＋三面＋長柄
    const dpZ = bZ + 0.22;
    const dp = group('dustpan', corner);
    boxAt('dustpan:base', M.plasticBlue, bX - 0.15, bX + 0.15, 0, 0.012, dpZ, dpZ + 0.28, dp);
    boxAt('dustpan:back', M.plasticBlue, bX - 0.15, bX + 0.15, 0, 0.12, dpZ - 0.01, dpZ, dp);
    boxAt('dustpan:sideW', M.plasticBlue, bX - 0.16, bX - 0.15, 0, 0.1, dpZ, dpZ + 0.26, dp);
    boxAt('dustpan:sideE', M.plasticBlue, bX + 0.15, bX + 0.16, 0, 0.1, dpZ, dpZ + 0.26, dp);
    boxAt('dustpan:label', M.paperWhite, bX - 0.1, bX + 0.1, 0.012, 0.014, dpZ + 0.06, dpZ + 0.2, dp, false);
    const dh = cyl('dustpan:handle', M.plasticBlue, 0.01, 0.01, 0.6, bX + 0.06, 0.08, dpZ - 0.02, 10, dp);
    dh.rotation.x = -0.1;
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
