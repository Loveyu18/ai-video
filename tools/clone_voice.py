"""本人聲音複製（F5-TTS，全部在本機跑，錄音不上傳）。由 tools/voice.mjs 呼叫：

    python tools/clone_voice.py jobs.json

jobs.json：{"ref": "voice-ref/ref.wav", "ref_text": "...", "jobs": [{"text": "...", "speed": 1.0, "out": "x.wav"}, ...]}
ref_text 空白時先用語音辨識轉出參考錄音的逐字稿，存到 voice-ref/ref.txt（可以手動改正，下次直接用）。
固定隨機種子，同樣的稿子每次合成都一樣。
"""
import json
import sys
from pathlib import Path

from f5_tts.api import F5TTS

SEED = 20251028


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    ref = cfg["ref"]
    tts = F5TTS(device="cpu")
    ref_text = cfg.get("ref_text", "").strip()
    if not ref_text:
        ref_text = tts.transcribe(ref).strip()
        Path(ref).with_name("ref.txt").write_text(ref_text, encoding="utf-8")
        print(f"參考錄音逐字稿：{ref_text}", flush=True)
    for i, job in enumerate(cfg["jobs"], 1):
        tts.infer(ref_file=ref, ref_text=ref_text, gen_text=job["text"], file_wave=job["out"],
                  speed=job.get("speed", 1.0), seed=SEED, remove_silence=False)
        print(f"[{i}/{len(cfg['jobs'])}] {job['text']}", flush=True)


if __name__ == "__main__":
    main()
