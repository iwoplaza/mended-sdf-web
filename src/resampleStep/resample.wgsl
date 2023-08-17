@group(0) @binding(0) var texture: texture_2d<f32>;
@group(0) @binding(1) var smplr: sampler;

// TODO: Implement fast Bicubic interpolation.
//       https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering

@fragment
fn main(
  @location(0) uv: vec2f,
) -> @location(0) vec4<f32> {
  return textureSample(
    texture,
    smplr,
    uv,
  );
}
