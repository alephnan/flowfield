/** Always restore live rendering resolution, including capture failures. */
export function captureFrame<T>(renderer: { getPixelRatio(): number; setPixelRatio(ratio: number): void }, ratio: number, render: () => void, capture: () => T): T {
  const previous = renderer.getPixelRatio();
  try {
    renderer.setPixelRatio(ratio);
    render();
    return capture();
  } finally {
    renderer.setPixelRatio(previous);
    render();
  }
}
