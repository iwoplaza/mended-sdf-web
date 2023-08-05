const SCREEN_RECT = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>(1.0, -1.0),
  vec2<f32>(-1.0, 1.0),

  vec2<f32>(1.0, -1.0),
  vec2<f32>(-1.0, 1.0),
  vec2<f32>(1.0, 1.0),
);

struct Uniforms {
  canvasSize: vec2<i32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var blurredAndAlbedo: texture_2d<f32>;
@group(0) @binding(2) var normalsAndDepth: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@vertex
fn main_vert(
  @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
  var output: VertexOutput;

  output.position = vec4(SCREEN_RECT[vertexIndex], 0.0, 1.0);

  return output;
}

@fragment
fn main_frag(
  @builtin(position) coord : vec4<f32>
) -> @location(0) vec4<f32> {
  var result: vec4<f32>;

  let c = coord.xy / vec2<f32>(uniforms.canvasSize);
  // let c = coord.xy / vec2<f32>(512, 512);
  if (c.x < 0.33) {
    result = textureLoad(
      normalsAndDepth,
      vec2<i32>(floor(coord.xy)),
      0
    );
    result.x = (result.x + 1.0) * 0.5;
    result.y = (result.y + 1.0) * 0.5;
    result.z = (result.z + 1.0) * 0.5;
    result.a = 1.0;
  }
  else if (c.x < 0.66) {
    result = textureLoad(
      normalsAndDepth,
      vec2<i32>(floor(coord.xy)),
      0
    );
    let depth = result.a;
    result.x = depth;
    result.y = depth;
    result.z = depth;
    result.a = 1.0;
  }
  else {
    result = textureLoad(
      blurredAndAlbedo,
      vec2<i32>(floor(coord.xy)),
      0
    );
  }

  return result;
}