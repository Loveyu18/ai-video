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
import * as L from './layout.js';
import { buildShell } from './shell.js';
import { cameraAt, applyCamera } from './camera.js';
import { drawCaptions } from './captions.js';
import { createGuide } from './guide.js';
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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 500);
scene.add(buildShell());
scene.environment = buildWarmEnvironment(renderer);

// —— 導覽員角色（嘴型資料由 tools/voice.mjs 產生；沒有就閉嘴不動） ——
const guide = createGuide();
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
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x8c7864, side: THREE.BackSide }));
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
  panel(0xb98a5e, 0.5, 9, 9, [0, -2.9, 0], 0, Math.PI / 2);                  // 木地板反射
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

// —— 後製：多重取樣 → 環境遮蔽（GTAO）→ 色調輸出 ——
// 環境遮蔽讓家具貼地、轉角、物件接觸處有柔和陰影，是「不浮起來」的關鍵。
const useAO = params.get('ao') !== '0';
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const aoPass = useAO ? new GTAOPass(scene, camera, 1, 1) : null;
if (aoPass) {
  aoPass.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, distanceFallOff: 1, scale: 1.1, samples: 16 });
  aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  aoPass.blendIntensity = 0.85;
  composer.addPass(aoPass);
}
composer.addPass(new OutputPass());
const setRenderSize = (w, h, ratio) => {
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(ratio);
  composer.setSize(w, h);
  renderer.domElement.style.width = `${w}px`;
  renderer.domElement.style.height = `${h}px`;
};
const draw = () => composer.render();
setRenderSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));

// —— 鳥瞰時要隱藏的物件（天花、屋頂、嵌燈） ——
const ceilingObjects = [];
scene.traverse((o) => {
  if (o.name === 'ceilings' || o.name === 'roof' || o.name.startsWith('ceilingFixture:')) ceilingObjects.push(o);
});
// —— 只在鳥瞰時出現的物件（展示底座） ——
const aerialObjects = [];
scene.traverse((o) => { if (o.name === 'plinth') aerialObjects.push(o); });
const showCaptions = !params.has('nocap');

const timeline = params.has('t') || params.has('play') || params.has('render');
const finish = () => {
  window.__ERRORS = errors;
  window.__READY = true;
  if (errors.length) document.title = 'ERRORS: ' + errors.join(' | ');
};

if (params.has('render')) {
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
  const from = Number(params.get('from') ?? 0);
  const to = Number(params.get('to') ?? total);
  const quality = Number(params.get('q') ?? 0.95);
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
  for (let f = from; f < to; f++) {
    const state = cameraAt(f / fps);
    applyCamera(state, camera, ceilingObjects, renderer, 1, aerialObjects);
    guide.update(f / fps, camera);
    if (tracer) {
      tracer.prepare(state.ceilings);
      tracer.render(ptSamples);
    } else {
      draw();
    }
    cctx.drawImage(renderer.domElement, 0, 0, width, height);
    if (showCaptions) drawCaptions(cctx, f / fps, width, height);
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
  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    setRenderSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
  };
  addEventListener('resize', resize);
  // 字卡疊在 3D 畫面上
  const overlay = document.createElement('canvas');
  Object.assign(overlay.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  document.body.appendChild(overlay);
  const octx = overlay.getContext('2d');
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const t = player ? player.time() : t0;
    const state = cameraAt(t);
    applyCamera(state, camera, ceilingObjects, renderer, 1, aerialObjects);
    guide.update(t, camera);
    if (params.has('play')) document.title = `${t.toFixed(1)}s · ${state.shot}`;
    draw();
    const r = Math.min(devicePixelRatio, 2);
    if (overlay.width !== innerWidth * r) { overlay.width = innerWidth * r; overlay.height = innerHeight * r; }
    octx.clearRect(0, 0, overlay.width, overlay.height);
    if (showCaptions) drawCaptions(octx, t, overlay.width, overlay.height);
    if (++frames === 3) finish();
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
  controls.update();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    setRenderSize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
  });

  // ?guideAt=秒數：一般預覽時也擺出導覽員在那個時間點的姿勢（近拍角色用）
  const guideAt = params.has('guideAt') ? Number(params.get('guideAt')) : null;
  let frames = 0;
  renderer.setAnimationLoop(() => {
    controls.update();
    if (guideAt !== null) guide.update(guideAt, camera);
    draw();
    if (++frames === 3) finish();
  });
}
