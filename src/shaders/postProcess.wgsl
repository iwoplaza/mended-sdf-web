struct Uniforms {
  canvasSize: vec2u,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var blurredTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> mendedBuffer: array<f32>;

const RGB_TO_YCBCR = mat3x3f(
   0.299,     0.587,     0.114,
  -0.168736, -0.331264,  0.5,
   0.5,      -0.418688, -0.081312,
);

const YCBCR_TO_RGB = mat3x3f(
  1.0,  0,         1.402,
  1.0, -0.344136, -0.714136,
  1.0,  1.772,     0,
);

@fragment
fn main(
  @builtin(position) coord_f32 : vec4<f32>
) -> @location(0) vec4<f32> {
  var coord = vec2u(floor(coord_f32.xy));

  let blurred = textureLoad(
    blurredTexture,
    coord,
    0
  );

  let blurred_ycbcr = blurred.rgb * RGB_TO_YCBCR;

  let buffer_idx = coord.y * uniforms.canvasSize.x + coord.x;
  let mended_lumi = mendedBuffer[buffer_idx];

  let combined_ycbcr = vec3f(
    blurred_ycbcr.r + mended_lumi, // Y
    blurred_ycbcr.g, // Cb
    blurred_ycbcr.b, // Cr
  );

  let combined = combined_ycbcr * YCBCR_TO_RGB;

  return vec4f(combined, 1.0);
}
