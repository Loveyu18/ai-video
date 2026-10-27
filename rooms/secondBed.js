/**
 * rooms/secondBed.js — 次臥 → 溫暖極簡貓咪閱讀工作室
 *
 * 從北邊門口往南看南窗：
 *   - 東牆 x1：整排淺橡木系統書桌（抽屜、南端收納櫃）＋頂天吊櫃，櫃底暖光 LED
 *     桌上：顯示器、小主機、鍵盤、滑鼠、皮革桌墊、筆筒、相框、擺飾；深灰辦公椅
 *   - 南端靠窗：架高木地台（正面一排抽屜），上有弧形木框布面躺椅、條紋木邊几＋小植物
 *   - 西牆 x0：貓跳台牆——浮空層板、吊橋、貓頭開口貓屋、兩根麻繩貓抓柱、兩隻貓
 *   - 門的掃掠區淨空；門口到地台留走道
 * 座標全部由 layout.js 推出。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from '../layout.js';
import { M } from '../materials.js';
import { rngFor } from '../rng.js';
import * as G from '../geo.js';

const ROOM = 'secondBed';

// ── 尺寸（公尺） ──────────────────────────────────────
const DESK = { d: 0.6, h: 0.75, top: 0.04, drawerH: 0.14 };
const UPPER = { d: 0.36, y0: 1.85 };
const PLAT = { d: 1.2, h: 0.3 };
const SHELF_T = 0.03;

// ── 小工具 ────────────────────────────────────────────
function mesh(geo, mat, name, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.name = `${ROOM}:${name}`;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
/** 倒角方塊（預設 3mm）；極薄片才用直角 */
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
function place(geo, mat, name, x, y, z, rot = [0, 0, 0], opts) {
  const m = mesh(geo, mat, name, opts);
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  return m;
}
/** 圓柱座標 UV（u 沿圓周、v 沿高度），斜放或細長車削件用 */
function cylUV(geo, swap = false) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u = (Math.atan2(x, z) * Math.max(Math.hypot(x, z), 0.01)) / G.UV_METERS, v = y / G.UV_METERS;
    if (swap) [u, v] = [v, u];
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
const sphere = (r, ws = 20, hs = 14) => G.worldUV(new THREE.SphereGeometry(r, ws, hs));

// ═══════════════════════════════════════════════════════
// 東牆：系統書桌＋吊櫃
// ═══════════════════════════════════════════════════════
function buildDesk(I, platZ0, deskZ0) {
  const g = new THREE.Group();
  g.name = `${ROOM}:desk`;
  const x1 = I.x1, x0 = x1 - DESK.d, z0 = deskZ0, z1 = I.z1, top = DESK.h;
  const ty0 = top - DESK.top;
  g.add(boxMinMax(x0, x1, ty0, top, z0, z1, M.woodOak, 'desk:top', 0.005));
  // 北端側板
  g.add(boxMinMax(x0 + 0.01, x1, 0, ty0, z0, z0 + 0.025, M.woodOak, 'desk:endPanel'));
  // 抽屜帶（北段，桌面下）：櫃體＋分割抽屜面板＋底部指扣陰影
  const dy0 = ty0 - DESK.drawerH;
  const dz0 = z0 + 0.025, dz1 = platZ0;
  g.add(boxMinMax(x0 + 0.02, x1, dy0, ty0, dz0, dz1, M.woodOak, 'desk:drawerBox'));
  const nD = Math.max(2, Math.round((dz1 - dz0) / 0.55));
  const dw = (dz1 - dz0) / nD;
  for (let i = 0; i < nD; i++) {
    const a = dz0 + i * dw + 0.003, b = dz0 + (i + 1) * dw - 0.003;
    g.add(boxMinMax(x0, x0 + 0.02, dy0 + 0.004, ty0 - 0.004, a, b, M.woodOak, `desk:drawer${i}`, 0.003));
    g.add(boxMinMax(x0 - 0.001, x0 + 0.004, dy0 + 0.004, dy0 + 0.014, a + 0.05, b - 0.05, M.woodOakDark, `desk:drawerPull${i}`));
  }
  // 南段（地台旁）：落地收納櫃，兩扇門
  g.add(boxMinMax(x0 + 0.04, x1, 0, 0.06, platZ0 + 0.01, z1, M.paintCream, 'desk:baseKick'));
  g.add(boxMinMax(x0 + 0.02, x1, 0.06, ty0, platZ0, z1, M.woodOak, 'desk:baseCarcass'));
  const cw = (z1 - platZ0) / 2;
  for (let i = 0; i < 2; i++) {
    const a = platZ0 + i * cw + 0.003, b = platZ0 + (i + 1) * cw - 0.003;
    g.add(boxMinMax(x0, x0 + 0.02, 0.064, ty0 - 0.004, a, b, M.woodOak, `desk:baseDoor${i}`, 0.003));
    const hz = i === 0 ? b - 0.04 : a + 0.04;
    g.add(boxMinMax(x0 - 0.001, x0 + 0.004, ty0 - 0.2, ty0 - 0.04, hz - 0.006, hz + 0.006, M.woodOakDark, `desk:baseDoorPull${i}`));
  }

  // 吊櫃（頂到天花）＋門縫陰影＋LED 燈條
  const ux0 = x1 - UPPER.d, uy0 = UPPER.y0, uy1 = L.CEILING_HEIGHT - 0.004;
  g.add(boxMinMax(ux0 + 0.02, x1, uy0, uy1, z0, z1, M.woodOakDark, 'upper:carcass'));
  const nU = Math.max(2, Math.round((z1 - z0) / 0.47));
  const uw = (z1 - z0) / nU;
  for (let i = 0; i < nU; i++) {
    const a = z0 + i * uw + 0.0035, b = z0 + (i + 1) * uw - 0.0035;
    g.add(boxMinMax(ux0, ux0 + 0.02, uy0, uy1 - 0.003, a, b, M.woodOak, `upper:door${i}`, 0.002));
  }
  g.add(boxMinMax(ux0 + 0.025, ux0 + 0.04, uy0 - 0.008, uy0, z0 + 0.02, z1 - 0.02, M.ledStrip, 'upper:led', 0.002));
  return { group: g, x0, x1, z0, z1, top, ux0, uy0 };
}

