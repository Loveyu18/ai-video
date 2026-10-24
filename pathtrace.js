/**
 * pathtrace.js — 路徑追蹤輸出（three-gpu-pathtracer，是渲染器，不是模型或貼圖）
 *
 * 光線會在房間裡真的反彈：窗光漫射、牆面互相映色、玻璃與金屬真實反射。
 * 每一格從頭累積 N 次取樣，結果只由場景與時間決定，可重現。
 *
 * 和即時渲染的差異（都在這裡處理，不動場景本身）：
 *   - InstancedMesh（百葉簾）展開成一般 mesh，路徑追蹤才看得到每一片
 *   - 天空球改成程式生成的漸層環境光（GradientEquirectTexture），也會從窗戶照進室內
 *   - 鳥瞰鏡頭（不顯示天花）用另一份場景資料
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PathTracingSceneGenerator, PathTracingRenderer, PhysicalPathTracingMaterial, GradientEquirectTexture,
} from 'three-gpu-pathtracer';

/** 把 InstancedMesh 展開成一個合併的 Mesh（只在路徑追蹤用的副本上做） */
function expandInstances(root) {
  const swaps = [];
  root.traverse((o) => { if (o.isInstancedMesh) swaps.push(o); });
  for (const inst of swaps) {
    const m = new THREE.Matrix4();
    const parts = [];
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m);
      parts.push(inst.geometry.clone().applyMatrix4(m));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), inst.material);
    mesh.name = inst.name;
    mesh.position.copy(inst.position);
    mesh.quaternion.copy(inst.quaternion);
    mesh.scale.copy(inst.scale);
    inst.parent.add(mesh);
    inst.parent.remove(inst);
  }
}

/** 只收集「看得見」的物件，路徑追蹤產生器本身不管 visible */
function visibleClone(scene) {
  const copy = scene.clone(true);
  const hidden = [];
  copy.traverse((o) => { if (!o.visible || o.name === 'sky') hidden.push(o); });
  for (const o of hidden) o.parent?.remove(o);
  expandInstances(copy);
  // 產生器要求所有幾何格式一致：都要有 index，只保留 position / normal / uv
  copy.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
    g.morphAttributes = {};
    o.geometry = g;
  });
  copy.updateMatrixWorld(true);
  return copy;
}

export function createPathTracer(renderer, scene, camera, { bounces = 5, filterGlossy = 0.5 } = {}) {
  const material = new PhysicalPathTracingMaterial();
  material.bounces = bounces;
  material.filterGlossyFactor = filterGlossy;

  // 傍晚天空漸層（程式生成），兼當環境光
  const sky = new GradientEquirectTexture();
  sky.topColor.set(0x3b3a5a);
  sky.bottomColor.set(0xffc489);
  sky.exponent = 2;
  sky.update();
  material.envMapInfo.updateFrom(sky);
  material.environmentIntensity = 0.6;

  const pt = new PathTracingRenderer(renderer);
  pt.camera = camera;
  pt.material = material;
  // 分塊算：每次繪製只算一小塊，避免單次 GPU 工作超過 Windows 的 2 秒逾時（TDR）而當掉
  pt.tiles.set(6, 6);
  pt.stableNoise = true;
  const quad = new FullScreenQuad(new THREE.MeshBasicMaterial({ map: pt.target.texture }));

  const cache = new Map();
  let current = null;

  /** 依「天花是否顯示」準備場景資料（兩種狀態各算一次 BVH） */
  function prepare(ceilingsVisible) {
    const key = ceilingsVisible ? 'interior' : 'aerial';
    if (current === key) return;
    if (!cache.has(key)) {
      const gen = new PathTracingSceneGenerator();
      const { bvh, textures, materials, lights } = gen.generate(visibleClone(scene));
      cache.set(key, { bvh, textures, materials, lights, geometry: bvh.geometry });
    }
    const d = cache.get(key);
    material.bvh.updateFrom(d.bvh);
    material.attributesArray.updateFrom(d.geometry.attributes.normal, d.geometry.attributes.tangent, d.geometry.attributes.uv, d.geometry.attributes.color);
    material.materialIndexAttribute.updateFrom(d.geometry.attributes.materialIndex);
    material.textures.setTextures(renderer, 1024, 1024, d.textures);
    material.materials.updateFrom(d.materials, d.textures);
    material.lights.updateFrom(d.lights);
    current = key;
  }

  return {
    prepare,
    setSize(w, h) { pt.setSize(w, h); },
    /** 從頭累積 samples 次後畫到畫布 */
    render(samples) {
      camera.updateMatrixWorld();
      pt.reset();
      const gl = renderer.getContext();
      while (pt.samples < samples) {
        pt.update();
        gl.finish();
      }
      quad.material.map = pt.target.texture;
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
  };
}
