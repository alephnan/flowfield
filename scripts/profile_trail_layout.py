import argparse, asyncio, json, pathlib, base64
from playwright.async_api import async_playwright
from profile_browser import MEASURE
parser=argparse.ArgumentParser(description="Compare an isolated trail-storage-layout prototype without editing src/. Requires the Vite dev server.")
parser.add_argument("--browser",required=True)
parser.add_argument("--output",default="artifacts/performance")
parser.add_argument("--url",default="http://127.0.0.1:5173/")
parser.add_argument("--reverse",action="store_true")
parser.add_argument("--webgpu-only",action="store_true")
args=parser.parse_args()
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(args.output).resolve()
relative=OUT.relative_to(ROOT)
OUT.mkdir(parents=True,exist_ok=True)
source=(ROOT/"src/app/RenderController.ts").read_text(encoding="utf8")
replacements=[
    ("from '../tsl/", "from '/src/tsl/", 1),
    ("from './framing'", "from '/src/app/framing'", 1),
    ("from './capture'", "from '/src/app/capture'", 1),
    ("const base = instanceIndex.mul(uint(T));", "const base = instanceIndex;", 1),
    ("this.trailBuf.element(base.add(i)).assign(pos);", "this.trailBuf.element(i.mul(uint(this.trailCount)).add(base)).assign(pos);", 1),
    ("this.trailBuf.element(base.add(uint(this.trailHeadU))).assign(pos);", "this.trailBuf.element(uint(this.trailHeadU).mul(uint(this.trailCount)).add(base)).assign(pos);", 1),
    ("const trail = instanceIndex.div(uint(T));", "const trail = instanceIndex.mod(uint(this.trailCount));", 2),
    ("const slot = instanceIndex.mod(uint(T));", "const slot = instanceIndex.div(uint(this.trailCount));", 1),
    ("const base = trail.mul(uint(T));", "const base = trail;", 1),
    ("this.trailBuf.element(base.add(slot))", "this.trailBuf.element(slot.mul(uint(this.trailCount)).add(base))", 1),
    ("this.trailBuf.element(base.add(slotOther))", "this.trailBuf.element(slotOther.mul(uint(this.trailCount)).add(base))", 1),
]
for before,after,count in replacements:
    if source.count(before)!=count:
        raise RuntimeError("Source changed; review prototype replacement: "+before)
    source=source.replace(before,after)
(OUT/"RenderController.slot-major.ts").write_text(source,encoding="utf8")
variant_url=args.url.rstrip("/")+"/"+relative.as_posix()+"/RenderController.slot-major.ts"
result_name="layout-experiment-reverse.json" if args.reverse else "layout-experiment.json"
async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(executable_path=args.browser,
      headless=True,ignore_default_args=["--headless=old"],args=["--headless=new","--enable-gpu"])
    results=[]
    # Alternating independent pages retain the same full resolution and quality.
    for case,query in [("trails19","&mode=trails"),("trails64","&mode=trails&tl=64"),("webgl-trails","&mode=trails&forceWebGL")]:
      if args.webgpu_only and case=="webgl-trails": continue
      for variant in (["slot-major","baseline"] if args.reverse else ["baseline","slot-major"]):
        page=await browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=2,reduced_motion="reduce")
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("console",lambda m:errors.append(m.text) if m.type=="error" else None)
        if variant=="slot-major":
          await page.route("**/src/app/RenderController.ts",lambda route:route.continue_(url=variant_url))
        await page.goto(args.url+"?aq=0&rs=1"+query,wait_until="networkidle")
        await page.wait_for_function("!!window.__app",timeout=60000)
        measurement=await page.evaluate(MEASURE,{"warmup":120,"samples":240,"paused":False})
        png=await page.evaluate("""async () => {
          const a=window.__app;
          a.renderer.setAnimationLoop(null);
          a.reset();
          await new Promise(resolve => {
            let frame=0;
            a.renderer.setAnimationLoop(()=>{
              a.frame(1/60);
              if(++frame===180){a.renderer.setAnimationLoop(null);resolve();}
            });
          });
          a.render.renderFrame();
          return a.renderer.domElement.toDataURL('image/png').split(',')[1];
        }""")
        (OUT/(case+"-"+variant+".png")).write_bytes(base64.b64decode(png))
        results.append({"case":case,"variant":variant,**measurement,"errors":errors})
        (OUT/result_name).write_text(json.dumps(results,indent=2))
        print(json.dumps({"case":case,"variant":variant,"frame":measurement["frameMs"],"draw":measurement["gpuRenderMs"],"errors":errors}),flush=True)
        await page.close()
    await browser.close()
asyncio.run(main())
