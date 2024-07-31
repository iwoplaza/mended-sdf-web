import { wgsl } from 'typegpu';
import { struct, vec2f, vec4f } from 'typegpu/data';

const VertexOutput = struct({
  '@builtin(position) position': vec4f,
  '@location(0) uv': vec2f,
}).$name('vertex_output');

export const fullScreenQuadVertexShader = {
  args: ['@builtin(vertex_index) vertexIndex: u32'],
  output: VertexOutput,
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

    var output: ${VertexOutput};
    output.position = vec4(SCREEN_RECT[vertexIndex], 0.0, 1.0);
    output.uv = UVS[vertexIndex];
    return output;
  `,
};
