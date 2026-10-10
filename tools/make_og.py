#!/usr/bin/env python3
"""Render public/og.png (1200x630) from the brand SVGs. Needs playwright + chromium."""
import os, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
brand = lambda n: open(os.path.join(ROOT, "public/assets/brand", n), encoding="utf-8").read()
word_inner = re.search(r'<g fill="none".*</g>', brand("tessera-word.svg"), re.S).group(0)
gl_paths = "".join(re.findall(r'<path d="[^"]+"/>', brand("genlayer-logo-black.svg")))
L = 'M14 12H33L29 21L36 29L28 38L34 46L30 52H14a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8Z'
R = 'M36 12H50a8 8 0 0 1 8 8V44a8 8 0 0 1-8 8H33L37 46L31 38L39 29L32 21Z'

html = f'''<body style="margin:0;width:1200px;height:630px;overflow:hidden;background:
 radial-gradient(700px 520px at 82% 40%, rgba(79,99,255,.55), transparent 62%),
 radial-gradient(600px 400px at 0% 100%, rgba(233,185,73,.14), transparent 60%), #0A1042;
 font-family:'Bitstream Charter','Charter',Georgia,serif;color:#F1EFE6;position:relative">
<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(170,185,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(170,185,255,.07) 1px,transparent 1px);background-size:60px 60px;
 -webkit-mask-image:radial-gradient(ellipse 80% 80% at 70% 40%,#000,transparent 80%)"></div>
<svg viewBox="0 0 272 72" style="position:absolute;left:84px;top:80px;width:300px;color:#F1EFE6">{word_inner}</svg>
<div style="position:absolute;left:84px;top:226px;width:600px;font-size:68px;line-height:1.06;font-weight:700;letter-spacing:-1.5px">Agreements that rule themselves.</div>
<div style="position:absolute;left:84px;top:450px;width:560px;font-family:Carlito,Calibri,sans-serif;font-size:27px;line-height:1.35;color:#C7CDF0">Write the deal in plain words. Five validators decide if it was kept.</div>
<div style="position:absolute;left:84px;top:552px;display:flex;align-items:center;gap:16px;font-family:Carlito,Calibri,sans-serif;font-size:22px;color:#8E98D0;letter-spacing:.04em">Built on
  <svg viewBox="0 0 385.32 91.93" style="height:27px;color:#C7CDF0"><g fill="currentColor">{gl_paths}</g></svg></div>
<svg viewBox="0 0 64 64" style="position:absolute;left:700px;top:96px;width:420px;overflow:visible">
 <g transform="translate(-1.2 .2) rotate(-2.5 20 32)"><path fill="#F1EFE6" d="{L}"/></g>
 <g transform="translate(1.2 -.2) rotate(2.5 44 32)"><path fill="#E9B949" d="{R}"/></g></svg>
<div style="position:absolute;left:1000px;top:392px;width:150px;height:150px;border-radius:50%;background:#E9B949;color:#2A1F00;display:grid;place-items:center;
 font:800 44px Carlito,sans-serif;transform:rotate(-9deg);box-shadow:inset 0 0 0 9px #E9B949, inset 0 0 0 11px rgba(42,31,0,.5), 0 20px 50px -14px rgba(233,185,73,.6)">100%</div>
</body>'''

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.set_content(html); pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(ROOT, "public/og.png"))
    b.close()
print("wrote public/og.png")
