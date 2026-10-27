import argparse, asyncio, json, pathlib, base64
from playwright.async_api import async_playwright
parser=argparse.ArgumentParser(description="Measure GPU allocations across repeated settings changes. Cleanup is an experimental WebGPU-only runtime patch, not a production fix.")
parser.add_argument("--browser",required=True)
parser.add_argument("--output",default="artifacts/performance")
parser.add_argument("--url",default="http://127.0.0.1:5173/")
parser.add_argument("--cleanup",action="store_true")
args=parser.parse_args()
OUT=pathlib.Path(args.output)
OUT.mkdir(parents=True,exist_ok=True)
CLEANUP=args.cleanup
PATCH="""() => {
  const a=window.__app;
  if(!a.renderer.backend.isWebGPUBackend) throw new Error('Cleanup prototype is validated only on WebGPU.');
  // This internal Three r185 API is used only to establish whether explicit
  // ownership fixes the leak. A production implementation needs a reviewed
  // disposal adapter or upstream-supported standalone-buffer disposal.
  const sProto=Object.getPrototypeOf(a.sim), rProto=Object.getPrototypeOf(a.render);
  const build=sProto.buildKernels;
  sProto.buildKernels=function() {
    const oldStep=this.computeStep,oldInit=this.computeInit;
    build.call(this);
    oldStep?.dispose();oldInit?.dispose();
  };
  const dispose=rProto.disposeTrails;
  rProto.disposeTrails=function() {
    const write=this.trailWrite,init=this.trailInit,buf=this.trailBuf;
    dispose.call(this);
    write?.dispose();init?.dispose();if(buf) a.renderer._attributes.delete(buf.value);
  };
  const apply=a.applyParticleCount.bind(a);
  a.applyParticleCount=n=>{
    const previous=a.sim;
    apply(n);
    previous.computeStep.dispose();previous.computeInit.dispose();
    for(const key of ['positions','ages','speeds','spawnFrames']) a.renderer._attributes.delete(previous[key].value);
  };
}"""
async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(executable_path=args.browser,
      headless=True,ignore_default_args=["--headless=old"],args=["--headless=new","--enable-gpu"])
    results={}
    for kind,query in [("particle-count",""),("trail-density","&mode=trails"),("system","")]:
      page=await browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=2,reduced_motion="reduce")
      errors=[]
      page.on("pageerror",lambda e:errors.append(str(e)))
      page.on("console",lambda m:errors.append(m.text) if m.type=="error" else None)
      await page.goto(args.url+"?aq=0&rs=1"+query,wait_until="networkidle")
      await page.wait_for_function("!!window.__app")
      await page.evaluate("""() => {
        const a=window.__app;a.renderer.setAnimationLoop(null);a.simSettings.paused=false;
        window.__settle=()=>new Promise(resolve=>{
          let n=0;
          a.renderer.setAnimationLoop(()=>{
            a.frame(1/60);
            if(++n===5){a.renderer.setAnimationLoop(null);resolve();}
          });
        });
      }""")
      if CLEANUP: await page.evaluate(PATCH)
      await page.evaluate("window.__settle()")
      steps=await page.evaluate("""async (kind) => {
        const a=window.__app, results=[];
        const snapshot=label=>results.push({label,memory:{...a.renderer.info.memory}});
        snapshot('initial');
        for(let i=0;i<6;i++) {
          if(kind==='particle-count') a.applyParticleCount(i%2===0?131072:262144);
          if(kind==='trail-density') a.setRenderSetting('trailDensity',i%2===0?.5:1);
          if(kind==='system') a.setSystem(i%2===0?'lorenz':'aizawa');
          await window.__settle();
          snapshot('change-'+(i+1));
        }
        return results;
      }""",kind)
      cdp=await page.context.new_cdp_session(page)
      await cdp.send("HeapProfiler.collectGarbage")
      steps.append(await page.evaluate("({label:'after-gc',memory:{...window.__app.renderer.info.memory}})"))
      png=await page.evaluate("""async () => {
        const a=window.__app;
        a.reset();
        for(let i=0;i<24;i++) await window.__settle();
        a.render.renderFrame();
        return a.renderer.domElement.toDataURL('image/png').split(',')[1];
      }""")
      (OUT/("lifetime-"+kind+("-cleanup" if CLEANUP else "-baseline")+".png")).write_bytes(base64.b64decode(png))
      results[kind]={"steps":steps,"errors":errors}
      print(json.dumps({"case":kind,"cleanup":CLEANUP,"initial":steps[0],"final":steps[-1],"errors":errors}),flush=True)
      await page.close()
    (OUT/("lifetime-cleanup.json" if CLEANUP else "lifetime.json")).write_text(json.dumps(results,indent=2))
    await browser.close()
asyncio.run(main())
