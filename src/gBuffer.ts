export class GBuffer {
  blurredTexture: GPUTexture;
  auxTexture: GPUTexture;

  blurredView: GPUTextureView;
  auxView: GPUTextureView;

  targets = [
    // blurred
    { format: 'rgba8unorm' },
    // depth & normal.xy & luminance
    { format: 'rgba16float' },
  ] as const;

  constructor(device: GPUDevice, private _size: [number, number]) {
    this.blurredTexture = device.createTexture({
      size: _size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba8unorm',
    });

    this.auxTexture = device.createTexture({
      size: _size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba16float',
    });

    this.blurredView = this.blurredTexture.createView();
    this.auxView = this.auxTexture.createView();
  }

  get size() {
    return this._size;
  }

  updateSize(size: [number, number]) {
    // TODO: Recreate textures.
    this._size = size;
  }
}
