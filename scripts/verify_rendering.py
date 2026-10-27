"""Browser regression checks for both renderer backends, GPU lifetime, and image parity.
Requires Python Playwright and Pillow, a Vite dev server, and a Chromium browser.
--baseline-main points to a preserved original main.ts served by the same Vite server.
"""
import argparse, asyncio, base64, hashlib, io, json, pathlib
from PIL import Image
from playwright.async_api import async_playwright

INSTRUMENT = """() => {
  window.__allocations = {};
  function track(proto, createName, deleteName, label) {
    if(!proto) return;
    const create=proto[createName], destroy=proto[deleteName], live=new WeakSet();
    const stat=window.__allocations[label]={created:0,deleted:0,live:0};
    proto[createName]=function(...args) {
      const result=create.apply(this,args);
      if(result){live.add(result);stat.created++;stat.live++;}
      return result;
    };
    proto[deleteName]=function(resource,...args) {
      if(resource && live.delete(resource)){stat.deleted++;stat.live--;}
      return destroy.call(this,resource,...args);
    };
  }
  const gl=window.WebGL2RenderingContext?.prototype;
  for(const name of ['Buffer','Texture','VertexArray','TransformFeedback'])
    track(gl,'create'+name,'delete'+name,'gl'+name);
  if(window.GPUDevice && window.GPUBuffer) {
    const create=GPUDevice.prototype.createBuffer,destroy=GPUBuffer.prototype.destroy,live=new WeakSet();
    const stat=window.__allocations.gpuBuffer={created:0,deleted:0,live:0};
    GPUDevice.prototype.createBuffer=function(...args){
      const result=create.apply(this,args); live.add(result);stat.created++;stat.live++;return result;
    };
    GPUBuffer.prototype.destroy=function(...args){
      if(live.delete(this)){stat.deleted++;stat.live--;}return destroy.apply(this,args);
    };
  }
}"""

FIXTURE = """() => {
  const a=window.__app;
  a.renderer.setAnimationLoop(null);
  a.simSettings.paused=false;
  a.renderSettings.autoQuality=false;
  window.__frames=(count,stress=false)=>new Promise(resolve=>{
    let frame=0;
    a.renderer.setAnimationLoop(()=>{
      if(stress && frame===30) a.sim.requestBurst(a.sim.burstCenterU.value.clone().set(.2,0,.1),.25,.3);
      if(stress && frame===90) a.reset();
      a.frame(1/60);
      if(++frame===count){a.renderer.setAnimationLoop(null);resolve();}
    });
  });
  window.__snapshot=()=>({
    memory:{...a.renderer.info.memory},
    allocations:JSON.parse(JSON.stringify(window.__allocations)),
    vaoCount:Object.keys(a.renderer.backend.vaoCache||{}).length,
    feedbackCount:Object.keys(a.renderer.backend.transformFeedbackCache||{}).length,
  });
}"""

async def open_page(browser,args,query,backend,baseline=False):
    page=await browser.new_page(viewport={"width":1440,"height":900},device_scale_factor=2,reduced_motion="reduce")
    messages=[]
    page.on("pageerror",lambda e:messages.append("pageerror: "+str(e)))
    page.on("console",lambda m:messages.append(m.type+": "+m.text) if m.type in ["error","warning"] else None)
    await page.add_init_script("("+INSTRUMENT+")()")
    if baseline:
        baseline_src=args.baseline_main.rsplit("/",1)[0]
        await page.route("**/src/**",lambda route:route.continue_(
            url=args.url.rstrip("/")+"/"+baseline_src+"/"+route.request.url.split("/src/",1)[1]))
    url=args.url+"?aq=0&rs=1"+query+("&forceWebGL" if backend=="webgl" else "")
    await page.goto(url,wait_until="networkidle")
    await page.wait_for_function("!!window.__app",timeout=60000)
    actual=await page.evaluate("window.__app.renderer.backend.isWebGPUBackend===true?'webgpu':'webgl'")
    assert actual==backend, f"Expected {backend}, got {actual}"
    source_is_current=await page.evaluate("typeof window.__app.sim.dispose==='function'")
    assert source_is_current != baseline, "Baseline/current source isolation failed"
    await page.evaluate(FIXTURE)
    return page,messages

