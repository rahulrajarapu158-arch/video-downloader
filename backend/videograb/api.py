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
    return subprocess.run([YTDLP_PATH] + args + ["--js-runtimes", "deno:" + DENO_PATH], capture_output=True, text=True, timeout=120)

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
        # Use -g without -f to get URL of best available format
        r = run_ytdlp(["-g", url])
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
