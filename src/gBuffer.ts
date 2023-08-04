export class GBuffer {
  blurredAndAlbedoTexture: GPUTexture;
  normalsAndDepthTexture: GPUTexture;

  blurredAndAlbedoView: GPUTextureView;
  normalsAndDepthView: GPUTextureView;

  targets = [
    // blurred & albedo
    { format: 'rgba8unorm' },
    // normal & depth
    { format: 'rgba16float' },
  ] as const;

  constructor(device: GPUDevice, private _size: [number, number]) {
    this.blurredAndAlbedoTexture = device.createTexture({
      size: _size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba8unorm',
    });

    this.normalsAndDepthTexture = device.createTexture({
      size: _size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba16float',
    });

    this.blurredAndAlbedoView = this.blurredAndAlbedoTexture.createView();
    this.normalsAndDepthView = this.normalsAndDepthTexture.createView();
  }

  get size() {
    return this._size;
  }

  updateSize(size: [number, number]) {
    // TODO: Recreate textures.
    this._size = size;
  }
}
