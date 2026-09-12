import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';
import { PerspectiveCamera, Vector3 } from 'three';

// Exercise the actual small TS modules with Node's runner, without adding a framework.
async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { captureFrame } = await loadModule('../src/app/capture.ts');
const { responsiveDistance } = await loadModule('../src/app/framing.ts');
const { buildQuery, parseURL, syncURL } = await loadModule('../src/app/URLState.ts');

test('capture uses export resolution, then restores live rendering', () => {
  let ratio = 0.75;
  const frames = [];
  const renderer = { getPixelRatio: () => ratio, setPixelRatio: value => { ratio = value; } };
  const result = captureFrame(renderer, 2, () => frames.push(ratio), () => ({ ratio }));
  assert.equal(result.ratio, 2);
  assert.equal(ratio, 0.75);
  assert.deepEqual(frames, [2, 0.75]);
});

test('a failed PNG capture still restores live resolution and renders again', () => {
  let ratio = 0.5;
  const frames = [];
  const renderer = { getPixelRatio: () => ratio, setPixelRatio: value => { ratio = value; } };
  assert.throws(() => captureFrame(renderer, 3, () => frames.push(ratio), () => { throw new Error('capture failed'); }), /capture failed/);
  assert.equal(ratio, 0.5);
  assert.deepEqual(frames, [3, 0.5]);
});

test('a failed export render cannot strand the live renderer at export resolution', () => {
  let ratio = 1;
  let captured = false;
  const renderer = { getPixelRatio: () => ratio, setPixelRatio: value => { ratio = value; } };
  assert.throws(() => captureFrame(renderer, 2, () => {
    if (ratio === 2) throw new Error('render failed');
  }, () => { captured = true; }), /render failed/);
  assert.equal(ratio, 1);
  assert.equal(captured, false);
});

test('portrait framing keeps a reference composition inside the narrow viewport', () => {
  const reference = 5;
  const radius = reference * Math.tan(50 * Math.PI / 360) * 0.8;
  for (const [width, height] of [[364, 514], [718, 710], [910, 436], [1070, 616]]) {
    const camera = new PerspectiveCamera(50, width / height, 0.01, 1000);
    camera.position.z = responsiveDistance(reference, camera.aspect);
    camera.updateMatrixWorld();
    for (const point of [new Vector3(radius, 0, 0), new Vector3(-radius, 0, 0), new Vector3(0, radius, 0), new Vector3(0, -radius, 0)]) {
      const projected = point.project(camera);
      assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, `${width}×${height} clips the composition`);
    }
  }
});

test('repeated viewport changes retain the authored landscape framing', () => {
  const reference = 7.5;
  for (let i = 0; i < 20; i++) {
    assert.ok(responsiveDistance(reference, 0.5) > reference);
    assert.equal(responsiveDistance(reference, 1.8), reference);
  }
  assert.ok(Number.isFinite(responsiveDistance(reference, 0)));
});

const sim = { integrator: 'rk4', dt: 0.01, substeps: 4, timeScale: 0.75, paused: false, particleCount: 65536 };
const render = {
  mode: 'both', colormap: 'twocolor', colorBy: 'age', colorA: '#182330', colorB: '#6d4753',
  pointSize: 0.7, opacity: 0.55, trailLength: 19, trailWidth: 0.4, bloom: false,
  bloomStrength: 0.8, paperMode: true, glyphs: true, resolutionScale: 0.75, autoQuality: true, trailDensity: 0.5,
};

test('shared views round-trip exact supported settings and camera', () => {
  const camera = { position: [38, -55, 43], target: [0, 0, 27], fov: 58 };
  const query = buildQuery('lorenz', { sigma: 10, rho: 28, beta: 8 / 3 }, sim, render, camera);
  globalThis.location = { search: `?${query}` };
  try {
    const restored = parseURL();
    assert.equal(restored.systemId, 'lorenz');
    assert.deepEqual(restored.render, render);
    assert.deepEqual(restored.camera, camera);
    assert.equal(restored.sim.timeScale, 0.75);
    assert.equal(restored.params.beta, 8 / 3);
  } finally {
    delete globalThis.location;
  }
});

test('legacy URL parameters still work without new interface state', () => {
  globalThis.location = { search: '?sys=thomas&p.b=0.208186&paper=0&cmap=inferno&integ=euler&cam=3,4,5,0,0,0,50' };
  try {
    const restored = parseURL();
    assert.equal(restored.params.b, 0.208186);
    assert.equal(restored.sim.integrator, 'euler');
    assert.equal(restored.render.paperMode, false);
    assert.equal(restored.camera.fov, 50);
  } finally {
    delete globalThis.location;
  }
});

test('URL synchronization debounces changes and retains capability overrides', async () => {
  const changes = [];
  globalThis.location = { pathname: '/flowfield/', search: '?forceWebGL&forceMobile' };
  globalThis.history = { replaceState: (_state, _title, url) => changes.push(url) };
  try {
    syncURL('sys=aizawa');
    syncURL('sys=lorenz&cam=1,2,3,0,0,0,50');
    await delay(450);
    assert.equal(changes.length, 1);
    const query = new URLSearchParams(changes[0].split('?')[1]);
    assert.equal(query.get('sys'), 'lorenz');
    assert.ok(query.has('cam'));
    assert.ok(query.has('forceWebGL'));
    assert.ok(query.has('forceMobile'));
  } finally {
    delete globalThis.location;
    delete globalThis.history;
  }
});
