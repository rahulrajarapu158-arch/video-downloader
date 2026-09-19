import os, json, subprocess, re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class Req(BaseModel):
    url: str
    quality: Optional[str] = "720"

DENO_PATH = "/home/azureuser/.local/deno"
YTDLP_PATH = "/home/azureuser/.local/bin/yt-dlp"

def run_ytdlp(args):
    return subprocess.run([YTDLP_PATH] + args + ["--js-runtimes", f"deno:{DENO_PATH}", "--remote-components", "ejs:github"], capture_output=True, text=True, timeout=120)

def get_info(url):
    try:
        r = run_ytdlp(["--dump-json", "--no-download", url])
        if r.returncode != 0:
            return {"error": (r.stderr or "failed")[:500]}
        for line in r.stdout.strip().split("\n"):
            if line.strip().startswith("{"):
                return json.loads(line)
        return {"error": "no json"}
    except Exception as e:
        return {"error": str(e)}

def get_dl(url, q="720"):
    try:
        # Use format IDs for better compatibility
        # 136=720p, 135=480p, 134=360p, 133=240p, 140=audio
        qm = {
            "1080": "137+140/best",
            "720": "136+140/135+140/best",
            "480": "135+140/134+140/best",
            "360": "134+140/133+140/best",
            "240": "133+140/best",
            "audio": "140/251/250",
        }
        fmt = qm.get(q, qm["720"])
        r = run_ytdlp(["-g", "-f", fmt, url])
        if r.returncode != 0:
            return {"error": (r.stderr or "failed")[:500]}
        for line in r.stdout.strip().split("\n"):
            if line.strip().startswith("http"):
                return {"url": line.strip()}
        return {"error": "no url"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
def h():
    return {"ok": True}

@app.post("/api/extract")
def ex(req: Req):
    if not req.url:
        raise HTTPException(400, "no url")
    if not re.match(r"^https?://", req.url):
        raise HTTPException(400, "bad url")
    info = get_info(req.url)
    if "error" in info:
        raise HTTPException(422, info["error"])
    dl = get_dl(req.url, req.quality)
    if "error" in dl:
        raise HTTPException(422, dl["error"])
    return {"success": True, "downloadUrl": dl["url"], "title": info.get("title","video"), "duration": info.get("duration"), "thumbnail": info.get("thumbnail"), "platform": info.get("extractor","unknown")}
