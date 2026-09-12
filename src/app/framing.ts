/** Preserve the authored composition, compensating for the narrower axis. */
export function responsiveDistance(referenceDistance: number, aspect: number): number {
  return referenceDistance / Math.min(1, Math.max(aspect, 0.01));
}
