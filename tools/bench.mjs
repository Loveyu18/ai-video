// 瀏覽效能測試：node tools/bench.mjs [網址參數]
//   無頭 Chrome（GPU）開 ?bench=1，在幾個代表鏡頭各畫 40 格，回報每格毫秒數、繪製次數、三角形數、燈數。
//   例：node tools/bench.mjs "quality=high"   比較不同畫質設定
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const extraQuery = process.argv[2] ?? '';
const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const browserPath = BROWSERS.find((p) => fs.existsSync(p));
if (!browserPath) { console.error('找不到 Edge/Chrome'); process.exit(1); }

let resolveDone;
const done = new Promise((r) => { resolveDone = r; });
const server = await startServer(0, (req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/bench')) return false;
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => { res.writeHead(200).end('ok'); resolveDone(JSON.parse(Buffer.concat(chunks).toString())); });
  return true;
});
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'render-bench-'));
const url = `http://127.0.0.1:${server.address().port}/index.html?bench=1${extraQuery ? `&${extraQuery}` : ''}`;
const browser = execFile(browserPath, [
  '--headless=new', '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--user-data-dir=${profile}`, '--window-size=1600,900', url,
]);
const timer = setTimeout(() => resolveDone({ errors: ['逾時（3 分鐘）'] }), 180000);
const result = await done;
clearTimeout(timer);
browser.kill();
server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}

if (result.errors?.length) console.error('錯誤：', result.errors);
console.log(`畫面 ${result.size ?? '?'}  ${extraQuery || '(預設)'}`);
console.log('鏡頭'.padEnd(6, '　'), '完整(毫秒)', ' fps', ' 快速(毫秒)', ' fps', ' 繪製次數', ' 三角形(萬)', ' 點光源');
for (const r of result.rows ?? []) {
  const fps = (ms) => (ms ? (1000 / ms).toFixed(0) : '-').padStart(4);
  console.log(r.name.padEnd(6, '　'), r.ms.toFixed(1).padStart(10), fps(r.ms), (r.msFast?.toFixed(1) ?? '-').padStart(11), fps(r.msFast),
    String(r.calls).padStart(8), (r.tris / 1e4).toFixed(0).padStart(10), String(r.lights).padStart(7));
}
if (result.startup) console.log(`載入到可以畫：${(result.startup / 1000).toFixed(1)} 秒`);
