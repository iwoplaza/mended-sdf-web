import menderWGSL from './shaders/mender.wgsl?raw';

export class MenderStep {
  private _menderPassDescriptor: GPURenderPassDescriptor;
  private _menderPassColorAttachment: GPURenderPassColorAttachment;
  private _pipeline: GPURenderPipeline;

  constructor(device: GPUDevice, presentationFormat: GPUTextureFormat) {
    this._menderPassColorAttachment = {
      // view is acquired and set in render loop.
      view: undefined as unknown as GPUTextureView,

      clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    };

    this._menderPassDescriptor = {
      colorAttachments: [this._menderPassColorAttachment],
    };

    const menderShaderModule = device.createShaderModule({
      code: menderWGSL,
    });

    this._pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: menderShaderModule,
        entryPoint: 'main_vert',
      },
      fragment: {
        module: menderShaderModule,
        entryPoint: 'main_frag',
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }

  getMenderPassDescriptor(context: GPUCanvasContext) {
    const textureView = context.getCurrentTexture().createView();
    this._menderPassColorAttachment.view = textureView;

    return this._menderPassDescriptor;
  }

  perform(ctx: GPUCanvasContext, commandEncoder: GPUCommandEncoder) {
    const menderPass = commandEncoder.beginRenderPass(
      this.getMenderPassDescriptor(ctx),
    );
    menderPass.setPipeline(this._pipeline);
    menderPass.draw(6, 1);
    menderPass.end();
  }
}
