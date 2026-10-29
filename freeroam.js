/**
 * freeroam.js — 自由走動模式（?walk=1）：第三人稱操作導覽員
 *   W A S D／方向鍵 依鏡頭方向走、Shift 跑、滑鼠拖曳轉視角、滾輪拉近拉遠
 *   E：靠近沙發／床坐下、爐台炒菜、淋浴拉門開關、淋浴間裡試水溫；坐著或炒菜時再按 E（或直接走）結束
 *   Q：揮手
 * 碰撞：開場時把家具、牆、門片的包圍盒畫進 5 公分的格子（和 tools/check-guide.mjs 同一套邏輯），
 *   角色撞到會沿牆滑；鏡頭撞到牆會自動拉近。屋外一律擋住。
 * 動作沿用 guide-motion.js（影片導覽同一套），互動位置來自 layout.GUIDE.script。
 */
import * as THREE from 'three';
import * as L from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const CELL = 0.05;
const RADIUS = 0.18;                   // 角色半徑
const WALK = 1.3, RUN = 2.6;           // 公尺／秒
const SLIDER = /^bathroom:shower:(glass:slider|handle)/;
const SKIP = /^(floor|ceiling|sky|slab|roof|plinth|ceilingFixture|guide|prop)/;

/** 碰撞格子：body＝角色能不能站（已含半徑），cam＝鏡頭能不能放（每格記住被佔的高度範圍） */
function buildGrid(scene, skipRoots) {
  const x0 = L.BOUNDS.x0 - 0.5, z0 = L.BOUNDS.z0 - 0.5;
  const nx = Math.ceil((L.BOUNDS.x1 - L.BOUNDS.x0 + 1) / CELL), nz = Math.ceil((L.BOUNDS.z1 - L.BOUNDS.z0 + 1) / CELL);
  const raw = new Uint8Array(nx * nz);
  const cam = new Map();                // 格子 → [[minY, maxY], …]
  const slider = [];
  const idx = (i, j) => j * nx + i;
  const cellOf = (x, z) => [Math.floor((x - x0) / CELL), Math.floor((z - z0) / CELL)];
  const skip = new Set(skipRoots);
  scene.updateMatrixWorld(true);        // 還沒畫過第一格時，群組（例如門的轉軸）的世界座標還沒算
  const visit = (o) => {
    if (skip.has(o) || SKIP.test(o.name)) return;
    if (o.isMesh && o.visible !== false) {
      const b = new THREE.Box3().setFromObject(o);
      if (b.isEmpty() || (b.max.x - b.min.x) * (b.max.z - b.min.z) > 30) return;   // 天空、整片地板之類
      if (SLIDER.test(o.name)) { slider.push([o, b.clone(), o.position.x]); return; }
      const [i0, j0] = cellOf(b.min.x, b.min.z), [i1, j1] = cellOf(b.max.x, b.max.z);
      const body = b.max.y > 0.15 && b.min.y < 1.6;    // 15 公分以下（拖鞋、地毯、門檻）跨得過去，不算障礙
      for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
          if (body) raw[idx(i, j)] = 1;
          const k = idx(i, j);
          (cam.get(k) ?? cam.set(k, []).get(k)).push([b.min.y, b.max.y]);
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(scene);
  // 屋外（不在任何房間裡）一律擋住
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
      if (!L.roomAt(x, z)) { raw[idx(i, j)] = 1; cam.set(idx(i, j), [[-10, 10]]); }
    }
  }
  // 每格離最近障礙物的距離（公尺，最多算到半徑多一點）：比「能不能站」多一個資訊，
  // 動作結束時角色停在貼著家具的位置（離障礙物小於半徑），也能判斷「往外走」是在脫困
  const MAXC = RADIUS + 0.1;
  const clear = new Float32Array(nx * nz).fill(MAXC);
  const w = Math.ceil(MAXC / CELL);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!raw[idx(i, j)]) continue;
      for (let dj = -w; dj <= w; dj++) {
        for (let di = -w; di <= w; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const d = Math.hypot(di, dj) * CELL;
          if (d < clear[idx(ii, jj)]) clear[idx(ii, jj)] = d;
        }
      }
    }
  }
  /** (x, z) 離最近障礙物多遠；off＝淋浴拉門目前的位移 */
  function clearance(x, z, off = 0) {
    const [i, j] = cellOf(x, z);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 0;
    let c = clear[idx(i, j)];
    for (const [, b] of slider) {
      const dx = Math.max(b.min.x + off - x, 0, x - b.max.x - off), dz = Math.max(b.min.z - z, 0, z - b.max.z);
      c = Math.min(c, Math.hypot(dx, dz));
    }
    return c;
  }
  return {
    slider,
    clearance,
    /** 角色中心站在 (x, z) 身體會不會碰到東西 */
    blocked: (x, z, off = 0) => clearance(x, z, off) < RADIUS,
    /**
     * 從 (x0, z0) 走到 (x1, z1) 可不可以：目的地夠空，或是沒有更靠近障礙物
     * （從貼著家具的位置脫困：沿著沙發、床邊平行走開時距離不變，也要放行）
     */
    canMove(x0, z0, x1, z1, off = 0) {
      const c1 = clearance(x1, z1, off);
      return c1 >= RADIUS || (c1 > 0.02 && c1 >= clearance(x0, z0, off));
    },
    /** 鏡頭放在 p 會不會在牆或家具裡（鏡頭四周留 10 公分） */
    camBlocked(p) {
      if (p.y < 0.15 || p.y > L.CEILING_HEIGHT - 0.12) return true;
      const [ci, cj] = cellOf(p.x, p.z);
      for (let dj = -2; dj <= 2; dj++) {
        for (let di = -2; di <= 2; di++) {
          const iv = cam.get(idx(ci + di, cj + dj));
          if (iv && iv.some(([a, b]) => p.y > a - 0.1 && p.y < b + 0.1)) return true;
        }
      }
      return false;
    },
  };
}