def significant_errors(messages):
    return [m for m in messages if "404 (Not Found)" not in m
        and "powerPreference" not in m and "Timestamp tracking is disabled" not in m
        and not m.startswith('warning: THREE.PostProcessing: "PostProcessing" has been renamed')]

async def visual(browser,args,backend,case):
    name,query,stress=case
    files=[]
    details=[]
    all_messages=[]
    for baseline in ([True,False] if args.baseline_main else [False]):
        page,messages=await open_page(browser,args,query,backend,baseline)
        if stress:
            await page.evaluate("window.__app.sim.maxAgeU.value=0.5")
        await page.evaluate("window.__app.reset()")
        await page.evaluate("({n,stress})=>window.__frames(n,stress)",{"n":args.frames,"stress":stress})
        state=await page.evaluate("""async () => {
          const a=window.__app,b=a.renderer.backend;
          if(b.device) await b.device.queue.onSubmittedWorkDone();
          a.render.renderFrame();
          return {png:a.renderer.domElement.toDataURL('image/png').split(',')[1],
            error:b.gl?.getError()||0,sim:a.simSettings,render:a.renderSettings,
            canvas:[a.renderer.domElement.width,a.renderer.domElement.height]};
        }""")
        assert state["error"]==0, f"{backend}/{name}: GL error {state['error']}"
        all_messages.extend(messages)
        errors=significant_errors(messages)
        assert not errors, f"{backend}/{name}: {errors}"
        file=args.out/(backend+"-"+name+("-baseline" if baseline else "-current")+".png")
        file.write_bytes(base64.b64decode(state.pop("png")))
        files.append(file)
        details.append(state)
        await page.close()
    image=Image.open(files[-1]).convert("RGBA")
    result={"backend":backend,"case":name,"width":image.width,"height":image.height,
        "sourceIsolationVerified":True,"currentPixelSha256":hashlib.sha256(image.tobytes()).hexdigest(),"state":details[-1],"messages":list(dict.fromkeys(all_messages))}
    if args.baseline_main:
        old=Image.open(files[0]).convert("RGBA")
        result["identicalPixels"]=old.size==image.size and old.tobytes()==image.tobytes()
        assert result["identicalPixels"], f"Visual mismatch: {backend}/{name}"
    return result

LIFETIME = """async () => {
  const a=window.__app,b=a.renderer.backend;
  const mutate=async (key,value)=>{
    if(key==='count') a.applyParticleCount(value);
    else if(key==='system') a.setSystem(value);
    else if(key==='integrator') a.setIntegrator(value);
    else a.setRenderSetting(key,value);
    await window.__frames(4);
  };
  // Warm every layer before testing repeated changes, including initially hidden layers.
  await mutate('mode','both');
  await mutate('glyphs',true);
  await mutate('count',65536);
  await mutate('colormap','viridis');
  await mutate('colormap','inferno');
  const checkpoints=[];
  const record=label=>checkpoints.push({label,...window.__snapshot()});
  record('initial');
  for(let cycle=0;cycle<5;cycle++) {
    const retired=a.sim;
    const oldAttributes=['positions','ages','speeds','spawnFrames'].map(key=>retired[key].value);
    const oldGLBuffers=b.gl?oldAttributes.flatMap(attribute=>b.get(attribute).buffers||[]):[];
    const oldTextures=b.gl?oldAttributes.map(attribute=>attribute.pbo).filter(Boolean).map(texture=>b.get(texture).textureGPU):[];
    await mutate('count',32768);
    if(oldAttributes.some(attribute=>b.has(attribute))) throw new Error('Retired storage remains registered');
    if(oldGLBuffers.some(buffer=>b.gl.isBuffer(buffer))) throw new Error('Retired transform-feedback buffer remains live');
    if(oldTextures.some(texture=>b.gl.isTexture(texture))) throw new Error('Retired PBO texture remains live');
    await mutate('trailDensity',.5);
    await mutate('integrator','euler');
    await mutate('system','lorenz');
    await mutate('colormap','turbo');
    await mutate('paperMode',true);
    await mutate('mode','trails'); // points will be hidden when their buffers are retired
    await mutate('glyphs',false);
    await mutate('count',65536);
    await mutate('mode','points'); // trails/glyphs are hidden during this rebuild
    await mutate('count',32768);
    await mutate('count',65536);
    await mutate('trailDensity',1);
    await mutate('integrator','rk4');
    await mutate('system','aizawa');
    await mutate('colormap','inferno');
    await mutate('paperMode',false);
    await mutate('mode','both');
    await mutate('glyphs',true);
    a.reset();
    await window.__frames(8);
    record('cycle-'+(cycle+1));
  }
  if(b.device) await b.device.queue.onSubmittedWorkDone();
  return {checkpoints,glError:b.gl?.getError()||0};
}"""

