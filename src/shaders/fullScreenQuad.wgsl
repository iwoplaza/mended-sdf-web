const SCREEN_RECT = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>(1.0, -1.0),
  vec2<f32>(-1.0, 1.0),

  vec2<f32>(1.0, -1.0),
  vec2<f32>(-1.0, 1.0),
  vec2<f32>(1.0, 1.0),
);

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32
) -> @builtin(position) vec4<f32> {
  return vec4(SCREEN_RECT[vertexIndex], 0.0, 1.0);
}
