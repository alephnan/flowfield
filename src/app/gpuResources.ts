import type { BufferAttribute, BufferGeometry, Texture, WebGPURenderer } from 'three/webgpu';

interface StorageAttribute extends BufferAttribute {
  pbo?: Texture;
}

interface WebGLAttributeData {
  id?: number | string;
  baseId?: number;
  transformBuffer?: WebGLBuffer;
}

/** Three r185 internals used only at this resource-ownership boundary. */
interface WebGLResourceBackend {
  isWebGLBackend?: boolean;
  gl: WebGL2RenderingContext;
  has(resource: object): boolean;
  get(resource: object): WebGLAttributeData;
  destroyAttribute(attribute: BufferAttribute): void;
  vaoCache: Record<string, WebGLVertexArrayObject>;
  transformFeedbackCache: Record<string, WebGLTransformFeedback>;
  state: { resetVertexState(): void };
}

interface AttributeOwner {
  _attributes: { delete(attribute: BufferAttribute): unknown };
}

/**
 * Remove only bindings that reference the retiring attribute. Three r185's
 * fallback caches VAOs/transform feedback by colon-separated attribute IDs;
 * storage IDs have a |0 / |1 suffix for the two alternating buffers.
 * Call after removing every render object that uses this attribute.
 */
function releaseWebGLBindings(backend: WebGLResourceBackend, attribute: object) {
  if (!backend.has(attribute)) return;
  const data = backend.get(attribute);
  const id = data.baseId ?? data.id;
  if (id === undefined) return;
  const references = (key: string) => key.split(':').some(part => part.split('|')[0] === String(id));

  for (const [key, vao] of Object.entries(backend.vaoCache)) {
    if (!references(key)) continue;
    backend.state.resetVertexState();
    backend.gl.deleteVertexArray(vao);
    delete backend.vaoCache[key];
  }
  for (const [key, feedback] of Object.entries(backend.transformFeedbackCache)) {
    if (!references(key)) continue;
    backend.gl.deleteTransformFeedback(feedback);
    delete backend.transformFeedbackCache[key];
  }
}

/**
 * Release an exclusively owned simulation/history buffer after its consumers
 * have been disposed. Attribute.dispose() alone does not retire standalone
 * storage in Three r185. Keep this compatibility code covered on BOTH backends
 * when upgrading Three; do not scatter private renderer access in controllers.
 */
export function disposeStorageBuffer(renderer: WebGPURenderer, attribute: StorageAttribute) {
  const backend = renderer.backend as unknown as WebGLResourceBackend;
  if (backend.isWebGLBackend && backend.has(attribute)) {
    const data = backend.get(attribute);
    releaseWebGLBindings(backend, attribute);
    // Three r185 destroys the active buffer only; retire its TF partner too.
    if (data.transformBuffer) backend.gl.deleteBuffer(data.transformBuffer);
  }
  // WebGL arbitrary-index reads use a texture owned by this storage attribute.
  attribute.pbo?.dispose();
  // The renderer manager destroys the active GPU buffer and updates accounting.
  (renderer as unknown as AttributeOwner)._attributes.delete(attribute);
  // WebGL can allocate write-only transform-feedback outputs directly, without
  // registering them in the shared attribute manager (e.g. spawnFrames).
  if (backend.isWebGLBackend && backend.has(attribute)) {
    backend.destroyAttribute(attribute);
  }
}

/** Dispose an owned geometry, including WebGL cache entries retaining its buffers. */
export function disposeOwnedGeometry(renderer: WebGPURenderer, geometry: BufferGeometry) {
  const backend = renderer.backend as unknown as WebGLResourceBackend;
  if (backend.isWebGLBackend) {
    for (const attribute of Object.values(geometry.attributes)) {
      releaseWebGLBindings(backend, attribute);
    }
  }
  geometry.dispose();
}
