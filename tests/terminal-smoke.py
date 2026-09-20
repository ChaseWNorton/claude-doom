"""Exercise the installed Claude UI through a real PTY; requires local login.

Test-only dependencies: pyte and Pillow. Never submits a model prompt.
"""
import codecs
import copy
import fcntl
import glob
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import sys
import tempfile
import termios
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ROOT = Path(os.environ.get("DOOM_PLUGIN_ROOT", ROOT)).resolve()
CLAUDE_BIN = Path(os.environ.get("DOOM_CLAUDE_BIN", ROOT / ".runtime/node_modules/.bin/claude"))
ARTIFACTS = Path(os.environ.get("DOOM_ARTIFACTS", ROOT / "artifacts"))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / ".runtime/python"))
import pyte
from PIL import Image, ImageDraw, ImageFont

class TerminalScreen(pyte.Screen):
    def write_process_input(self, data):
        os.write(fd, data.encode())

screen = TerminalScreen(180, 55)
stream = pyte.Stream(screen)
decoder = codecs.getincrementaldecoder("utf-8")("replace")
raw = bytearray()
frames = []
recording = False
last_frame = 0
demo_rect = None
old_ready = set(glob.glob(str(Path(tempfile.gettempdir()) / "claude-doom-*/ready.json")))
pid, fd = pty.fork()
if pid == 0:
    # Exercise the cached plugin from a project, rather than opening its cache as a workspace.
    os.chdir(ROOT)
    os.environ.update(TERM="xterm-256color", COLORTERM="truecolor", CLAUDE_CODE_ENABLE_FUNCTION_HOOKS="1", CLAUDE_CODE_NO_FLICKER="1")
    os.execv(str(CLAUDE_BIN), ["claude", "--plugin-dir", str(PLUGIN_ROOT), "--setting-sources", "project,local"])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 55, 180, 1620, 990))

def pump(seconds):
    global last_frame
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if select.select([fd], [], [], min(0.1, max(0, end-time.monotonic())))[0]:
            try:
                data = os.read(fd, 262144)
            except OSError:
                return
            if not data:
                return
            raw.extend(data)
            if b"\x1b[14t" in data:
                os.write(fd,b"\x1b[4;990;1620t")
            if b"\x1b[16t" in data:
                os.write(fd,b"\x1b[6;18;9t")
            stream.feed(decoder.decode(data))
            if recording and time.monotonic()-last_frame >= 0.16 and len(frames) < 60:
                last_frame = time.monotonic()
                frames.append((last_frame, copy.deepcopy(screen.buffer)))

def send(text):
    os.write(fd, text.encode())

