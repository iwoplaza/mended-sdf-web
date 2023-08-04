struct Uniforms {
  modelMatrix: mat4x4<f32>,
  normalModelMatrix: mat4x4<f32>,
}
struct Projection {
  projectionMatrix: mat4x4<f32>,
}
struct Camera {
  viewMatrix: mat4x4<f32>,
  normalViewMatrix: mat3x3<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> projection: Projection;
@group(0) @binding(2) var<uniform> camera: Camera;

struct VertexOutput {
  @builtin(position) Position: vec4<f32>,
  @location(0) fragNormal: vec3<f32>,    // normal in world space
  @location(1) fragUV: vec2<f32>,
  @location(2) fragDepth: f32,
}

@vertex
fn main_vert(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>
) -> VertexOutput {
  var output: VertexOutput;

  let worldPosition = (uniforms.modelMatrix * vec4(position, 1.0)).xyz;
  let viewPosition = camera.viewMatrix * vec4(worldPosition, 1.0);
  output.Position = projection.projectionMatrix * viewPosition;
  output.fragNormal = normalize(camera.normalViewMatrix * (uniforms.normalModelMatrix * vec4(normal, 1.0)).xyz);
  output.fragUV = uv;
  // output.fragDepth = worldPosition.x;
  output.fragDepth = -viewPosition.z * 0.05;
  return output;
}

struct GBufferOutput {
  @location(0) albedo: vec4<f32>,
  @location(1) normalAndDepth: vec4<f32>,
}

@fragment
fn main_frag(
  @location(0) fragNormal: vec3<f32>,
  @location(1) fragUV: vec2<f32>,
  @location(2) fragDepth: f32,
) -> GBufferOutput {
  // faking some kind of checkerboard texture
  let uv = floor(30.0 * fragUV);
  let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));

  var output : GBufferOutput;
  output.normalAndDepth = vec4(fragNormal, fragDepth / (1.0 + fragDepth));
  output.albedo = vec4(c, c, c, 1.0);

  return output;
}