/** 東牆北段頂天書櫃：下段雙門、上段開放層格（書背朝 -x），與書桌齊平靠牆 */
function buildBookcase(I, z0, z1, rng) {
  const g = new THREE.Group();
  g.name = `${ROOM}:bookcase`;
  const x1 = I.x1, x0 = x1 - 0.4, H = L.CEILING_HEIGHT - 0.004, t = 0.022, base = 0.75;
  g.add(boxMinMax(x0 + 0.04, x1, 0, 0.06, z0 + t, z1 - t, M.paintCream, 'bookcase:kick'));
  g.add(boxMinMax(x0, x1, 0, H, z0, z0 + t, M.woodOak, 'bookcase:side'));
  g.add(boxMinMax(x0, x1, 0, H, z1 - t, z1, M.woodOak, 'bookcase:side'));
  g.add(boxMinMax(x0, x1, H - t, H, z0 + t, z1 - t, M.woodOak, 'bookcase:top'));
  g.add(boxMinMax(x1 - 0.012, x1, 0.06, H - t, z0 + t, z1 - t, M.woodOakDark, 'bookcase:back'));
  // 下段雙門
  const dw = (z1 - z0 - 2 * t) / 2;
  for (let i = 0; i < 2; i++) {
    const a = z0 + t + i * dw + 0.003, b = z0 + t + (i + 1) * dw - 0.003;
    g.add(boxMinMax(x0, x0 + 0.02, 0.064, base - 0.004, a, b, M.woodOak, `bookcase:door${i}`, 0.003));
    const hz = i === 0 ? b - 0.035 : a + 0.035;
    g.add(boxMinMax(x0 - 0.001, x0 + 0.004, base - 0.2, base - 0.05, hz - 0.006, hz + 0.006, M.woodOakDark, `bookcase:pull${i}`));
  }
  // 層板
  const levels = [base, base + 0.38, base + 0.74, base + 1.1, base + 1.48];
  for (const y of levels) g.add(boxMinMax(x0 + 0.005, x1 - 0.012, y, y + t, z0 + t, z1 - t, M.woodOak, 'bookcase:shelf'));
  // 書（書背朝 -x）＋擺飾
  const mats = [M.paperWhite, M.bookColors[4], M.panelGreige, M.bookColors[6], M.paintCream];
  const buckets = mats.map(() => []);
  const zi0 = z0 + t + 0.012, zi1 = z1 - t - 0.012;
  const row = (y, za, zb, minH, maxH) => {
    let z = za;
    while (z < zb - 0.02) {
      const th = rng.range(0.018, 0.04), h = rng.range(minH, maxH), d = rng.range(0.17, 0.24);
      if (z + th > zb) break;
      const bg = new THREE.BoxGeometry(d, h, th);
      bg.translate(x1 - 0.015 - d / 2, y + h / 2, z + th / 2);
      buckets[rng.int(0, mats.length - 1)].push(G.worldUV(bg));
      z += th + 0.0015;
    }
  };
  row(levels[0] + t, zi0, zi1, 0.24, 0.31);
  row(levels[1] + t, zi0, zi0 + (zi1 - zi0) * 0.55, 0.2, 0.28);
  row(levels[2] + t, zi0 + (zi1 - zi0) * 0.45, zi1, 0.2, 0.27);
  row(levels[3] + t, zi0, zi0 + (zi1 - zi0) * 0.4, 0.2, 0.26);
  buckets.forEach((list, i) => list.length && g.add(mesh(mergeGeometries(list), mats[i], `bookcase:books${i}`)));
  // 擺飾：陶瓶、藤籃、相框、小貓擺件（黑）
  const midX = x1 - 0.2;
  g.add(place(G.lathe([[0, 0], [0.05, 0], [0.065, 0.07], [0.05, 0.15], [0.025, 0.2], [0.028, 0.22], [0, 0.215]], 40), M.ceramicMatte, 'bookcase:vase', midX, levels[1] + t, zi1 - 0.1));
  g.add(boxMinMax(x1 - 0.33, x1 - 0.03, levels[2] + t, levels[2] + t + 0.2, zi0 + 0.02, zi0 + 0.3, M.rattan, 'bookcase:basket', 0.02));
  const fr = new THREE.Group();
  fr.name = `${ROOM}:bookcase:photo`;
  fr.add(mesh(G.roundedBox(0.012, 0.22, 0.17, 0.003), M.woodOak, 'bookcase:photoFrame'));
  fr.add(boxMinMax(-0.0075, -0.006, -0.085, 0.085, -0.065, 0.065, M.panelGreige, 'bookcase:photoArt', 0));
  fr.position.set(x1 - 0.08, levels[3] + t + 0.11, zi1 - 0.12);
  fr.rotation.z = 0.1;
  g.add(fr);
  g.add(place(G.lathe([[0, 0], [0.06, 0], [0.065, 0.02], [0.045, 0.06], [0, 0.065]], 32), M.paintCharcoal, 'bookcase:bowl', midX, levels[4] + t, (zi0 + zi1) / 2));
  return g;
}

