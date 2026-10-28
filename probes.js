/**
 * probes.js — 每個房間一張「環境探針」（360° 環景，PMREM 預先模糊）
 *   在房間中央、約眼睛高度，把場景拍成立方體貼圖，當成這個房間的間接光與反射來源：
 *   白牆房間的間接光是暖白、木作多的房間帶木色，鏡子和金屬反射的是自己房間，而不是一個假的暖色盒子。
 *   拍攝在第一次進入房間時才做（約幾十毫秒），之後重複使用；不增加每格的負擔。
 *   一律從同樣的位置、同樣的燈光拍，所以每次輸出結果相同。
 */
import * as THREE from 'three';
import * as L from './layout.js';

const SIZE = 128;           // 立方體每面解析度：間接光很模糊，128 就夠
const EYE = 1.35;

/**
 * prepare(roomId, pos)：拍攝前讓呼叫端設定燈光、隱藏不該入鏡的東西；回傳一個還原函式
 */
export function createRoomProbes(renderer, scene, { prepare, fallback, intensity = 1 }) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = new THREE.WebGLCubeRenderTarget(SIZE, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.05, 40, rt);
  const cache = new Map();

  function capture(id) {
    const r = L.roomInterior(id);
    const [cx, cz] = L.rectCenter(r);
    const pos = new THREE.Vector3(cx, EYE, cz);
    const restore = prepare(id, pos);
    const env = scene.environment;
    scene.environment = fallback;          // 第一次反彈用原本的環境，避免黑色區域
    // 間接光強度：拍攝時所有燈乘上 intensity（光照是線性的，等於把探針整體調亮或調暗）
    const lights = [];
    scene.traverse((o) => { if (o.isLight) { lights.push([o, o.intensity]); o.intensity *= intensity; } });
    cam.position.copy(pos);
    const tm = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;   // 存線性亮度，給物理光照用
    cam.update(renderer, scene);
    renderer.toneMapping = tm;
    for (const [o, k] of lights) o.intensity = k;
    scene.environment = env;
    restore?.();
    const tex = pmrem.fromCubemap(rt.texture).texture;
    cache.set(id, tex);
    return tex;
  }

  return {
    /** pos 所在房間的環境貼圖；不在任何房間（鳥瞰、屋外）時回傳 fallback */
    envAt(pos) {
      const id = L.roomAt(pos.x, pos.z);
      if (!id || !L.ROOMS[id]) return fallback;
      return cache.get(id) ?? capture(id);
    },
    /** 預先拍好全部房間（輸出影片前用，避免中途停頓） */
    captureAll() {
      for (const id of Object.keys(L.ROOMS)) if (!cache.has(id)) capture(id);
    },
  };
}
