import { Fn, vec2, vec3, vec4, clamp, mix, dot } from 'three/tsl';
import type { ColormapId, TSLNode } from '../types';

// Polynomial colormap fits — evaluated in-shader, no texture lookups.
// viridis/inferno: degree-6 fits by Matt Zucker (https://www.shadertoy.com/view/WlfXRN, CC0).
// turbo: degree-5 fit by Google (Anton Mikhailov, Apache-2.0).

const poly6 = (t: TSLNode, c: number[][]) => {
  const [c0, c1, c2, c3, c4, c5, c6] = c.map((v) => vec3(...v));
  return c0.add(
    t.mul(c1.add(t.mul(c2.add(t.mul(c3.add(t.mul(c4.add(t.mul(c5.add(t.mul(c6))))))))))),
  );
};

export const viridis = /* @__PURE__ */ Fn(([tIn]: TSLNode[]) => {
  const t = clamp(tIn, 0, 1).toVar();
  return poly6(t, [
    [0.2777273272234177, 0.005407344544966578, 0.3340998053353061],
    [0.1050930431085774, 1.404613529898575, 1.384590162594685],
    [-0.3308618287255563, 0.214847559468213, 0.09509516302823659],
    [-4.634230498983486, -5.799100973351585, -19.33244095627987],
    [6.228269936347081, 14.17993336680509, 56.69055260068105],
    [4.776384997670288, -13.74514537774601, -65.35303263337234],
    [-5.435455855934631, 4.645852612178535, 26.3124352495832],
  ]);
});

export const inferno = /* @__PURE__ */ Fn(([tIn]: TSLNode[]) => {
  const t = clamp(tIn, 0, 1).toVar();
  return poly6(t, [
    [0.0002189403691192265, 0.001651004631001012, -0.01948089843709184],
    [0.1065134194856116, 0.5639564367884091, 3.932712388889277],
    [11.60249308247187, -3.972853965665698, -15.9423941062914],
    [-41.70399613139459, 17.43639888205313, 44.35414519872813],
    [77.162935699427, -33.40235894210092, -81.80730925738993],
    [-71.31942824499214, 32.62606426397723, 73.20951985803202],
    [25.13112622477341, -12.24266895238567, -23.07032500287172],
  ]);
});

export const turbo = /* @__PURE__ */ Fn(([tIn]: TSLNode[]) => {
  const t = clamp(tIn, 0, 1).toVar();
  const v4 = vec4(1.0, t, t.mul(t), t.mul(t).mul(t)).toVar();
  const v2 = vec2(v4.z.mul(v4.z), v4.w.mul(v4.z)).toVar();
  return vec3(
    dot(v4, vec4(0.13572138, 4.6153926, -42.66032258, 132.13108234)).add(
      dot(v2, vec2(-152.94239396, 59.28637943)),
    ),
    dot(v4, vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333)).add(
      dot(v2, vec2(4.27729857, 2.82956604)),
    ),
    dot(v4, vec4(0.1066733, 12.64194608, -60.58204836, 110.36276771)).add(
      dot(v2, vec2(-89.90310912, 27.34824973)),
    ),
  );
});

/**
 * Returns a vec3 color node for scalar t in [0,1].
 * `endpoints` supplies the two uniform colors for the 'twocolor' map.
 */
export function applyColormap(
  id: ColormapId,
  t: TSLNode,
  endpoints: { a: TSLNode; b: TSLNode },
): TSLNode {
  switch (id) {
    case 'viridis':
      return viridis(t);
    case 'inferno':
      return inferno(t);
    case 'turbo':
      return turbo(t);
    case 'twocolor':
      return mix(endpoints.a, endpoints.b, clamp(t, 0, 1));
  }
}
