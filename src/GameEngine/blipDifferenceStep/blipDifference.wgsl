@group(0) @binding(0) var texture_a: texture_2d<f32>;
@group(0) @binding(1) var texture_b: texture_2d<f32>;

@fragment
fn main(
  @builtin(position) coord_f32 : vec4<f32>
) -> @location(0) vec4<f32> {
  var coord = vec2u(floor(coord_f32.xy));

  let color_a = textureLoad(
    texture_a,
    coord,
    0
  );

  let color_b = textureLoad(
    texture_b,
    coord,
    0
  );

  return vec4f(abs(color_a.rgb - color_b.rgb), 1.0);
}
