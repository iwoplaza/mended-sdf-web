struct Uniforms {
  canvasSize: vec2u,
}

@group(0) @binding(0) var sourceTexture: texture_2d<f32>;

@fragment
fn main(
  @builtin(position) coord_f32 : vec4<f32>
) -> @location(0) vec4<f32> {
  var coord = vec2u(floor(coord_f32.xy));


  let color = textureLoad(
    sourceTexture,
    coord,
    0
  );

  // no post-processing for now

  return vec4f(color.rgb, 1.0);
}
