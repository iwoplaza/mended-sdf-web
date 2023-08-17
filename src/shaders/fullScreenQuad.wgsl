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

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4(SCREEN_RECT[vertexIndex], 0.0, 1.0);
  output.uv = UVS[vertexIndex];
  return output;
}