/** 桌上物件（面向 -x，坐在桌前的人） */
function buildDeskItems(desk, rng, platZ0) {
  const g = new THREE.Group();
  g.name = `${ROOM}:deskItems`;
  const { x0, x1, z0, top } = desk;
  const wsZ = (z0 + platZ0) / 2;      // 工作區中心（抽屜段中央）
  // 皮革桌墊
  g.add(place(G.extrudeRounded(G.roundedRectShape(0.4, 0.88, 0.025), 0.004, 0.0015), M.leatherCognac, 'deskMat', x0 + 0.27, top, wsZ));
  // 顯示器：底座＋支架＋機身＋螢幕
  const mx = x1 - 0.16;
  g.add(place(G.extrudeRounded(G.roundedRectShape(0.19, 0.22, 0.03), 0.008, 0.002), M.metalAluminium, 'monitor:foot', mx, top, wsZ));
  g.add(place(G.roundedBox(0.018, 0.3, 0.065, 0.006), M.metalAluminium, 'monitor:neck', mx + 0.03, top + 0.15, wsZ, [0, 0, 0.12]));
  const sw = 0.62, sh = 0.36, sy = top + 0.13 + sh / 2, sx = mx - 0.01;
  g.add(place(G.roundedBox(0.025, sh, sw, 0.006), M.metalAluminium, 'monitor:body', sx, sy, wsZ));
  g.add(boxMinMax(sx - 0.0135, sx - 0.0125, sy - sh / 2 + 0.012, sy + sh / 2 - 0.012, wsZ - sw / 2 + 0.012, wsZ + sw / 2 - 0.012, M.screenOn, 'monitor:screen', 0));
  // 桌布：山的剪影（暖色夕照感）
  const mountain = new THREE.Shape();
  const W = sw - 0.03, H = sh - 0.03;
  mountain.moveTo(-W / 2, -H / 2);
  [[-0.24, -0.05], [-0.16, 0.03], [-0.1, -0.02], [-0.02, 0.09], [0.06, 0.0], [0.12, 0.04], [0.2, -0.06], [W / 2, -0.03]].forEach(([u, v]) => mountain.lineTo(u, v));
  mountain.lineTo(W / 2, -H / 2);
  mountain.lineTo(-W / 2, -H / 2);
  g.add(place(G.worldUV(new THREE.ShapeGeometry(mountain)), M.paintCharcoal, 'monitor:wallpaper', sx - 0.0138, sy, wsZ, [0, -Math.PI / 2, 0], { cast: false }));
  g.add(boxMinMax(sx - 0.0142, sx - 0.0139, sy - sh / 2 + 0.02, sy - sh / 2 + 0.032, wsZ - 0.12, wsZ + 0.12, M.plasticWhite, 'monitor:dock', 0));
  // 小主機
  g.add(place(G.roundedBox(0.19, 0.05, 0.19, 0.02), M.metalAluminium, 'miniPC', x1 - 0.17, top + 0.025, wsZ + sw / 2 + 0.16));
  // 鍵盤（底板＋按鍵）
  const kx = x0 + 0.25;
  g.add(place(G.roundedBox(0.12, 0.012, 0.42, 0.005), M.plasticWhite, 'keyboard', kx, top + 0.01, wsZ - 0.03));
  const keys = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 15; c++) {
      const kw = r === 4 && c >= 4 && c <= 9 ? 0 : 0.022;
      if (!kw) continue;
      const k = new THREE.BoxGeometry(0.018, 0.005, 0.022);
      k.translate(kx - 0.044 + r * 0.022, top + 0.018, wsZ - 0.03 - 0.19 + c * 0.0265 + 0.01);
      keys.push(k);
    }
  }
  const space = new THREE.BoxGeometry(0.018, 0.005, 0.15);
  space.translate(kx + 0.044, top + 0.018, wsZ - 0.03 - 0.19 + 6.5 * 0.0265 + 0.01);
  keys.push(space);
  g.add(mesh(G.worldUV(mergeGeometries(keys)), M.plasticWhite, 'keyboard:keys'));
  // 滑鼠
  g.add(place(G.cushion(0.1, 0.03, 0.06, { seam: 0.35 }), M.plasticWhite, 'mouse', kx + 0.01, top + 0.017, wsZ + 0.3));
  // 筆筒＋筆
  const cz = z0 + 0.14, cx = x0 + 0.12;
  g.add(place(G.lathe([[0, 0], [0.038, 0], [0.04, 0.004], [0.04, 0.1], [0.036, 0.1], [0.036, 0.008], [0, 0.008]], 32), M.plasticBlack, 'penCup', cx, top, cz));
  const pens = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.range(0, 0.5);
    const len = rng.range(0.13, 0.16);
    const bx = cx + Math.cos(a) * 0.015, bz = cz + Math.sin(a) * 0.015;
    pens.push(G.tube([[bx, top + 0.01, bz], [bx + Math.cos(a) * 0.03, top + 0.01 + len, bz + Math.sin(a) * 0.03]], 0.004, { segments: 2, radial: 6 }));
  }
  g.add(mesh(mergeGeometries(pens), M.metalBlack, 'pens'));
  // 擺飾區（主機往南）：相框、陶瓷蛋形擺飾、書堆、小貓擺件底座
  const oz = wsZ + sw / 2 + 0.4;
  const frame = new THREE.Group();
  frame.name = `${ROOM}:photoFrame`;
  frame.add(mesh(G.roundedBox(0.012, 0.25, 0.2, 0.003), M.paintWhite, 'photoFrame:frame'));
  frame.add(boxMinMax(-0.0075, -0.006, -0.1, 0.1, -0.075, 0.075, M.paintCharcoal, 'photoFrame:art', 0));
  frame.add(boxMinMax(-0.0078, -0.0076, -0.1, -0.02, -0.075, 0.075, M.panelGreige, 'photoFrame:art2', 0));
  frame.position.set(x1 - 0.08, top + 0.125, oz);
  frame.rotation.z = 0.12;
  g.add(frame);
  g.add(place(G.lathe([[0, 0], [0.028, 0.004], [0.036, 0.04], [0.032, 0.08], [0.018, 0.11], [0, 0.118]], 32), M.ceramicRust, 'eggOrnament', x0 + 0.2, top + 0.012, oz - 0.05));
  g.add(place(G.lathe([[0, 0], [0.045, 0], [0.045, 0.012], [0, 0.012]], 24), M.paintCharcoal, 'eggTray', x0 + 0.2, top, oz - 0.05));
  let yy = top;
  for (let i = 0; i < 3; i++) {
    const t = rng.range(0.018, 0.03);
    g.add(place(G.roundedBox(0.22, t, 0.16, 0.002), [M.paperWhite, M.bookColors[4], M.panelGreige][i], `books${i}`, x1 - 0.2, yy + t / 2, oz + 0.25, [0, rng.jitter(0, 0.1), 0]));
    yy += t;
  }
  return g;
}