def render(buffer, rect=(0,0,180,55)):
    cw, ch = 9, 18
    x0, y0, width, height = rect
    image = Image.new("RGB", (width*cw, height*ch), "#101010")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 14)
    palette = {"default":"#dedede", "black":"#000000", "red":"#cd3131", "green":"#0dbc79", "brown":"#e5b567", "blue":"#2472c8", "magenta":"#bc3fbc", "cyan":"#11a8cd", "white":"#e5e5e5", "brightblack":"#777777"}
    def color(value, default):
        if value == "default":
            return default
        return palette.get(value, "#"+value if len(value)==6 else default)
    for sy, row in buffer.items():
        for sx, cell in row.items():
            if not (x0 <= sx < x0+width and y0 <= sy < y0+height):
                continue
            x, y = sx-x0, sy-y0
            fg, bg = color(cell.fg, "#dedede"), color(cell.bg, "#101010")
            if cell.reverse:
                fg, bg = bg, fg
            box=(x*cw,y*ch,(x+1)*cw-1,(y+1)*ch-1)
            draw.rectangle(box,fill=bg)
            if cell.data == "▀":
                draw.rectangle((x*cw,y*ch,(x+1)*cw-1,y*ch+ch//2-1),fill=fg)
            elif cell.data.strip():
                draw.text((x*cw,y*ch),cell.data,font=font,fill=fg)
    return image

def snapshot(name):
    (ARTIFACTS / f"{name}.txt").write_text("\n".join(screen.display))
    render(screen.buffer).save(ARTIFACTS / f"{name}.png")

def save_demo():
    if not frames or not demo_rect:
        return
    images = [render(buffer,demo_rect).quantize(colors=128) for _,buffer in frames]
    durations = [max(40,min(1000,round((b[0]-a[0])*1000))) for a,b in zip(frames,frames[1:])]+[1200]
    images[0].save(ARTIFACTS / "gameplay.gif",save_all=True,append_images=images[1:],duration=durations,loop=0,optimize=True)
    render(frames[-1][1],demo_rect).save(ARTIFACTS / "gameplay.png")

bridge = None
def health():
    request = urllib.request.Request(bridge["url"]+"/health", headers={"Authorization":"Bearer "+bridge["token"]})
    with urllib.request.urlopen(request, timeout=3) as response:
        return json.load(response)

try:
    pump(6)
    startup = "\n".join(screen.display)
    if "Yes, I trust this folder" in startup and str(ROOT) in startup:
        # This test operates on its own reviewed source tree, never an arbitrary workspace.
        send("\x1b[B\r")
        pump(6)
    send("/doom")
    pump(0.4)
    send("\r")
    pump(6)
    snapshot("claude-doom")
    created = set(glob.glob(str(Path(tempfile.gettempdir()) / "claude-doom-*/ready.json"))) - old_ready
    assert len(created) == 1, f"Expected one game bridge; found {len(created)}"
    bridge = json.loads(Path(created.pop()).read_text())
    before = health()
    assert before["alive"] and before["state"]["tick"] > 25
    lines = screen.display
    row = next(y for y,line in enumerate(lines) if "CLICK HERE TO PLAY" in line)
    col = lines[row].index("CLICK HERE TO PLAY")+5
    title_row = next(y for y,line in enumerate(lines) if "DOOM / FREEDOOM" in line)
    title_col = lines[title_row].index("DOOM / FREEDOOM")
    controls_row = next(y for y,line in enumerate(lines) if "Close game" in line)
    demo_rect = (title_col,title_row,180-title_col,controls_row-title_row+2)
    recording = os.environ.get("DOOM_RECORD_DEMO") == "1"
    print(f"Game mounted; keyboard strip at column {col+1}, row {row+1}", flush=True)
    pixel_mouse = b"\x1b[?1016h" in raw
    mx, my = (col*9+5,row*18+9) if pixel_mouse else (col+1,row+1)
    print(f"Mouse coordinates: {mx},{my}; pixel mode {pixel_mouse}", flush=True)
    send(f"\x1b[<0;{mx};{my}M")
    pump(0.1)
    send(f"\x1b[<0;{mx};{my}m")
    pump(0.2)
    send("w")
    pump(0.7)
    moved = health()
    assert (before["state"]["x"],before["state"]["y"]) != (moved["state"]["x"],moved["state"]["y"]), "Terminal W input did not move player"
    send(" ")
    pump(0.7)
    fired = health()
    assert fired["state"]["ammo"] < before["state"]["ammo"], "Terminal Space input did not fire"
    if recording:
        for command in ["d", "d", "w", " ", "a", "q", "w", " "]:
            send(command)
            pump(0.45)
    send("p")
    pump(0.5)
    assert health()["paused"], "Terminal P input did not pause"
    snapshot("claude-doom")
    evidence = {"runtime":"Claude Code 2.1.278", "render":"Real terminal PTY output rendered with pyte/Pillow", "before":before["state"], "after":fired["state"], "paused":True, "keyboardRow":row+1}
    print(json.dumps(evidence,indent=2),flush=True)
    (ARTIFACTS/"terminal-proof.json").write_text(json.dumps(evidence,indent=2)+"\n")
    recording = False
    save_demo()
    send("\x1b")
    pump(0.2)
    send("/doom close")
    pump(0.3)
    send("\r")
    pump(1)
    try:
        health()
        raise AssertionError("Close did not stop the bridge")
    except (OSError, urllib.error.URLError):
        pass
    print("PASS: live Claude pane, keyboard movement, firing, pause, close",flush=True)
finally:
    (ARTIFACTS/"terminal-smoke.ansi").write_bytes(raw)
    snapshot("terminal-final")
    if bridge:
        try:
            request=urllib.request.Request(bridge["url"]+"/stop",data=b"{}",headers={"Authorization":"Bearer "+bridge["token"],"Content-Type":"application/json"})
            urllib.request.urlopen(request,timeout=1).close()
        except OSError:
            pass
    try:
        send("\x03")
        pump(0.2)
        send("\x03")
        pump(0.5)
    except OSError:
        pass
    try:
        os.kill(pid,signal.SIGTERM)
    except ProcessLookupError:
        pass
    os.close(fd)
    os.waitpid(pid,0)