async def lifetime(browser,args,backend):
    page,messages=await open_page(browser,args,"&n=65536&mode=both",backend)
    result=await page.evaluate(LIFETIME)
    cdp=await page.context.new_cdp_session(page)
    await cdp.send("HeapProfiler.collectGarbage")
    result["afterGc"]=await page.evaluate("window.__snapshot()")
    result["backend"]=backend
    # A rebuilt simulation must also produce the same image as a fresh one.
    capture = """() => {
      const a=window.__app;
      a.render.renderFrame();
      return a.renderer.domElement.toDataURL('image/png').split(',')[1];
    }"""
    state = """() => {
      const a=window.__app;
      return {sim:a.simSettings,render:a.renderSettings,parameters:a.paramValues(),
        camera:a.render.camera.position.toArray(),target:a.render.controls.target.toArray(),
        ratio:a.renderer.getPixelRatio(),count:a.sim.count,frame:a.sim.frameU.value};
    }"""
    await page.evaluate("window.__app.reset()")
    await page.evaluate("window.__frames(120)")
    result["rebuiltState"]=await page.evaluate(state)
    rebuilt=Image.open(io.BytesIO(base64.b64decode(await page.evaluate(capture)))).convert("RGBA")
    rebuilt.save(args.out/(backend+"-rebuilt.png"))
    await page.close()
    fresh,fresh_messages=await open_page(browser,args,"&n=65536&mode=both&glyphs=1",backend)
    await fresh.evaluate("window.__app.reset()")
    await fresh.evaluate("window.__frames(120)")
    expected=Image.open(io.BytesIO(base64.b64decode(await fresh.evaluate(capture)))).convert("RGBA")
    result["freshState"]=await fresh.evaluate(state)
    expected.save(args.out/(backend+"-fresh.png"))
    matches=rebuilt.size==expected.size and rebuilt.tobytes()==expected.tobytes()
    if not matches and backend=="webgl":
        # Three r185 caches point VAOs against one side of its alternating
        # transform-feedback buffers. Even the untouched baseline alternates
        # images across resets; try the other reset phase, without changing
        # renderer state or accepting any pixel tolerance.
        await fresh.evaluate("window.__app.reset()")
        await fresh.evaluate("window.__frames(120)")
        expected=Image.open(io.BytesIO(base64.b64decode(await fresh.evaluate(capture)))).convert("RGBA")
        expected.save(args.out/(backend+"-fresh-alternate-phase.png"))
        matches=rebuilt.size==expected.size and rebuilt.tobytes()==expected.tobytes()
        result["alternateWebGLResetPhase"]=True
    await fresh.close()
    result["resetMatchesFresh"]=matches
    result["messages"]=messages+fresh_messages
    (args.out/(backend+"-lifetime.json")).write_text(json.dumps(result,indent=2),encoding="utf8")
    assert result["resetMatchesFresh"], f"{backend}: rebuilt simulation differs from fresh state"
    assert not significant_errors(fresh_messages), f"{backend}: {fresh_messages}"
    assert not significant_errors(messages), f"{backend} lifecycle errors: {messages}"
    assert result["glError"]==0
    first,last=result["checkpoints"][0],result["checkpoints"][-1]
    for key in ["storageAttributes","textures","uniformBuffers","geometries"]:
        assert first["memory"][key]==last["memory"][key], f"{backend}: growing {key}: {first['memory'][key]} -> {last['memory'][key]}"
    assert last["memory"]["total"]-first["memory"]["total"]<65536, f"{backend}: growing memory"
    # First cycle warms backend combinations; subsequent equal states must plateau.
    warm=result["checkpoints"][1]
    for key in ["glBuffer","glTexture","glVertexArray","glTransformFeedback","gpuBuffer"]:
        if key in warm["allocations"]:
            assert warm["allocations"][key]["live"]==last["allocations"][key]["live"], f"{backend}: live {key} still grows"
    return result