// ═══════════════════════════════════════════════════════
// 深灰辦公椅（黑腳），區域座標面向 +z
// ═══════════════════════════════════════════════════════
function buildOfficeChair(rng) {
  const g = new THREE.Group();
  g.name = `${ROOM}:chair`;
  // 五爪腳＋輪子
  const arms = [], wheels = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    arms.push(G.tube([[c * 0.03, 0.09, s * 0.03], [c * 0.16, 0.085, s * 0.16], [c * 0.28, 0.065, s * 0.28]], 0.014, { segments: 10, radial: 8 }));
    const wgeo = new THREE.SphereGeometry(0.028, 12, 8);
    wgeo.scale(1, 1, 0.7);
    wgeo.rotateY(-a);
    wgeo.translate(c * 0.28, 0.028, s * 0.28);
    wheels.push(wgeo);
  }
  g.add(mesh(G.worldUV(mergeGeometries(arms)), M.metalBlack, 'chair:base'));
  g.add(mesh(G.worldUV(mergeGeometries(wheels)), M.rubber, 'chair:wheels'));
  g.add(place(G.lathe([[0, 0], [0.04, 0], [0.04, 0.03], [0.022, 0.05], [0.022, 0.25], [0.018, 0.25], [0.018, 0.36], [0, 0.36]], 24), M.metalBlack, 'chair:column', 0, 0.06, 0));
  // 座椅：底殼＋軟墊
  g.add(place(G.roundedBox(0.44, 0.03, 0.42, 0.012), M.metalBlack, 'chair:seatShell', 0, 0.43, 0));
  g.add(place(G.mattress(0.48, 0.075, 0.47, { radius: 0.03, crown: 0.012 }), M.fabricCharcoal, 'chair:seat', 0, 0.485, 0.01));
  // 椅背：彎曲靠背墊＋兩支黑框（從座底後方往上）
  const lean = 0.14;
  g.add(place(G.cushion(0.46, 0.07, 0.48, { seam: 0.45, wrinkle: 0.002, rng: rng.fork('back') }), M.fabricCharcoal, 'chair:back', 0, 0.83, -0.25, [-Math.PI / 2 - lean, 0, 0]));
  const frames = [];
  for (const sx of [-1, 1]) {
    frames.push(G.tube([[sx * 0.2, 0.43, -0.12], [sx * 0.235, 0.5, -0.24], [sx * 0.235, 0.75, -0.28], [sx * 0.225, 1.04, -0.31]], 0.011, { segments: 20, radial: 8 }));
  }
  g.add(mesh(G.worldUV(mergeGeometries(frames)), M.metalBlack, 'chair:backFrame'));
  // 靠在椅背的米色毛圈抱枕
  g.add(place(G.cushion(0.38, 0.11, 0.3, { seam: 0.2, wrinkle: 0.005, rng: rng.fork('cushion') }), M.fabricBoucle, 'chair:cushion', 0.02, 0.84, -0.17, [-Math.PI / 2 - 0.22, 0.08, 0.06]));
  return g;
}

// ═══════════════════════════════════════════════════════
// 南端架高木地台（正面一排抽屜）
// ═══════════════════════════════════════════════════════
function buildPlatform(I, x1) {
  const g = new THREE.Group();
  g.name = `${ROOM}:platform`;
  const x0 = I.x0, z1 = I.z1, z0 = z1 - PLAT.d, H = PLAT.h, t = 0.025;
  g.add(boxMinMax(x0, x1, H - t, H, z0 - 0.012, z1, M.woodOak, 'platform:top', 0.004));
  g.add(boxMinMax(x0, x1, 0, H - t, z0 + 0.02, z1, M.woodOakDark, 'platform:carcass'));
  const n = Math.max(3, Math.round((x1 - x0) / 0.5));
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w + 0.003, b = x0 + (i + 1) * w - 0.003;
    g.add(boxMinMax(a, b, 0.012, H - t - 0.012, z0, z0 + 0.02, M.woodOak, `platform:drawer${i}`, 0.003));
    g.add(boxMinMax(a + 0.06, b - 0.06, H - t - 0.012, H - t - 0.004, z0 + 0.005, z0 + 0.02, M.woodOakDark, `platform:drawerGrip${i}`));
  }
  return { group: g, x0, x1, z0, z1, top: H };
}

