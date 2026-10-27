"""Profile the dev build without changing application source or visual settings.

Requires Python 3.10+ and Playwright (pip install playwright). Start Vite first.
Use --browser to point to a Chromium-family test browser. Results include the
actual backend/adapter; software-renderer timings are not hardware benchmarks.
"""
import argparse
import asyncio
import json
import pathlib
from playwright.async_api import async_playwright

MEASURE = """async ({warmup, samples, paused}) => {
  const a = window.__app;
  a.renderer.setAnimationLoop(null);
  a.simSettings.paused = paused;
  a.renderSettings.autoQuality = false;
  a.reset();
  a.ui.refresh();
  const intervals = [], cpu = [], gpu = [];
  const originalTiming = a.hud.setGpuTimings.bind(a.hud);
  let frame = 0, last = performance.now();
  a.hud.setGpuTimings = (compute, render) => {
    originalTiming(compute, render);
    if (frame > warmup) gpu.push({compute, render});
  };
  const stats = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((a,b) => a-b);
    return {mean: values.reduce((s,x)=>s+x,0)/values.length,
      p50: sorted[Math.floor(sorted.length*.5)],
      p95: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],
      max: sorted.at(-1), count: values.length};
  };
  await new Promise(resolve => {
    a.renderer.setAnimationLoop(() => {
      const now = performance.now(), interval = now-last;
      last = now;
      a.frame(Math.min(interval/1000,0.1));
      if (frame >= warmup) {
        intervals.push(interval);
        cpu.push(performance.now()-now);
      }
      if (++frame >= warmup+samples) {
        a.renderer.setAnimationLoop(null);
        resolve();
      }
    });
  });
  if (a.renderer.backend.device) await a.renderer.backend.device.queue.onSubmittedWorkDone();
  a.hud.setGpuTimings = originalTiming;
  const b=a.renderer.backend, i=b.device?.adapterInfo;
  const gl=b.gl, debug=gl?.getExtension('WEBGL_debug_renderer_info');
  return {frameMs:stats(intervals), cpuSubmitMs:stats(cpu),
    gpuComputeMs:stats(gpu.map(x=>x.compute)),gpuRenderMs:stats(gpu.map(x=>x.render)),
    gpuSamples:gpu, memory:{...a.renderer.info.memory},
    draw:{...a.renderer.info.render},sim:{...a.simSettings},render:{...a.renderSettings},
    backend:b.constructor.name,tier:a.tier,canvas:[a.renderer.domElement.width,a.renderer.domElement.height],
    adapter:i ? {vendor:i.vendor,architecture:i.architecture,device:i.device,description:i.description} : null,
    glRenderer:debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    particleStride:a.sim.positions.value.itemSize,
    trailStride:a.render.trailBuf?.value.itemSize,
    trailInstances:a.render.trailGeometry?.instanceCount };
}"""

async def main(args):
    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=args.browser, headless=True,
            ignore_default_args=["--headless=old"],
            args=["--headless=new","--enable-gpu"])
        result={"browser":browser.version, "viewport":[1440,900], "dpr":2,
                "warmupFrames":args.warmup,"sampleFrames":args.samples,"cases":[]}
        cases = [
            ("diagnostic-points-half-resolution", "aq=0&rs=0.5",False),
            ("diagnostic-long-trails-half-resolution", "aq=0&rs=0.5&mode=trails&tl=64",False),
            ("default-points", "aq=0&rs=1",False),
            ("default-trails", "aq=0&rs=1&mode=trails",False),
            ("default-both", "aq=0&rs=1&mode=both",False),
            ("thomas-points", "aq=0&rs=1&sys=thomas",False),
            ("million-points", "aq=0&rs=1&n=1048576",False),
            ("long-trails", "aq=0&rs=1&mode=trails&tl=64",False),
            ("paused-points", "aq=0&rs=1",True),
            ("webgl-points", "aq=0&rs=1&forceWebGL",False),
            ("webgl-trails", "aq=0&rs=1&forceWebGL&mode=trails",False),
        ]
        if args.case:
            unknown=set(args.case)-{case[0] for case in cases}
            if unknown:
                await browser.close()
                raise ValueError("Unknown profiling cases: "+", ".join(sorted(unknown)))
            cases=[case for case in cases if case[0] in args.case]
        runs = [(label, query, paused, False) for label, query, paused in cases]
        if args.compare_main:
            runs = [(label, query, paused, baseline) for label, query, paused in cases
                for baseline in ([False, True] if args.reverse else [True, False])]
        for label,query,paused,baseline in runs:
            suffix = "-baseline" if baseline else "-current"
            page=await browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=2,reduced_motion="reduce")
            if baseline:
                baseline_src=args.compare_main.rsplit("/",1)[0]
                await page.route("**/src/**",lambda route:route.continue_(
                    url=args.url.rstrip("/")+"/"+baseline_src+"/"+route.request.url.split("/src/",1)[1]))
            errors=[]
            page.on("pageerror",lambda e: errors.append(str(e)))
            page.on("console",lambda m: errors.append(m.type+": "+m.text) if m.type in ["error","warning"] else None)
            try:
                await page.goto(args.url+"?"+query,wait_until="networkidle")
                await page.wait_for_function("!!window.__app",timeout=60000)
                if args.compare_main:
                    source_is_current=await page.evaluate("typeof window.__app.sim.dispose==='function'")
                    assert source_is_current != baseline, "Baseline/current source isolation failed"
                measured=await page.evaluate(MEASURE,{"warmup":args.warmup,"samples":args.samples,"paused":paused})
                measured["source"]="baseline" if baseline else "current"
                measured["slotMajorTrails"]=await page.evaluate("window.__app.render.slotMajorTrails===true")
                if label in ["default-points","default-trails"]:
                    await page.screenshot(path=str(out/(label+suffix+".png")))
                result["cases"].append({"name":label,"url":args.url+"?"+query,**measured,"messages":errors})
                print(json.dumps({"name":label,"source":measured["source"],"backend":measured["backend"],"frame":measured["frameMs"],
                    "cpu":measured["cpuSubmitMs"],"gpuCompute":measured["gpuComputeMs"],
                    "gpuRender":measured["gpuRenderMs"],"memoryBytes":measured["memory"]["total"],
                    "adapter":measured["adapter"],"messages":errors[:4]}),flush=True)
            except Exception as e:
                result["cases"].append({"name":label,"source":"baseline" if baseline else "current","error":str(e),"messages":errors})
                print(json.dumps(result["cases"][-1]),flush=True)
            finally:
                (out/"baseline.json").write_text(json.dumps(result,indent=2),encoding="utf8")
                await page.close()
        await browser.close()
        if any("error" in case for case in result["cases"]):
            raise RuntimeError("Profiling failed; see the recorded cases in "+str(out/"baseline.json"))

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser",required=True)
    parser.add_argument("--url",default="http://127.0.0.1:5173/")
    parser.add_argument("--output",default="artifacts/performance")
    parser.add_argument("--warmup",type=int,default=120)
    parser.add_argument("--samples",type=int,default=240)
    parser.add_argument("--case",action="append")
    parser.add_argument("--compare-main",help="Preserved original main.ts served by Vite; compare against current source")
    parser.add_argument("--reverse",action="store_true",help="Run current source first when comparing")
    args = parser.parse_args()
    if args.warmup < 0 or args.samples < 1:
        parser.error("warmup must be nonnegative and samples must be positive")
    asyncio.run(main(args))
