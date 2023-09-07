@group(0) @binding(0) var smplr: sampler;
@group(0) @binding(1) var texture: texture_2d<f32>; // source texture

@fragment
fn main(
  @location(0) uv: vec2f,
) -> @location(0) vec4<f32> {
  return textureSample(texture, smplr, uv);
}
