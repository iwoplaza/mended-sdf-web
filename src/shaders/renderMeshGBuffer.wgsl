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
  @location(0) worldNormal: vec3<f32>,    // normal in world space
  @location(1) fragNormal: vec3<f32>,     // normal in view space
  @location(2) fragUV: vec2<f32>,
  @location(3) fragDepth: f32,
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
  output.worldNormal = (uniforms.normalModelMatrix * vec4(normal, 1.0)).xyz;
  output.fragNormal = camera.normalViewMatrix * output.worldNormal;
  output.fragUV = uv;
  output.fragDepth = -viewPosition.z * 0.05;
  return output;
}

struct GBufferOutput {
  @location(0) blurred: vec4<f32>,
  @location(1) aux: vec4<f32>,
}

const lightDir = vec3f(0.0, 1.0, 0.0);

@fragment
fn main_frag(
  @location(0) worldNormal: vec3<f32>,
  @location(1) fragNormal: vec3<f32>,
  @location(2) fragUV: vec2<f32>,
  @location(3) fragDepth: f32,
) -> GBufferOutput {
  // faking some kind of checkerboard texture
  let uv = floor(30.0 * fragUV);
  let c = 0.2 + 0.5 * ((uv.x + uv.y) - 2.0 * floor((uv.x + uv.y) / 2.0));

  let normal = normalize(worldNormal);
  let viewNormal = normalize(fragNormal);

  let att = max(0.0, dot(normal, lightDir));
  let diffuse = vec3f(1.0, 0.2, 0.1);
  let ambient = vec3f(0.1, 0.1, 0.2);
  let color = vec3f(c, c, c) * (diffuse * att + ambient);

  var output: GBufferOutput;
  output.blurred = vec4(color, 1.0);
  output.aux = vec4(
    fragDepth / (1.0 + fragDepth), // depth
    viewNormal.xy,                 // normal.xy
    c                              // luminance
  );

  return output;
}