/** 弧形木框布面躺椅（區域座標：長度沿 +x，頭端在 +x，寬沿 z） */
function buildChaise(rng) {
  const g = new THREE.Group();
  g.name = `${ROOM}:chaise`;
  const L0 = 1.45, W = 0.58;
  const curve = new THREE.CatmullRomCurve3([
    [0, 0.3], [0.2, 0.37], [0.42, 0.31], [0.75, 0.27], [1.0, 0.33], [1.2, 0.55], [1.36, 0.78], [1.43, 0.86],
  ].map(([x, y]) => new THREE.Vector3(x - L0 / 2, y, 0)), false, 'centripetal');
  const pts = curve.getPoints(48);
  // 曲線法向（往上那側）
  const normals = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty);
    return [-ty / l, tx / l];
  });
  const offsetShape = (off0, off1) => {
    const up = pts.map((p, i) => new THREE.Vector2(p.x + normals[i][0] * off1, p.y + normals[i][1] * off1));
    const dn = pts.map((p, i) => new THREE.Vector2(p.x + normals[i][0] * off0, p.y + normals[i][1] * off0)).reverse();
    return new THREE.Shape([...up, ...dn]);
  };
  const extr = (shape, depth, bevel) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 });
    geo.translate(0, 0, -(depth - bevel * 2) / 2);
    return G.worldUV(geo);
  };
  // 布面軟墊（厚 8cm、圓潤邊）
  g.add(mesh(extr(offsetShape(-0.005, 0.07), W - 0.02, 0.028), M.fabricBoucle, 'chaise:pad'));
  // 兩側弧形木框（在軟墊下方）
  for (const s of [-1, 1]) {
    const f = mesh(extr(offsetShape(-0.06, -0.005), 0.035, 0.008), M.woodOak, 'chaise:frame');
    f.position.z = s * (W / 2 - 0.02);
    g.add(f);
  }
  // 底部弧形雪橇腳＋橫撐
  const sled = new THREE.CatmullRomCurve3([[-L0 / 2 + 0.12, 0.24], [-L0 / 2 + 0.2, 0.03], [0.1, 0.0], [L0 / 2 - 0.25, 0.03], [L0 / 2 - 0.2, 0.3]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const rails = [];
  for (const s of [-1, 1]) {
    const sp = sled.getPoints(24).map((p) => [p.x, p.y + 0.015, s * (W / 2 - 0.02)]);
    rails.push(G.tube(sp, 0.016, { segments: 32, radial: 10 }));
  }
  for (const x of [-L0 / 2 + 0.18, 0.1, L0 / 2 - 0.22]) {
    const p = sled.getPoints(60).reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best));
    rails.push(G.tube([[x, p.y + 0.02, -(W / 2 - 0.02)], [x, p.y + 0.02, W / 2 - 0.02]], 0.013, { segments: 2, radial: 10 }));
  }
  // 雪橇腳與上方木框之間的支撐（曲線下方 6cm 是木框底）
  const frameY = (x) => {
    const q = pts.reduce((best, pp) => (Math.abs(pp.x - x) < Math.abs(best.x - x) ? pp : best));
    return q.y - 0.055;
  };
  const sledY = (x) => sled.getPoints(80).reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best)).y + 0.015;
  for (const x of [-0.05, 0.25, L0 / 2 - 0.21]) {
    for (const sz of [-1, 1]) {
      rails.push(G.tube([[x, sledY(x), sz * (W / 2 - 0.02)], [x + 0.02, frameY(x + 0.02) + 0.01, sz * (W / 2 - 0.02)]], 0.014, { segments: 2, radial: 10 }));
    }
  }
  g.add(mesh(G.worldUV(mergeGeometries(rails)), M.woodOak, 'chaise:sled'));
  // 頭枕
  const hp = curve.getPoint(0.86);
  g.add(place(G.cushion(0.36, 0.1, 0.24, { seam: 0.25, wrinkle: 0.004, rng: rng.fork('headPillow') }), M.fabricBoucle, 'chaise:pillow', hp.x - 0.06, hp.y + 0.12, 0, [0, Math.PI / 2, 0.95]));
  return g;
}

/** 條紋木邊几（縱向凹槽的車削圓柱）＋小植物 */
function buildSideTable(rng) {
  const g = new THREE.Group();
  g.name = `${ROOM}:sideTable`;
  const h = 0.44, r = 0.15;
  const body = new THREE.CylinderGeometry(r, r, h - 0.03, 96, 1, true);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 - 0.05 * Math.abs(Math.sin(a * 12));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  body.computeVertexNormals();
  g.add(place(cylUV(body), M.woodOak, 'sideTable:fluted', 0, (h - 0.03) / 2, 0));
  g.add(place(G.lathe([[0, 0], [r + 0.012, 0], [r + 0.016, 0.006], [r + 0.016, 0.024], [r + 0.01, 0.03], [0, 0.03]], 64), M.woodOak, 'sideTable:top', 0, h - 0.03, 0));
  // 小植物（白陶盆）
  g.add(place(G.lathe([[0, 0], [0.045, 0], [0.055, 0.02], [0.062, 0.1], [0.058, 0.1], [0.05, 0.022], [0, 0.022]], 40), M.ceramicWhite, 'plant:pot', 0.02, h, -0.03));
  g.add(place(G.lathe([[0, 0], [0.056, 0], [0, 0.004]], 24), M.soil, 'plant:soil', 0.02, h + 0.088, -0.03));
  const stems = [], leaves = [];
  for (let s = 0; s < 5; s++) {
    const a = rng.range(0, Math.PI * 2), tl = rng.range(0.12, 0.3), ht = rng.range(0.18, 0.32);
    const tip = [0.02 + Math.cos(a) * tl * 0.35, h + 0.09 + ht, -0.03 + Math.sin(a) * tl * 0.35];
    stems.push(G.tube([[0.02, h + 0.085, -0.03], [0.02 + Math.cos(a) * 0.02, h + 0.09 + ht * 0.5, -0.03 + Math.sin(a) * 0.02], tip], 0.0028, { segments: 8, radial: 5 }));
    for (let k = 0; k < 5; k++) {
      const t = 0.4 + 0.6 * (k / 4);
      const lg = new THREE.SphereGeometry(0.028, 8, 6).scale(1, 0.15, 0.55);
      lg.rotateZ(rng.jitter(0.3, 0.4));
      lg.rotateY(rng.range(0, Math.PI * 2));
      lg.translate(0.02 + (tip[0] - 0.02) * t + rng.jitter(0, 0.02), h + 0.09 + ht * t, -0.03 + (tip[2] + 0.03) * t + rng.jitter(0, 0.02));
      leaves.push(lg);
    }
  }
  g.add(mesh(G.worldUV(mergeGeometries(stems)), M.stem, 'plant:stems'));
  g.add(mesh(G.worldUV(mergeGeometries(leaves)), M.leafGreen, 'plant:leaves'));
  return g;
}

