/**
 * main.js — 組裝場景：外殼 + 六區家具，開瀏覽器預覽。
 *
 * 網址參數：
 *   (無)                       全屋鳥瞰（拿掉天花與屋頂）
 *   ?room=kitchen              站在廚房角落、人眼高度看房間
 *   ?room=kitchen&corner=2     換一個角落（0~3）
 *   ?room=kitchen&view=top     廚房正上方俯視（拿掉天花）
 *   ?cam=3.4,1.45,2.85&look=2.8,1.0,0.7[&fov=70]  自訂鏡頭位置與注視點
 *   ?t=12.5                    影片運鏡在第 12.5 秒的畫面（layout.CAMERA_PATH）
 *   ?play=1                    訪客播放器：點「開始」後播放 60 秒導覽（含旁白，可加 &t= 起始秒數）
 *   ?render=1                  逐格輸出影片（由 tools/render.mjs 驅動，不要手動開）
 *   &ao=0                      關掉環境遮蔽（比較用）
 *   &nocap=1                   不顯示字卡（片頭標題、房間名稱、片尾）
 *   ?cam=..&look=..&guideAt=17 自訂鏡頭＋擺出導覽員在第 17 秒的姿勢（近拍角色用）
 *   &pt=64                     搭配 render：用路徑追蹤，每格 64 次取樣（tools/render.mjs --pt=64）
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** 鏡頭暗角：四角暗約 18%，很淡，像實際相機鏡頭 */
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.18 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - strength * smoothstep(0.15, 0.75, dot(d, d) * 2.0);
      gl_FragColor = c;
    }`,
};
import * as L from './layout.js';
import { buildShell } from './shell.js';
import { cameraAt, applyCamera } from './camera.js';
import { drawCaptions, drawStamp } from './captions.js';
import { createGuide } from './guide.js';
import { createRoomProbes } from './probes.js';
import { createProps } from './guide-props.js';
import { showLanding, createPlayer } from './ui.js';

export const AREAS = ['living', 'masterBed', 'secondBed', 'kitchen', 'bathroom', 'balcony', 'entrance', 'smallRoom', 'hall'];

const params = new URLSearchParams(location.search);
const focusRoom = params.get('room');
const view = params.get('view') ?? (focusRoom ? 'eye' : 'top');
const corner = Number(params.get('corner') ?? 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// ACES：對比與色彩較飽滿；&tone=agx 改用 AgX（較平、較灰，比較用）
renderer.toneMapping = params.get('tone') === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
// 曝光 0.85：白牆不會整片過曝成純白，看得到燈光的漸層（像相機拍的）
renderer.toneMappingExposure = Number(params.get('exposure') ?? 0.85);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 500);
scene.add(buildShell());
scene.environment = buildWarmEnvironment(renderer);

// —— 導覽員角色（嘴型資料由 tools/voice.mjs 產生；沒有就閉嘴不動） ——
// 有 avatar/guide.vrm（VRoid 匯出，不進 git）就用它，沒有就用程式生成的公仔；&procguide=1 強制用公仔
let guide = null;
if (!params.has('procguide')) {
  try {
    const { createVrmGuide } = await import('./guide-vrm.js');
    guide = await createVrmGuide('./avatar/guide.vrm');
  } catch (e) {
    console.info('[guide] 沒有 VRM 角色，改用程式公仔：', e.message);
  }
}
guide ??= createGuide();
// 用了 VRM 角色就不是「全程式生成」了：片尾副標改成註明角色出處
const endingSub = guide.credit ? `場景全程式生成｜${guide.credit}` : null;
if (!params.has('noguide')) scene.add(guide.root);   // &noguide=1：不放導覽員（比較用）
guide.root.visible = false;
try {
  const res = await fetch('./output/lipsync.json', { cache: 'no-store' });
  if (res.ok) guide.setLipsync(await res.json());
} catch { /* 沒有嘴型資料也能跑 */ }

/**
 * 程式生成的暖色環境反射（不是貼圖）：一個暗暖色房間盒，加上幾片暖光面板，
 * 用 PMREM 預先算好。讓金屬、陶瓷、玻璃有東西可以反射，不會發黑。
 */
function buildWarmEnvironment(renderer) {
  const env = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x8a8580, side: THREE.BackSide }));
  env.add(box);
  const panel = (color, strength, w, h, pos, rotY = 0, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(rotX, rotY, 0);
    env.add(m);
  };
  panel(L.LIGHT_COLORS.k3000, 1.6, 4, 4, [0, 2.9, 0], 0, Math.PI / 2);      // 天花燈
  panel(L.LIGHT_COLORS.sunset, 2.2, 5, 2.5, [0, 1.2, 4.9]);                  // 南側窗光
  panel(0xf1e8dc, 0.7, 8, 3, [-4.9, 1.5, 0], Math.PI / 2);                    // 米白牆反射
  panel(0xa89078, 0.5, 9, 9, [0, -2.9, 0], 0, Math.PI / 2);                  // 木地板反射
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}

const errors = [];
for (const id of AREAS) {
  try {
    const mod = await import(`./rooms/${id}.js`);
    scene.add(mod.build());
  } catch (e) {
    errors.push(`${id}: ${e.message}`);
    console.error(`[room ${id}]`, e);
  }
}

// —— 導覽員的道具（鍋子、鍋鏟、爐火、蒸氣、花灑出水、淋浴拉門），跟著導覽員的姿勢更新 ——
const props = createProps(scene);
scene.add(props.root);
/** 擺好第 t 秒的導覽員和道具 */
function stepGuide(t, cam) {
  const pose = guide.update(t, cam);
  props.update(t, pose, guide);
  return pose;
}
props.update(0, null, guide);

// —— 後製：多重取樣 → 環境遮蔽（GTAO）→ 色調輸出 ——
// 環境遮蔽讓家具貼地、轉角、物件接觸處有柔和陰影，是「不浮起來」的關鍵。
// 兩套畫質（tools/bench.mjs 實測，GT 710：完整約 150 毫秒／格、快速約 55 毫秒／格）：
//   full：4 倍多重取樣＋環境遮蔽 → 輸出影片、畫面靜止時
//   fast：不取樣、不做環境遮蔽     → 瀏覽時鏡頭移動中；停下來會補畫一張 full
const isVideo = params.has('render');
const useAO = params.get('ao') !== '0';
function makeComposer(samples, withAO) {
  const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
  c.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (withAO) {
    ao = new GTAOPass(scene, camera, 1, 1);
    ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, distanceFallOff: 1, scale: 1.1, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 0.85;
    c.addPass(ao);
    // 柔光（&bloom=1）：很亮的地方有一圈光暈。實測白牆本身就很亮，開了整個畫面會像起霧，預設關閉
    if (params.get('bloom') === '1') c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.5, 2.5));
  }
  c.addPass(new OutputPass());
  if (withAO && params.get('vignette') !== '0') c.addPass(new ShaderPass(VignetteShader));   // 四角微暗
  return { c, ao };
}
const full = makeComposer(Number(params.get('msaa') ?? 4), useAO);
const fast = isVideo ? null : makeComposer(0, false);
const aoPass = full.ao;

// 陰影：房子是靜態的，瀏覽時陰影圖只算一次（每格重算等於整個場景多畫一遍）。
// 影片輸出（或 &shadow=live）才每格重算，導覽員才有會動的影子。
const liveShadow = isVideo || params.get('shadow') === 'live';
if (!liveShadow) {
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  guide.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });   // 不然影子會停在第一格的姿勢
}

const setRenderSize = (w, h, ratio) => {
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  // 快速畫質用較低解析度（移動中看不出來），最後放大到整個畫面
  const fastScale = Number(params.get('fastscale') ?? 0.7);
  for (const q of [full, fast]) {
    if (!q) continue;
    q.c.setPixelRatio(q === fast ? ratio * fastScale : ratio);
    q.c.setSize(w, h);
  }
  // 環境遮蔽用較低解析度算（&aoscale=0.5），柔和陰影本來就模糊，差別看不太出來
  const aoScale = Number(params.get('aoscale') ?? 1);
  if (aoPass && aoScale !== 1) aoPass.setSize(Math.round(w * ratio * aoScale), Math.round(h * ratio * aoScale));
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
};
/** hq=false：用快速畫質（瀏覽時移動中）；&quality=fast 一律用快速畫質（顯示卡很弱時） */
const forceFast = params.get('quality') === 'fast';
const draw = (hq = true) => (((hq && !forceFast) || !fast) ? full : fast).c.render();
// 瀏覽時解析度上限 1.5 倍（高 DPI 螢幕 2 倍的像素量是 1.5 倍的 1.8 倍）
const viewRatio = () => Math.min(devicePixelRatio, 1.5);
setRenderSize(innerWidth, innerHeight, viewRatio());

// —— 鳥瞰時要隱藏的物件（天花、屋頂、嵌燈） ——
const ceilingObjects = [];
scene.traverse((o) => {
  if (o.name === 'ceilings' || o.name === 'roof' || o.name.startsWith('ceilingFixture:')) ceilingObjects.push(o);
});
// —— 只在鳥瞰時出現的物件（展示底座） ——
const aerialObjects = [];
scene.traverse((o) => { if (o.name === 'plinth') aerialObjects.push(o); });
const showCaptions = !params.has('nocap');

// —— 點光源只開離鏡頭最近的幾盞 ——
// 這些燈沒有陰影，別間房的燈會穿牆照過來（不寫實），而且每盞燈每個像素都要算一次。
// 同房間的燈優先；開著的燈數固定，換鏡頭時不會重新編譯 shader（不會卡頓）。
const pointLights = [];
scene.traverse((o) => { if (o.isPointLight) pointLights.push(o); });
for (const l of pointLights) l.userData.room = L.roomAt(l.position.x, l.position.z);
const MAX_LIGHTS = Math.min(pointLights.length, Number(params.get('lights') ?? 10));
function cullLights(pos, ceilingsOn = true) {
  if (MAX_LIGHTS >= pointLights.length) return;
  const here = L.roomAt(pos.x, pos.z);
  const score = (l) => l.position.distanceTo(pos) + (ceilingsOn && l.userData.room !== here ? 2.5 : 0);
  const ranked = [...pointLights].sort((a, b) => score(a) - score(b));
  ranked.forEach((l, i) => { l.visible = i < MAX_LIGHTS; });
}

// —— 每個房間的環境探針（probes.js）：間接光和反射來自自己房間的實際樣子 ——
// &probes=0 關掉，改回統一的暖色環境（比較用）
const baseEnv = scene.environment;
const probes = params.get('probes') === '0' ? null : createRoomProbes(renderer, scene, {
  fallback: baseEnv,
  intensity: Number(params.get('probek') ?? 0.3),   // 實測 0.3 和原本亮度相近；1 會整片發白
  prepare(id, pos) {
    const ceil = ceilingObjects.map((o) => o.visible);
    const aerial = aerialObjects.map((o) => o.visible);
    const guideVis = guide.root.visible;
    for (const o of ceilingObjects) o.visible = true;
    for (const o of aerialObjects) o.visible = false;
    guide.root.visible = false;
    cullLights(pos, true);
    return () => {
      ceilingObjects.forEach((o, i) => { o.visible = ceil[i]; });
      aerialObjects.forEach((o, i) => { o.visible = aerial[i]; });
      guide.root.visible = guideVis;
    };
  },
});
// 環境光、半球光是「假的間接光」；室內有探針（真的間接光）時關掉，不然會重複打亮、畫面發白
const fillLights = [];
scene.traverse((o) => { if (o.isAmbientLight || o.isHemisphereLight) fillLights.push([o, o.intensity]); });
/** 鏡頭到某個位置時的燈光：環境探針＋最近的點光源（interior=false：鳥瞰） */
function lightFor(pos, interior = true) {
  if (probes) {
    scene.environment = interior ? probes.envAt(pos) : baseEnv;   // 拍探針時假補光還開著（當第一次反彈）
    const fill = interior ? Number(params.get('fill') ?? 0) : 1;
    for (const [l, k] of fillLights) l.intensity = k * fill;
  }
  cullLights(pos, interior);
}

const timeline = params.has('t') || params.has('play') || params.has('render');
const finish = () => {
  window.__ERRORS = errors;
  window.__READY = true;
  if (errors.length) document.title = 'ERRORS: ' + errors.join(' | ');
};

if (params.has('bench')) {
  // ═══ 效能測試（tools/bench.mjs）：幾個代表鏡頭各畫 40 格，量每格時間 ═══
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // 等 GPU 真的畫完
  const shots = [['全屋鳥瞰', 3], ['客廳', 16], ['廚房', 28.5], ['主臥', 43], ['次臥', 52]];
  const rows = [];
  for (const [name, t] of shots) {
    const state = cameraAt(t);
    applyCamera(state, camera, ceilingObjects, renderer, 1, aerialObjects);
    lightFor(state.ceilings === false ? state.target : camera.position, state.ceilings !== false);
    for (let i = 0; i < 5; i++) { stepGuide(t, camera); draw(); sync(); }
    const N = 30;
    const time = (hq) => {
      const t0 = performance.now();
      for (let i = 0; i < N; i++) { stepGuide(t + i / 30, camera); draw(hq); sync(); }
      return (performance.now() - t0) / N;
    };
    const ms = time(true), msFast = fast ? time(false) : null;
    renderer.info.autoReset = false;
    renderer.info.reset();
    renderer.render(scene, camera);
    let lights = 0;
    scene.traverse((o) => { if (o.isPointLight && o.visible) lights++; });
    rows.push({ name, ms, msFast, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, lights });
    renderer.info.autoReset = true;
  }
  await fetch('/bench', { method: 'POST', body: JSON.stringify({ rows, errors, startup: performance.now(), size: `${renderer.domElement.width}×${renderer.domElement.height}` }) });
  finish();
} else if (params.has('render')) {
  // 頁面錯誤直接回報給 tools/render.mjs，不要讓它乾等
  const report = (msg) => fetch('/done', { method: 'POST', body: JSON.stringify({ errors: [...errors, `頁面錯誤：${msg}`] }) });
  addEventListener('error', (e) => report(e.message));
  addEventListener('unhandledrejection', (e) => report(e.reason?.stack ?? String(e.reason)));
  // ═══ 逐格輸出：時間只由格數決定，與機器快慢無關 ═══
  const { fps, width, height, duration } = L.VIDEO;
  setRenderSize(width, height, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const total = Math.round(duration * fps);
  probes?.captureAll();          // 先拍好所有房間的環境探針，輸出過程不會中途變化
  const from = Number(params.get('from') ?? 0);
  const to = Number(params.get('to') ?? total);
  const quality = Number(params.get('q') ?? 0.95);
  // &step=N：每 N 格取一格；&stamp=1：左上角印時間與鏡頭名稱（tools/sheet.mjs 做影格表用）
  const step = Math.max(1, Number(params.get('step') ?? 1));
  const stamp = params.has('stamp');
  // &pt=N：改用路徑追蹤，每格累積 N 次取樣（品質高、慢很多）
  const ptSamples = Number(params.get('pt') ?? 0);
  let tracer = null;
  if (ptSamples > 0) {
    const { createPathTracer } = await import('./pathtrace.js');
    tracer = createPathTracer(renderer, scene, camera);
    tracer.setSize(width, height);
  }
  // 合成用畫布：3D 畫面 + 字卡
  const comp = document.createElement('canvas');
  comp.width = width;
  comp.height = height;
  const cctx = comp.getContext('2d');
  // &cam=..&look=..：固定鏡頭（近拍導覽員檢查用），其餘照影片時間走
  const fixCam = params.get('cam')?.split(',').map(Number);
  const fixLook = params.get('look')?.split(',').map(Number);
  for (let f = from; f < to; f += step) {
    const state = cameraAt(f / fps);
    applyCamera(state, camera, ceilingObjects, renderer, 1, aerialObjects);
    lightFor(state.ceilings === false ? state.target : camera.position, state.ceilings !== false);
    if (fixCam?.length === 3 && fixLook?.length === 3) {
      camera.position.set(...fixCam);
      camera.lookAt(...fixLook);
      camera.fov = Number(params.get('fov') ?? 40);
      camera.updateProjectionMatrix();
    }
    stepGuide(f / fps, camera);
    if (tracer) {
      tracer.prepare(state.ceilings);
      tracer.render(ptSamples);
    } else {
      draw();
    }
    cctx.drawImage(renderer.domElement, 0, 0, width, height);
    if (showCaptions) drawCaptions(cctx, f / fps, width, height, endingSub);
    if (stamp) drawStamp(cctx, f / fps, state, width);
    const blob = await new Promise((r) => comp.toBlob(r, 'image/jpeg', quality));
    await fetch(`/frame?i=${f}`, { method: 'POST', body: blob });
  }
  await fetch('/done', { method: 'POST', body: JSON.stringify({ errors }) });
  finish();
} else if (timeline) {
  // ═══ 預覽：?t= 停在某一秒；?play=1 即時播放 ═══
  let t0 = Number(params.get('t') ?? 0);
  // ?play=1：給訪客的播放器（點開始才播放，畫面跟著旁白音軌走）
  const player = params.has('play') ? createPlayer(t0, './output/soundtrack.mp3') : null;
  let lastT = NaN;             // 畫面時間沒變（還沒按開始、?t= 定格）就不重畫
  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    setRenderSize(innerWidth, innerHeight, viewRatio());
    lastT = NaN;
  };
  addEventListener('resize', resize);
  // 字卡疊在 3D 畫面上
  const overlay = document.createElement('canvas');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  document.body.appendChild(overlay);
  const octx = overlay.getContext('2d');
  // 播放中自動選畫質：先用完整畫質量 20 格，夠快（約 30fps 以上）就一直用完整畫質，否則改用快速畫質
  let playHQ = true, probe = [], lastNow = 0;
  const pickQuality = (now) => {
    if (probe) {
      if (lastNow) probe.push(now - lastNow);
      if (probe.length >= 20) { playHQ = probe.sort((a, b) => a - b)[10] < 34; probe = null; }
    }
    lastNow = now;
    return playHQ;
  };
  let frames = 0;
  renderer.setAnimationLoop((now) => {
    const t = player ? player.time() : t0;
    if (t === lastT) return;
    const moving = !Number.isNaN(lastT);
    lastT = t;
    const state = cameraAt(t);
    applyCamera(state, camera, ceilingObjects, renderer, 1, aerialObjects);
    lightFor(state.ceilings === false ? state.target : camera.position, state.ceilings !== false);
    stepGuide(t, camera);
    if (params.has('play')) document.title = `${t.toFixed(1)}s · ${state.shot}`;
    draw(moving ? pickQuality(now) : true);
    const r = viewRatio();
    if (overlay.width !== Math.round(innerWidth * r)) { overlay.width = Math.round(innerWidth * r); overlay.height = Math.round(innerHeight * r); }
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (showCaptions) drawCaptions(octx, t, overlay.width, overlay.height, endingSub);
    if (++frames === 1) finish();
  });
} else {
  // ═══ 一般預覽（OrbitControls） ═══
  const controls = new OrbitControls(camera, renderer.domElement);
  if (!location.search) showLanding();     // 沒有任何參數＝訪客首頁
  if (view === 'top') for (const o of ceilingObjects) o.visible = false;
  const aerialView = view === 'top' && !focusRoom && !params.has('cam');
  for (const o of aerialObjects) o.visible = aerialView;

  // ?cam=x,y,z&look=x,y,z 可指定任意鏡頭（預覽、運鏡規劃用）
  const cam = params.get('cam')?.split(',').map(Number);
  const look = params.get('look')?.split(',').map(Number);
  if (cam?.length === 3 && look?.length === 3) {
    camera.position.set(...cam);
    controls.target.set(...look);
    camera.fov = Number(params.get('fov') ?? 70);
    camera.updateProjectionMatrix();
  } else if (focusRoom && L.ROOMS[focusRoom]) {
    const r = L.roomInterior(focusRoom);
    const [cx, cz] = L.rectCenter(r);
    if (view === 'top') {
      const span = Math.max(r.x1 - r.x0, r.z1 - r.z0);
      camera.position.set(cx, span * 1.25 + 2.5, cz + 0.01 + span * 0.35);
      controls.target.set(cx, 0, cz);
    } else {
      const corners = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
      const [px, pz] = corners[((corner % 4) + 4) % 4];
      const inset = 0.25;
      camera.position.set(px + Math.sign(cx - px) * inset, 1.6, pz + Math.sign(cz - pz) * inset);
      camera.fov = 75;
      camera.updateProjectionMatrix();
      controls.target.set(cx, 0.9, cz);
    }
  } else {
    const [cx, cz] = L.rectCenter(L.BOUNDS);
    // 首頁有面板蓋在下方，注視點往前移，讓房子顯示在畫面上半部
    const shift = location.search ? 0 : 2.6;
    camera.position.set(cx + 2, 15, cz + 11 + shift);
    controls.target.set(cx, 0, cz + shift);
  }
  controls.enableDamping = true;           // 放手後慣性滑一下，操作比較順
  controls.dampingFactor = 0.12;
  controls.update();

  // 只在畫面需要變的時候才畫：拖曳中用快速畫質，停下來 0.2 秒後補畫一張完整畫質
  let dirty = true, hqDone = false, lastMove = 0, still = true;
  const touch = () => { dirty = true; hqDone = false; still = false; lastMove = performance.now(); };
  controls.addEventListener('change', touch);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    setRenderSize(innerWidth, innerHeight, viewRatio());
    dirty = true;
    if (hqDone) still = true;              // 沒在拖曳時改視窗大小：直接畫完整畫質（拖曳中就維持快速）
  });

  // ?guideAt=秒數：一般預覽時也擺出導覽員在那個時間點的姿勢（近拍角色用）
  const guideAt = params.has('guideAt') ? Number(params.get('guideAt')) : null;
  const lightsAt = () => (aerialView ? controls.target : camera.position);
  let frames = 0;
  renderer.setAnimationLoop(() => {
    controls.update();                     // 有慣性時會觸發 change
    const now = performance.now();         // 和 lastMove 用同一個時鐘
    if (dirty) {
      dirty = false;
      lightFor(lightsAt(), !aerialView);
      if (guideAt !== null) stepGuide(guideAt, camera);
      draw(still);                         // 第一張、改視窗大小：直接用完整畫質
      hqDone = still;
    } else if (!hqDone && now - lastMove > 200) {
      hqDone = true;
      draw(true);
    } else {
      return;
    }
    if (++frames === 1) finish();
  });
}