async def main(args):
    args.out=pathlib.Path(args.output)
    args.out.mkdir(parents=True,exist_ok=True)
    systems=["aizawa","lorenz","rossler","thomas","halvorsen","chen","dadras","vanderpol","duffing"]
    palettes=["inferno","viridis","turbo","twocolor"]
    colors=["speed","age","position"]
    cases=[(s,"&sys="+s+"&n=32768&mode=both&cmap="+palettes[i%4]+"&cby="+colors[i%3]+("&paper=1" if i%2 else "")+("&glyphs=1" if i%3==0 else ""),False) for i,s in enumerate(systems)]
    cases += [
        ("default-points","",False),
        ("default-trails","&mode=trails",False),
        ("long-trails-respawn","&mode=trails&tl=64",True),
        ("non-power-count","&n=32771&mode=both&td=0.25&tl=32&paper=1&cby=position",False),
        ("bloom","&n=32768&mode=both&bloom=1",False),
    ]
    if args.quick: cases=[cases[0],cases[-2]]
    if args.case: cases=[case for case in cases if case[0] in args.case]
    if not cases: raise ValueError("No matching visual cases")
    report={"browser":args.browser,"viewport":[1440,900],"dpr":2,"fixedStep":1/60,"frames":args.frames,"visual":[],"lifetime":[],"failures":[]}
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=args.browser,headless=True,
            ignore_default_args=["--headless=old"],args=["--headless=new","--enable-gpu"])
        for backend in args.backend or ["webgpu","webgl"]:
            if not args.lifetime_only:
                for case in cases:
                    try:
                        result=await visual(browser,args,backend,case)
                        report["visual"].append(result)
                        print(json.dumps({"backend":backend,"case":case[0],"identical":result.get("identicalPixels")}),flush=True)
                    except Exception as e:
                        report["failures"].append(str(e))
                        print("FAIL: "+str(e),flush=True)
                        raise
                    finally:
                        (args.out/"verification.json").write_text(json.dumps(report,indent=2),encoding="utf8")
            if not args.visual_only:
                try:
                    result=await lifetime(browser,args,backend)
                    report["lifetime"].append(result)
                    print(json.dumps({"backend":backend,"lifetime":"passed","initial":result["checkpoints"][0],"final":result["checkpoints"][-1]}),flush=True)
                except Exception as e:
                    report["failures"].append(str(e))
                    print("FAIL: "+str(e),flush=True)
                    raise
                finally:
                    (args.out/"verification.json").write_text(json.dumps(report,indent=2),encoding="utf8")
        await browser.close()

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser",required=True)
    parser.add_argument("--url",default="http://127.0.0.1:5173/")
    parser.add_argument("--output",default="artifacts/performance/implementation")
    parser.add_argument("--baseline-main")
    parser.add_argument("--backend",action="append",choices=["webgpu","webgl"])
    parser.add_argument("--frames",type=int,default=120)
    parser.add_argument("--case",action="append")
    parser.add_argument("--quick",action="store_true")
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument("--lifetime-only",action="store_true")
    mode.add_argument("--visual-only",action="store_true")
    args=parser.parse_args()
    if args.frames < 1: parser.error("frames must be positive")
    asyncio.run(main(args))