// ═══════════════════════════════════════════════════════
// 西牆貓跳台
// ═══════════════════════════════════════════════════════
/** 浮空層板（圓角），貼西牆，top = 上表面高度 */
function shelf(wx, zc, top, len, depth, name) {
  return place(G.extrudeRounded(G.roundedRectShape(depth - 0.012, len - 0.012, 0.035), SHELF_T, 0.005), M.woodOak, name, wx + depth / 2, top - SHELF_T, zc);
}
/** 麻繩貓抓柱：一圈圈繩紋的車削柱，上下木圓盤 */
function scratchPost(x, y0, y1, z, name) {
  const g = new THREE.Group();
  g.name = `${ROOM}:${name}`;
  const h = y1 - y0, r = 0.055, pitch = 0.018;
  const prof = [[0, 0], [r - 0.004, 0]];
  for (let y = 0.004; y < h - 0.004; y += pitch / 2) prof.push([Math.round(y / (pitch / 2)) % 2 ? r : r - 0.0045, y]);
  prof.push([r - 0.004, h], [0, h]);
  g.add(place(G.lathe(prof, 28), M.fabricOat, `${name}:rope`, x, y0, z));
  g.add(place(G.lathe([[0, 0], [r + 0.02, 0], [r + 0.022, 0.006], [r + 0.02, 0.014], [0, 0.014]], 32), M.woodOak, `${name}:base`, x, y0, z));
  return g;
}
/** 貓屋：正面挖貓頭形開口，開口朝 +x */
function catHouse(wx, zc, y0, name) {
  const g = new THREE.Group();
  g.name = `${ROOM}:${name}`;
  const D = 0.36, W = 0.42, H = 0.38, t = 0.018;
  const x0 = wx, x1 = wx + D, z0 = zc - W / 2, z1 = zc + W / 2;
  g.add(boxMinMax(x0, x1 - t, y0, y0 + t, z0, z1, M.woodOak, `${name}:floor`));
  g.add(boxMinMax(x0, x1 - t, y0 + H - t, y0 + H, z0, z1, M.woodOak, `${name}:roof`));
  g.add(boxMinMax(x0, x1 - t, y0 + t, y0 + H - t, z0, z0 + t, M.woodOak, `${name}:side`));
  g.add(boxMinMax(x0, x1 - t, y0 + t, y0 + H - t, z1 - t, z1, M.woodOak, `${name}:side`));
  g.add(boxMinMax(x0, x0 + t, y0 + t, y0 + H - t, z0 + t, z1 - t, M.woodOakDark, `${name}:back`));
  // 正面：圓角方板＋貓頭開口（圓臉＋兩個三角耳）
  const outer = new THREE.Shape();
  const rr = 0.02, hw = W / 2, hh = H / 2;
  outer.moveTo(-hw + rr, -hh);
  outer.lineTo(hw - rr, -hh); outer.quadraticCurveTo(hw, -hh, hw, -hh + rr);
  outer.lineTo(hw, hh - rr); outer.quadraticCurveTo(hw, hh, hw - rr, hh);
  outer.lineTo(-hw + rr, hh); outer.quadraticCurveTo(-hw, hh, -hw, hh - rr);
  outer.lineTo(-hw, -hh + rr); outer.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  const hole = new THREE.Path();
  const cy = -0.005, R = 0.105;
  const ear = (deg, c) => Math.max(0, 1 - Math.abs(deg - c) / 17);
  for (let i = 0; i <= 120; i++) {
    const deg = 270 - (i / 120) * 360; // 順時針（洞要與外框反向）
    const d = ((deg % 360) + 360) % 360;
    const r = R + 0.07 * Math.max(ear(d, 52), ear(d, 128));
    const a = THREE.MathUtils.degToRad(deg);
    const px = Math.cos(a) * r, py = cy + Math.sin(a) * r;
    i ? hole.lineTo(px, py) : hole.moveTo(px, py);
  }
  outer.holes.push(hole);
  const front = new THREE.ExtrudeGeometry(outer, { depth: t - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 12 });
  front.rotateY(Math.PI / 2);
  g.add(place(G.worldUV(front), M.woodOak, `${name}:front`, x1 - t + 0.003, y0 + hh, zc));
  // 內墊
  g.add(place(G.mattress(D - 0.06, 0.035, W - 0.06, { radius: 0.015, crown: 0.008 }), M.fabricOat, `${name}:mat`, (x0 + x1 - t) / 2, y0 + t + 0.0175, zc));
  return { group: g, floorY: y0 + t + 0.035, cx: (x0 + x1 - t) / 2 };
}
/** 吊橋：兩條下垂的繩＋扶手繩＋一片片木板 */
function catBridge(xa, xb, za, zb, y, sag, rng) {
  const g = new THREE.Group();
  g.name = `${ROOM}:bridge`;
  const yAt = (t) => y - sag * 4 * t * (1 - t);
  const rope = [], planks = [];
  const n = 13;
  for (const x of [xa, xb]) {
    rope.push(G.tube(Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [x, yAt(t) - 0.008, za + (zb - za) * t]; }), 0.005, { segments: 40, radial: 6 }));
    rope.push(G.tube(Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [x, y + 0.09 - sag * 0.55 * 4 * t * (1 - t), za + (zb - za) * t]; }), 0.004, { segments: 40, radial: 6 }));
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const z = za + (zb - za) * t, yy = yAt(t);
    const slope = (sag * 4 * (2 * t - 1)) / (zb - za);
    const pk = G.roundedBox(xb - xa + 0.03, 0.012, (zb - za) / n - 0.012, 0.003);
    pk.rotateX(-Math.atan(slope));
    pk.rotateY(rng.jitter(0, 0.02));
    pk.translate((xa + xb) / 2, yy, z);
    planks.push(pk);
    if (i % 2 === 0) {
      for (const x of [xa, xb]) {
        const yTop = y + 0.09 - sag * 0.55 * 4 * t * (1 - t);
        rope.push(G.tube([[x, yy, z], [x, yTop, z]], 0.0025, { segments: 2, radial: 4 }));
      }
    }
  }
  g.add(mesh(mergeGeometries(rope), M.fabricOat, 'bridge:ropes'));
  g.add(mesh(mergeGeometries(planks), M.woodOak, 'bridge:planks'));
  return g;
}

