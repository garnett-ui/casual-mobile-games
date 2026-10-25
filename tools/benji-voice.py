#!/usr/bin/env python3
"""Record Benji's Town's spoken lines in a child's voice.

A BUILD-TIME tool, after the one in mckoss/letter-tracer: it calls Microsoft
Edge's online read-aloud service (through the community ``edge-tts`` wrapper)
for each line in games/benji/voice.js that hasn't been recorded yet, writes
games/benji/voice/<line>.mp3 -- committed, and precached by the service worker
with everything else, so the game never calls anything and plays them offline
-- and rewrites the RECORDED list in voice.js. Lines not recorded are spoken by
the phone's own voice.

    python3 -m venv .venv && .venv/bin/pip install edge-tts
    .venv/bin/python tools/benji-voice.py            # the missing lines
    .venv/bin/python tools/benji-voice.py --force    # all of them again
    .venv/bin/python tools/benji-voice.py --dry-run  # what it would record

With ffmpeg, each clip is trimmed of silence at either end, mono and
loudness-normalised. Then run npm run build, so the service worker knows
about the new files. (Microsoft publishes no grant to redistribute this
output: see the note in README.md's credits.)
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE_JS = ROOT / "games" / "benji" / "voice.js"
OUT = ROOT / "games" / "benji" / "voice"

# The child voice in the Edge catalogue (about three years old), a little
# slower than it reads by itself.
VOICE = "en-US-AnaNeural"
RATE = "-10%"
LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
TRIM = "silenceremove=start_periods=1:start_silence=0.06:start_threshold=-45dB"


def slug(text: str) -> str:
    """As voice.js names them: 'Red light. Stop!' -> 'red-light-stop'."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower().replace("’", "")).strip("-")


def lines() -> list[str]:
    src = VOICE_JS.read_text()
    block = re.search(r"export const LINES = \[(.*?)\];", src, re.S)
    if not block:
        sys.exit(f"could not find LINES in {VOICE_JS}")
    return re.findall(r"'([^']+)'", block.group(1))


def write_recorded(done: list[str]) -> None:
    src = VOICE_JS.read_text()
    listed = ", ".join("'" + t + "'" for t in done)
    new = re.sub(r"export const RECORDED = \[.*?\];", lambda _: f"export const RECORDED = [{listed}];", src, flags=re.S)
    VOICE_JS.write_text(new)


async def speak(text: str, dest: Path) -> None:
    import edge_tts

    # (Through the proxy, where there is one.)
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    await edge_tts.Communicate(text, VOICE, rate=RATE, proxy=proxy).save(str(dest))


def polish(raw: Path, dest: Path) -> None:
    if not shutil.which("ffmpeg"):
        print("  (no ffmpeg: kept as it came)")
        shutil.move(str(raw), str(dest))
        return
    trim_both = f"{TRIM},areverse,{TRIM},areverse"
    try:
        subprocess.run(
            ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(raw), "-af", f"{trim_both},{LOUDNORM}",
             "-ac", "1", "-ar", "24000", "-b:a", "48k", str(dest)],
            check=True,
            stdin=subprocess.DEVNULL,
            # (The silence trimming has been known to hang on a clip: then
            # it's kept as it came.)
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        print("  (ffmpeg hung: kept as it came)")
        shutil.copy(str(raw), str(dest))
    raw.unlink(missing_ok=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--force", action="store_true", help="record every line again")
    ap.add_argument("--dry-run", action="store_true", help="just list what it would record")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [t for t in lines() if args.force or not (OUT / f"{slug(t)}.mp3").exists()]
    for text in todo:
        print(f"{slug(text)}.mp3  <-  {text}")
    if args.dry_run:
        return
    with tempfile.TemporaryDirectory() as tmp:
        for text in todo:
            raw = Path(tmp) / "raw.mp3"
            asyncio.run(speak(text, raw))
            polish(raw, OUT / f"{slug(text)}.mp3")
    write_recorded([t for t in lines() if (OUT / f"{slug(t)}.mp3").exists()])
    print(f"{len(todo)} recorded; voice.js updated. Now: npm run build")


if __name__ == "__main__":
    main()
