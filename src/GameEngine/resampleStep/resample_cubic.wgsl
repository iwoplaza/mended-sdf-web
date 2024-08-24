struct Canvas {
  size: vec2<i32>,
  e_x: vec2f, // texel size in x direction
  e_y: vec2f, // texel size in y direction
}

@group(0) @binding(0) var smplr: sampler;
@group(0) @binding(1) var clamping_smplr: sampler;
@group(0) @binding(2) var texture: texture_2d<f32>; // source texture
@group(0) @binding(3) var tex_hg: texture_1d<f32>;  // filter offsets and weights

@group(1) @binding(0) var<uniform> canvas: Canvas;            

/**
 * Implementation based on:
 * https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering
 */
@fragment
fn main(
  @location(0) uv: vec2f,
) -> @location(0) vec4<f32> {
  // calc filter texture coordinates where [0,1] is a single texel
  // (can be done in vertex program instead)
  let coord_hg = uv * vec2f(canvas.size) - vec2f(0.5f, 0.5f);
  // fetch offsets and weights from filter texture
  var hg_x = textureSample(tex_hg, smplr, coord_hg.x).xyz;
  var hg_y = textureSample(tex_hg, smplr, coord_hg.y).xyz;
  // determine linear sampling coordinates
  var coord_source10 = uv + hg_x.x * canvas.e_x;
  var coord_source00 = uv - hg_x.y * canvas.e_x;
  var coord_source11 = coord_source10 + hg_y.x * canvas.e_y;
  var coord_source01 = coord_source00 + hg_y.x * canvas.e_y;
  coord_source10 = coord_source10 - hg_y.y * canvas.e_y;
  coord_source00 = coord_source00 - hg_y.y * canvas.e_y;
  // fetch four linearly interpolated inputs
  var tex_source00 = textureSample(texture, clamping_smplr, coord_source00);
  var tex_source10 = textureSample(texture, clamping_smplr, coord_source10);
  var tex_source01 = textureSample(texture, clamping_smplr, coord_source01);
  var tex_source11 = textureSample(texture, clamping_smplr, coord_source11);
  // weight along y direction
  tex_source00 = mix(tex_source00, tex_source01, hg_y.z);
  tex_source10 = mix(tex_source10, tex_source11, hg_y.z);
  // weight along x direction
  tex_source00 = mix(tex_source00, tex_source10, hg_x.z);
  
  return tex_source00;
}
