/**
 * camera.js — 依 layout.CAMERA_PATH 算出任意時間點的鏡頭狀態。
 * 純函式、只依賴時間 t，所以每一格畫面都可以重現。
 */
import * as THREE from 'three';
import { CAMERA_PATH, VIDEO } from './layout.js';

const smooth = (u) => u * u * (3 - 2 * u);            // 緩入緩出
const curve = (pts) => (pts.length === 1
  ? { getPoint: () => new THREE.Vector3(...pts[0]) }
  : new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal'));

const SHOTS = CAMERA_PATH.map((s) => ({ ...s, posCurve: curve(s.pos), lookCurve: curve(s.look) }));

/** 回傳 { shot, position, target, fov, ceilings, fade(0~1 亮度) } */
export function cameraAt(t) {
  const tt = Math.min(Math.max(t, 0), VIDEO.duration - 1e-6);
  const shot = SHOTS.find((s) => tt >= s.start && tt < s.end) ?? SHOTS[SHOTS.length - 1];
  const u = smooth((tt - shot.start) / (shot.end - shot.start));
  const first = shot === SHOTS[0];
  const last = shot === SHOTS[SHOTS.length - 1];
  const fadeIn = first ? 1.0 : VIDEO.fade;             // 片頭淡入較長
  const fadeOut = last ? 1.2 : VIDEO.fade;             // 片尾淡出較長
  const fade = Math.min(1, (tt - shot.start) / fadeIn, (shot.end - tt) / fadeOut);
  return {
    shot: shot.name,
    position: shot.posCurve.getPoint(u),
    target: shot.lookCurve.getPoint(u),
    fov: shot.fov ?? 68,
    ceilings: shot.ceilings !== false,
    fade: Math.max(0, fade),
  };
}

/** 套用到 three.js 相機與場景（ceilingObjects：鳥瞰時要隱藏的物件） */
export function applyCamera(state, camera, ceilingObjects, renderer, baseExposure = 1) {
  camera.position.copy(state.position);
  camera.lookAt(state.target);
  if (camera.fov !== state.fov) {
    camera.fov = state.fov;
    camera.updateProjectionMatrix();
  }
  for (const o of ceilingObjects) o.visible = state.ceilings;
  renderer.toneMappingExposure = baseExposure * state.fade;
}