/**
 * ctx：main.js 提供的東西
 *   { scene, camera, renderer, guide, props, stepGuide, draw, lightFor, ceilingObjects, aerialObjects, hud, finish }
 */
export function startFreeRoam(ctx) {
  const { scene, camera, renderer, guide, motion = guide.motion, hud } = ctx;
  for (const o of ctx.ceilingObjects) o.visible = true;
  for (const o of ctx.aerialObjects) o.visible = false;
  camera.fov = 65;
  camera.updateProjectionMatrix();

  const grid = buildGrid(scene, [guide.root, ctx.props.root]);

  // —— 互動點：來自劇本（座標都在 layout.js） ——
  const acts = motion.acts.filter((a) => !a.walk);
  const sits = acts.filter((a) => a.do === 'sit');
  const spots = [
    ...sits.map((a) => ({ act: { ...a, gestures: [] }, kind: 'hold', label: '坐下', out: 1.05 })),
    ...acts.filter((a) => a.do === 'cook').map((a) => ({ act: a, kind: 'hold', label: '炒菜', out: 0.7 })),
    ...acts.filter((a) => a.do === 'slideDoor').map((a) => ({ act: a, kind: 'door' })),
    ...acts.filter((a) => a.do === 'testWater').map((a) => ({ act: a, kind: 'once', label: '試水溫', near: 0.55 })),
  ];
  const doorAct = acts.find((a) => a.do === 'slideDoor');

  // —— 狀態 ——
  const start = L.GUIDE.free?.start ?? [8.2, 1.3];
  const me = { x: start[0], z: start[1], yaw: 0, speed: 0, dist: 0 };
  let mode = 'free', cur = null, approach = null;     // cur：正在做的動作；approach：走向互動點
  let doorOff = 0;
  const view = { yaw: Math.PI, pitch: 0.32, dist: 2.4, shown: 2.4 };
  const keys = new Set();
  let lastInput = performance.now();

  // —— 輸入 ——
  const MOVE = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (MOVE[e.code] || e.code === 'Space') e.preventDefault();
    lastInput = performance.now();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyQ') wave();
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); lastInput = performance.now(); });
  addEventListener('blur', () => keys.clear());
  hud.onAction(() => { lastInput = performance.now(); interact(); });
  hud.onWave(() => { lastInput = performance.now(); wave(); });
  function wave() {
    if (mode === 'free') beginAct({ do: 'wave', at: [me.x, me.z], yaw: me.yaw, yawIn: me.yaw }, 2.6);
  }

  // 拖曳轉視角（滑鼠或單指）；雙指捏合拉遠拉近
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const pts = new Map();
  let drag = null, pinch = null;
  el.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    el.setPointerCapture(e.pointerId);
    lastInput = performance.now();
    if (pts.size === 1) drag = [e.clientX, e.clientY];
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), dist: view.dist };
      drag = null;
    }
  });
  const lift = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    drag = pts.size === 1 ? [...pts.values()][0] : null;
  };
  el.addEventListener('pointerup', lift);
  el.addEventListener('pointercancel', lift);
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    lastInput = performance.now();
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      view.dist = clamp(pinch.dist * pinch.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])), 0.9, 5);
      return;
    }
    if (!drag) return;
    const k = hud.touch ? 1.4 : 1;           // 手指拖曳轉快一點
    view.yaw -= (e.clientX - drag[0]) * 0.006 * k;
    view.pitch = clamp(view.pitch + (e.clientY - drag[1]) * 0.004 * k, -0.25, 1.15);
    drag = [e.clientX, e.clientY];
  });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.dist = clamp(view.dist * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 0.9, 5);
    lastInput = performance.now();
  }, { passive: false });

  let sim = null;                       // 測試用的模擬時鐘（&demo=）；平常用真實時間
  const now = () => sim ?? performance.now() / 1000;
  /** [前後, 左右]：鍵盤 ±1，搖桿是 -1~1 的連續值（推一點點就慢慢走） */
  const moveInput = () => {
    let f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    let r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (Math.hypot(hud.joy.x, hud.joy.y) > 0.12) { f += hud.joy.y; r += hud.joy.x; lastInput = performance.now(); }
    return [clamp(f, -1, 1), clamp(r, -1, 1)];
  };

  function beginAct(act, duration, extra = {}) {
    const t = now();
    cur = { ...act, ...extra, t0: t, t1: duration === Infinity ? Infinity : t + duration, yawIn: me.yaw };
    mode = 'act';
  }

  /** 目前附近可以互動的點（最近的一個） */
  function nearSpot() {
    let best = null, bd = Infinity;
    for (const s of spots) {
      const d = Math.hypot(me.x - s.act.at[0], me.z - s.act.at[1]);
      if (d > (s.near ?? 0.8)) continue;
      if (s.kind === 'once' && doorOff > -0.4) continue;           // 拉門要先打開
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  const spotLabel = (s) => (s.kind === 'door' ? (doorOff < -0.25 ? '關上淋浴拉門' : '拉開淋浴拉門') : s.label);

  function interact() {
    if (mode === 'act') {
      // 坐著、炒菜中：再按 E 結束（起身）
      if (cur.t1 === Infinity) cur.t1 = now() + (cur.out ?? 0.7);
      return;
    }
    if (mode !== 'free') return;
    const s = nearSpot();
    if (!s) return;
    approach = s;
    mode = 'approach';
  }

  function startSpot(s) {
    if (s.kind === 'door') {
      const from = doorOff, to = doorOff < -0.25 ? 0 : doorAct.slide;
      const t0 = now();
      beginAct(s.act, 1.8, { offsetAt: (t) => from + (to - from) * smooth((t - t0 - 0.5) / 0.9), doorTo: to });
    } else if (s.kind === 'once') {
      beginAct(s.act, s.act.t1 - s.act.t0);
    } else {
      beginAct(s.act, Infinity, { out: s.out });
    }
  }

  /** 離 (x, z) 最近、身體不會碰到東西的點（從 yaw 方向開始找）；原地就是空的回傳 null */
  function nearestFree(x, z, yaw) {
    if (!grid.blocked(x, z, doorOff)) return null;
    for (let r = 0.05; r <= 0.8; r += 0.05) {
      for (let k = 0; k < 16; k++) {
        const a = yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);   // 正前方、左右交替往外
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (grid.clearance(px, pz, doorOff) >= RADIUS + 0.01) return [px, pz];
      }
    }
    return null;
  }

  /** 走一步（會沿牆滑） */
  function step(dx, dz) {
    const ok = (x, z) => grid.canMove(me.x, me.z, x, z, doorOff);
    if (ok(me.x + dx, me.z + dz)) { me.x += dx; me.z += dz; return true; }
    if (ok(me.x + dx, me.z)) { me.x += dx; return true; }
    if (ok(me.x, me.z + dz)) { me.z += dz; return true; }
    return false;
  }

  // 出生點如果剛好被擋住，就近找一個空位
  if (grid.blocked(me.x, me.z)) {
    outer: for (let r = 0.05; r < 2; r += 0.05) {
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        if (!grid.blocked(me.x + Math.cos(a) * r, me.z + Math.sin(a) * r)) { me.x += Math.cos(a) * r; me.z += Math.sin(a) * r; break outer; }
      }
    }
  }

  let lastT = now();
  function update() {
    const t = now();
    const dt = clamp(t - lastT, 0, 0.05);
    lastT = t;
    const [f, r] = moveInput();
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(hud.joy.x, hud.joy.y) > 0.92;   // 搖桿推到底＝跑
    let pose;

    if (mode === 'act') {
      // 走動鍵可以中斷「坐著／炒菜」（先起身）、揮手（立刻停）
      if ((f || r) && cur.t1 === Infinity) cur.t1 = t + (cur.out ?? 0.7);
      if ((f || r) && (cur.do === 'wave' || cur.do === 'testWater')) cur.t1 = t;   // 揮手、試水溫：一走就停
      if (t >= cur.t1) {
        if (cur.doorTo !== undefined) doorOff = cur.doorTo;
        me.x = cur.at[0]; me.z = cur.at[1]; me.yaw = cur.yaw;
        mode = 'free'; cur = null;
        // 起身後的站位通常貼著家具：自動往最近的空地踏一步（先試正前方），之後就是一般走動
        const out = nearestFree(me.x, me.z, me.yaw);
        if (out) { approach = { to: out }; mode = 'approach'; }
      } else {
        pose = motion.actPose(cur, t);
        const off = cur.offsetAt ? cur.offsetAt(t) : doorOff;
        pose.props = { ...pose.props, doorSlide: off };
      }
    }

    if (mode === 'approach') {
      // 自動走到互動點的站位（approach.act），或起身後踏到空地（approach.to，不能中斷，很短）
      const [ax, az] = approach.to ?? approach.act.at;
      const d = Math.hypot(ax - me.x, az - me.z);
      if (d < 0.02 || ((f || r) && approach.act)) {
        if (d < 0.02) { me.x = ax; me.z = az; if (approach.act) startSpot(approach); else mode = 'free'; }
        else mode = 'free';
        approach = null;
      } else {
        const v = Math.min(1.0, d / 0.25);
        const s = Math.min(d, v * dt * WALK);
        me.x += ((ax - me.x) / d) * s; me.z += ((az - me.z) / d) * s;
        me.yaw += wrap(Math.atan2(ax - me.x, az - me.z) - me.yaw) * Math.min(1, dt * 10);
        me.speed = s / Math.max(dt, 1e-4); me.dist += s;
      }
    }

    if (mode === 'free' || mode === 'approach') {
      if (mode === 'free') {
        // 依鏡頭方向移動（鏡頭在角色的 view.yaw 方向）
        const fx = -Math.sin(view.yaw), fz = -Math.cos(view.yaw);
        const rx = Math.cos(view.yaw), rz = -Math.sin(view.yaw);
        let mx = fx * f + rx * r, mz = fz * f + rz * r;
        const len = Math.hypot(mx, mz);
        const target = len ? (run ? RUN : WALK) * Math.min(1, len) : 0;
        me.speed += (target - me.speed) * Math.min(1, dt * 8);
        if (len) {
          mx /= len; mz /= len;
          me.yaw += wrap(Math.atan2(mx, mz) - me.yaw) * Math.min(1, dt * 10);
        }
        if (me.speed > 0.01) {
          const s = me.speed * dt;
          const dirx = Math.sin(me.yaw), dirz = Math.cos(me.yaw);
          if (step(dirx * s, dirz * s)) me.dist += s;
          else me.speed *= 0.5;
        }
      }
      pose = motion.standing([me.x, me.z], me.yaw);
      const k = clamp(me.speed / WALK, 0, 1);
      const runK = clamp((me.speed - WALK) / (RUN - WALK), 0, 1);
      if (k > 0.01) motion.gait(pose, me.dist, k, motion.step * (1 + 0.45 * runK));   // 跑步時步伐大一點
      pose.spine.x += 0.12 * runK;
      pose.look = k > 0.2 ? V(me.x + Math.sin(me.yaw) * 3, 1.5, me.z + Math.cos(me.yaw) * 3) : 'camera';
      pose.props = { doorSlide: doorOff };
    }

    ctx.stepGuide(t, camera, pose);

    // —— 鏡頭：跟在角色後上方，撞牆就拉近 ——
    const sitDrop = pose?.hips ? pose.hips.y : 0;
    const target = V(me.x, 1.35 + sitDrop * 0.8, me.z);
    if (mode === 'act' && cur?.at) { target.x = cur.at[0]; target.z = cur.at[1]; }
    const dirAt = (pitch) => V(Math.sin(view.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(view.yaw) * Math.cos(pitch));
    const freeAt = (d) => {
      for (let s = 0.3; s <= view.dist; s += 0.04) {
        if (grid.camBlocked(target.clone().addScaledVector(d, s))) return Math.max(0.3, s - 0.08);
      }
      return view.dist;
    };
    // 後面空間不夠（浴室、走廊）時鏡頭自動抬高往下看，盡量保持 1.1 公尺以上的距離
    let pitch = view.pitch, free = freeAt(dirAt(pitch));
    for (let p = view.pitch + 0.15; free < Math.min(1.1, view.dist) && p <= 1.35; p += 0.15) {
      const f = freeAt(dirAt(p));
      if (f > free + 0.05) { pitch = p; free = f; }
    }
    // 抬高也不夠（背後緊貼牆）：鏡頭自己往旁邊轉，找有空間的方向
    if (free < 0.7) {
      let best = 0, bestFree = free;
      for (const off of [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) {
        const yaw0 = view.yaw;
        view.yaw = yaw0 + off;
        const f = freeAt(dirAt(pitch));
        view.yaw = yaw0;
        if (f > bestFree + 0.15) { best = off; bestFree = f; }
      }
      view.yaw += best * Math.min(1, dt * 3);
    }
    view.lift = (view.lift ?? 0) + (pitch - view.pitch - (view.lift ?? 0)) * Math.min(1, dt * 4);
    const dir = dirAt(view.pitch + view.lift);
    free = Math.min(free, freeAt(dir));
    view.shown = free < view.shown ? free : view.shown + (free - view.shown) * Math.min(1, dt * 3);
    camera.position.copy(target).addScaledVector(dir, view.shown);
    camera.lookAt(target);
    // 鏡頭被擠到離角色不到 0.5 公尺（窄走道、玄關）：先把角色藏起來，不然畫面只看到頭的內側
    if (view.shown < 0.5) guide.root.visible = false;
    ctx.lightFor(camera.position, true);

    hud.map?.update(me.x, me.z, me.yaw, view.yaw);

    // —— 提示 ——
    if (mode === 'free') {
      const s = nearSpot();
      hud.setPrompt(s ? spotLabel(s) : '');
    } else if (mode === 'act' && cur.t1 === Infinity) hud.setPrompt(cur.do === 'sit' ? '起身' : '結束');
    else hud.setPrompt('');

    if (dbg) dbg.textContent = `t=${t.toFixed(1)} mode=${mode} pos=${me.x.toFixed(2)},${me.z.toFixed(2)} v=${me.speed.toFixed(2)} keys=${[...keys].join('+')} near=${nearSpot()?.act.do ?? '-'} demo=${demoLog} cam=${camera.position.toArray().map((v) => v.toFixed(2)).join(',')} yaw=${view.yaw.toFixed(2)} lift=${(view.lift ?? 0).toFixed(2)} shown=${view.shown.toFixed(2)} blocked=${grid.blocked(me.x, me.z, doorOff)}`;
    return mode !== 'free' || me.speed > 0.02 || keys.size > 0 || drag !== null;
  }
  const dbg = new URLSearchParams(location.search).has('dbg')
    ? document.body.appendChild(Object.assign(document.createElement('div'), { style: 'position:fixed;top:60px;left:8px;background:#000;color:#0f0;font:16px monospace;padding:4px' }))
    : null;

  // 測試用：&at=x,z 改出生點；&demo=KeyW+1.5,KeyE,wait+3 依序自動按鍵（+秒數＝按住多久）
  const params = new URLSearchParams(location.search);
  const at = params.get('at')?.split(',').map(Number);
  if (at?.length === 2) { me.x = at[0]; me.z = at[1]; }
  if (params.get('yaw')) view.yaw = Number(params.get('yaw')) * Math.PI / 180;
  // 用模擬時鐘一格一格跑（每秒 30 格），不依賴瀏覽器實際畫幾格：無頭瀏覽器截圖時也能驗證
  const demo = params.get('demo')?.split(',') ?? [];
  let demoLog = '-';
  if (demo.length) {
    sim = 0;
    lastT = 0;
    const run = (sec) => { for (let i = 0; i < Math.round(sec * 30); i++) { sim += 1 / 30; update(); } };
    run(0.2);
    for (const item of demo) {
      const [code, hold = '0.05'] = item.split('+');
      demoLog = item;
      if (code !== 'wait') dispatchEvent(new KeyboardEvent('keydown', { code }));
      run(Number(hold));
      if (code !== 'wait') dispatchEvent(new KeyboardEvent('keyup', { code }));
      run(0.1);
    }
  }

  return { update, lastInput: () => lastInput };
}
