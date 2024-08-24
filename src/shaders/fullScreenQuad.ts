import { builtin, wgsl } from 'typegpu';
import { vec2f } from 'typegpu/data/index';

export const fullScreenQuadVertexShader = {
  code: wgsl`
    const SCREEN_RECT = array<vec2f, 6>(
      vec2f(-1.0, -1.0),
      vec2f(1.0, -1.0),
      vec2f(-1.0, 1.0),

      vec2f(1.0, -1.0),
      vec2f(-1.0, 1.0),
      vec2f(1.0, 1.0),
    );

    const UVS = array<vec2f, 6>(
      vec2f(0.0, 1.0),
      vec2f(1.0, 1.0),
      vec2f(0.0, 0.0),

      vec2f(1.0, 1.0),
      vec2f(0.0, 0.0),
      vec2f(1.0, 0.0),
    );

    let out_pos = vec4(SCREEN_RECT[${builtin.vertexIndex}], 0.0, 1.0);
    let vUV: vec2f = UVS[${builtin.vertexIndex}];
  `,
  output: {
    [builtin.position]: 'out_pos',
    vUV: vec2f,
  },
};
