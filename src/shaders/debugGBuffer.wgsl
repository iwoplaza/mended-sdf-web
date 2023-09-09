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
@group(0) @binding(1) var blurredTex: texture_2d<f32>;
@group(0) @binding(2) var auxTex: texture_2d<f32>;

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
  @builtin(position) coord_f : vec4<f32>
) -> @location(0) vec4<f32> {
  let coord = vec2<i32>(floor(coord_f.xy));

  let blurred = textureLoad(
    blurredTex,
    coord,
    0
  );

  let aux = textureLoad(
    auxTex,
    coord,
    0
  );

  var result: vec4<f32>;

  let c = coord_f.xy / vec2<f32>(uniforms.canvasSize);
  // let c = coord.xy / vec2<f32>(512, 512);
  if (c.x < 0.25) {
    // NORMALS

    result = vec4(
      (aux.x + 1.0) * 0.5, // normal.x
      (aux.y + 1.0) * 0.5, // normal.y
      0.5,
      1.0,
    );
  }
  else if (c.x < 0.5) {
    // ALBEDO_LUMI

    let albedo = aux.z;
    result = vec4(
      albedo,
      albedo,
      albedo,
      1.0,
    );
  }
  else if (c.x < 0.75) {
    // EMISSION_LUMI

    let emission = aux.w;
    result = vec4(
      emission,
      emission,
      emission,
      1.0,
    );
  }
  else {
    // BLURRED

    result = vec4(
      blurred.rgb,
      1.0,
    );
  }

  return result;
}