// ═══════════════════════════════════════════════════════
// 簡化坐姿貓（面向 +x，原點在腳底中心）
// ═══════════════════════════════════════════════════════
function buildCat(name, coat, belly, rng, s = 1) {
  const g = new THREE.Group();
  g.name = `${ROOM}:${name}`;
  // 身體：梨形車削，前後略扁
  const body = G.lathe([[0, 0], [0.075, 0.004], [0.098, 0.04], [0.1, 0.085], [0.087, 0.135], [0.062, 0.175], [0.036, 0.2], [0, 0.205]], 32);
  body.scale(1.05, 1, 0.85);
  g.add(place(body, coat, `${name}:body`, -0.01, 0, 0));
  // 胸口白毛
  g.add(place(sphere(0.055).scale(0.6, 1.2, 1), belly, `${name}:chest`, 0.06, 0.12, 0));
  // 頭
  const hy = 0.255;
  g.add(place(sphere(0.07, 28, 20).scale(0.95, 0.88, 1.08), coat, `${name}:head`, 0.025, hy, 0));
  // 口鼻（兩顆小鼓起）＋鼻子
  for (const z of [-0.017, 0.017]) g.add(place(sphere(0.022).scale(0.8, 0.75, 1), belly, `${name}:muzzle`, 0.08, hy - 0.025, z));
  g.add(place(sphere(0.008, 10, 8).scale(0.7, 0.6, 1), M.fabricBlush, `${name}:nose`, 0.098, hy - 0.012, 0));
  // 眼睛（大圓眼＋亮點）
  for (const z of [-0.028, 0.028]) {
    g.add(place(sphere(0.0135, 16, 12).scale(0.55, 1, 1), M.plasticBlack, `${name}:eye`, 0.083, hy + 0.008, z));
    g.add(place(sphere(0.004, 8, 6), M.plasticWhite, `${name}:eyeGlint`, 0.091, hy + 0.013, z - 0.004 * Math.sign(z)));
  }
  // 耳朵（外＋粉色內耳）
  for (const sz of [-1, 1]) {
    const e = new THREE.ConeGeometry(0.03, 0.055, 4, 1);
    e.rotateY(Math.PI / 4);
    e.scale(0.55, 1, 1);
    g.add(place(G.worldUV(e), coat, `${name}:ear`, 0.02, hy + 0.068, sz * 0.042, [0, 0, 0], undefined));
    g.children[g.children.length - 1].rotation.set(sz * 0.32, 0, -0.08);
    const ie = new THREE.ConeGeometry(0.018, 0.035, 4, 1);
    ie.rotateY(Math.PI / 4);
    ie.scale(0.3, 1, 1);
    const inner = place(G.worldUV(ie), M.fabricBlush, `${name}:earInner`, 0.032, hy + 0.064, sz * 0.042);
    inner.rotation.set(sz * 0.32, 0, -0.08);
    g.add(inner);
  }
  // 前腳
  for (const z of [-0.03, 0.03]) {
    g.add(place(G.tube([[0.06, 0.1, z], [0.072, 0.05, z], [0.074, 0.012, z]], 0.019, { segments: 8, radial: 10 }), coat, `${name}:leg`, 0, 0, 0));
    g.add(place(sphere(0.021).scale(1.3, 0.6, 1), belly, `${name}:paw`, 0.082, 0.011, z));
  }
  // 後腿（側面鼓起）
  for (const z of [-0.07, 0.07]) g.add(place(sphere(0.05).scale(1.2, 0.8, 0.6), coat, `${name}:haunch`, -0.02, 0.045, z));
  // 尾巴：從背後繞到前腳旁
  const tail = [[-0.1, 0.03, 0], [-0.13, 0.02, -0.05], [-0.08, 0.012, -0.1], [0.0, 0.012, -0.11], [0.07, 0.014, -0.08]];
  g.add(place(G.tube(tail, 0.017, { segments: 30, radial: 10 }), coat, `${name}:tail`, 0, 0, 0));
  g.add(place(sphere(0.017), coat, `${name}:tailTip`, 0.07, 0.014, -0.08));
  g.scale.setScalar(s);
  g.rotation.y = rng.jitter(0, 0.15);
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
  const winClearZ = I.z1 - 0.1;     // 高於窗台的東西不可超過這條線（百葉簾＋0.15m 規則）

  // ── 南端地台（先定 z，書桌南段收納櫃與它對齊） ──
  const platZ0 = I.z1 - PLAT.d;
  // 東牆北段：門掃掠區旁的頂天書櫃，之後接書桌（書桌往南到窗牆）
  const caseZ1 = Math.min(I.z0 + 0.82, platZ0 - 1.6);
  root.add(buildBookcase(I, I.z0, caseZ1, rng));
  const desk = buildDesk(I, platZ0, caseZ1 + 0.004);
  root.add(desk.group);
  root.add(buildDeskItems(desk, rng, platZ0));
  const platform = buildPlatform(I, desk.x0);
  root.add(platform.group);

  // 辦公椅：桌前工作區中央，面向書桌（+x）
  const chair = buildOfficeChair(rng);
  chair.position.set(desk.x0 - 0.36, 0, (I.z0 + platZ0) / 2 + 0.02);
  chair.rotation.y = Math.PI / 2 + rng.jitter(-0.12, 0.05);
  root.add(chair);

  // ── 地台上：躺椅（頭端靠窗、朝房內斜放）＋邊几 ──
  const chaise = buildChaise(rng);
  const chaiseYaw = -0.28;
  chaise.position.set((platform.x0 + platform.x1) / 2 + 0.03, platform.top, platZ0 + PLAT.d / 2 + 0.02);
  chaise.rotation.y = chaiseYaw;
  root.add(chaise);
  const table = buildSideTable(rng);
  table.position.set(platform.x1 - 0.2, platform.top, platZ0 + 0.27);
  root.add(table);

  // ── 西牆貓跳台 ──
  const wx = I.x0;
  const zA = Math.max(swingZ1 + 0.05, I.z0);           // 門掃掠區以南
  const zE = I.z1;
  const shelves = [
    // [z 中心, 上表面高度, 長(z), 深(x)]
    [zA + 0.65, 0.52, 0.4, 0.3],            // 0 低踏階
    [platZ0 + 0.2, 0.86, 0.42, 0.3],        // 1 白貓層板（地台上方）
    [zA + 0.25, 1.3, 0.42, 0.32],           // 2 貓抓柱 A 的頂
    [zA + 0.75, 1.62, 0.38, 0.3],           // 3
    [zA + 1.3, 1.98, 0.38, 0.3],            // 4 吊橋起點
    [zE - 0.3, 1.4, 0.4, 0.3],              // 5 貓抓柱 B 的頂
    [platZ0 + 0.52, 1.92, 0.52, 0.38],      // 6 貓屋底板（吊橋終點）
    [zA + 0.75, 2.38, 0.38, 0.28],          // 7 高處
    [Math.max(I.z0 + 0.2, zA - 0.25), 2.42, 0.34, 0.26], // 8 門上方（高於門高）
    [zA + 1.78, 1.25, 0.4, 0.3],            // 9 中段
    [zA + 2.05, 0.62, 0.4, 0.3],            // 10 地台前低踏階
  ];
  shelves.forEach(([zc, top, len, dep], i) => root.add(shelf(wx, zc, top, len, dep, `catShelf${i}`)));
  // 貓抓柱
  root.add(scratchPost(wx + 0.16, 0, shelves[2][1] - SHELF_T, shelves[2][0], 'scratchPostA'));
  root.add(scratchPost(wx + 0.15, platform.top, shelves[5][1] - SHELF_T, shelves[5][0], 'scratchPostB'));
  // 貓屋
  const house = catHouse(wx, shelves[6][0], shelves[6][1], 'catHouse');
  root.add(house.group);
  // 吊橋：層板 4 的南緣 → 貓屋層板的北緣
  const bz0 = shelves[4][0] + shelves[4][2] / 2 - 0.02;
  const bz1 = shelves[6][0] - shelves[6][2] / 2 + 0.02;
  root.add(catBridge(wx + 0.05, wx + 0.25, bz0, bz1, shelves[4][1] + 0.004, 0.16, rng));

  // 貓咪：白貓坐在層板 1（地台上方），虎斑貓在貓屋裡往外看
  const white = buildCat('catWhite', M.fabricWhite, M.fabricWhite, rng.fork('catWhite'), 1);
  white.position.set(wx + 0.15, shelves[1][1], shelves[1][0]);
  root.add(white);
  const tabby = buildCat('catTabby', M.fabricTaupe, M.fabricOat, rng.fork('catTabby'), 0.74);
  tabby.position.set(house.cx + 0.05, house.floorY, shelves[6][0]);
  tabby.rotation.y = 0;
  root.add(tabby);

  // 踢腳板（北牆門東側、西牆門掃掠區到地台）
  const bb = new THREE.Group();
  bb.name = `${ROOM}:baseboards`;
  if (swing) bb.add(boxMinMax(swing.x1 + 0.01, desk.x0, 0, 0.08, I.z0, I.z0 + 0.012, M.baseboard, 'baseboard'));
  bb.add(boxMinMax(I.x0, I.x0 + 0.012, 0, 0.08, swingZ1 + 0.01, platZ0 - 0.012, M.baseboard, 'baseboard'));
  root.add(bb);

  // 燈光：吊櫃底 LED 暖光 ×2（不開陰影）
  for (const [i, f] of [[0, 0.3], [1, 0.72]]) {
    const pl = new THREE.PointLight(L.LIGHT_COLORS.k2700, 1.6, 2.8, 2);
    pl.name = `${ROOM}:light:led${i}`;
    pl.position.set(desk.ux0 + 0.08, desk.uy0 - 0.06, I.z0 + (I.z1 - I.z0) * f);
    pl.castShadow = false;
    root.add(pl);
  }
  void sill; void winClearZ;
  return root;
}
