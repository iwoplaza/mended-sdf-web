struct Uniforms {
  modelMatrix: mat4x4<f32>,
  normalModelMatrix: mat4x4<f32>,
}
struct Camera {
  viewProjectionMatrix: mat4x4<f32>,
  invViewProjectionMatrix: mat4x4<f32>,
}
// @group(0) @binding(0) var<uniform> uniforms: Uniforms;
// @group(0) @binding(1) var<uniform> camera: Camera;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) rayDir: vec3<f32>,
  // @location(1) fragNormal: vec3<f32>,     // normal in world space
}

const SCREEN_RECT = array<vec2<f32>, 6>(
  vec2(-1.0, -1.0),
  vec2(1.0, -1.0),
  vec2(-1.0, 1.0),

  vec2(1.0, -1.0),
  vec2(-1.0, 1.0),
  vec2(1.0, 1.0),
);

@vertex
fn main_vert(
  @builtin(vertex_index) vertexIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let worldPosition = (/*uniforms.modelMatrix * */vec4(SCREEN_RECT[vertexIndex], 0.0, 1.0)).xyz;

  output.position = /*camera.viewProjectionMatrix * */vec4(worldPosition, 1.0);
  output.rayDir = worldPosition.xyz;
  // output.fragNormal = normalize((/*uniforms.normalModelMatrix * */vec4(normal, 1.0)).xyz);
  return output;
}


struct GBufferOutput {
  // Textures: diffuse color, specular color, smoothness, emissive etc. could go here
  @location(0) albedo: vec4<f32>,
  @location(1) normal: vec4<f32>,
}

@fragment
fn main_frag(
  @location(0) rayDir: vec3<f32>,
  // @location(1) fragUV: vec2<f32>
) -> GBufferOutput {
  // faking some kind of checkerboard texture
  let uv = floor(30.0 * rayDir);
  let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));

  var output : GBufferOutput;
  output.normal = vec4(rayDir, 1.0);
  output.albedo = vec4(c, c, c, 1.0);

  return output;
}