import { BufferWriter } from 'typed-binary';
import { GBuffer } from './gBuffer';
import { SceneSchema } from './schema/scene';
import fullScreenQuadWGSL from './shaders/fullScreenQuad.wgsl?raw';
import postProcessWGSL from './shaders/postProcess.wgsl?raw';

type Options = {
  device: GPUDevice;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  gBuffer: GBuffer,
  menderResultBuffer: GPUBuffer,
};

export const PostProcessingStep = (({
  device,
  context,
  presentationFormat,
  gBuffer,
  menderResultBuffer,
}: Options) => {
  //
  // SCENE
  //

  const scene = {
    canvasSize: [gBuffer.size[0], gBuffer.size[1]] as [number, number],
  };

  const sceneUniformBuffer = device.createBuffer({
    size: 2 * 4 /* vec2<i32> */,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Eagerly filling the buffer
  const sceneUniformData = new ArrayBuffer(SceneSchema.sizeOf(scene));
  const bufferWriter = new BufferWriter(sceneUniformData);
  SceneSchema.write(bufferWriter, scene);

  device.queue.writeBuffer(
    sceneUniformBuffer,
    0,
    sceneUniformData,
    0,
    sceneUniformData.byteLength,
  );
  
  //

  const fullScreenQuadShader = device.createShaderModule({
    label: 'Full Screen Quad Shader',
    code: fullScreenQuadWGSL,
  });

  const postProcessShader = device.createShaderModule({
    label: 'Post Process Shader',
    code: postProcessWGSL,
  });

  const pipeline = device.createRenderPipeline({
    label: 'Post Processing Pipeline',
    layout: 'auto',
    vertex: {
      module: fullScreenQuadShader,
      entryPoint: 'main',
    },
    fragment: {
      module: postProcessShader,
      entryPoint: 'main',
      targets: [
        { format: presentationFormat },
      ],
    },
  });

  const passColorAttachment: GPURenderPassColorAttachment = {
    // view is acquired and set in render loop.
    view: undefined as unknown as GPUTextureView,

    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  };

  const passDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [passColorAttachment],
  };

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: sceneUniformBuffer },
      },
      {
        binding: 1,
        resource: gBuffer.blurredView,
      },
      {
        binding: 2,
        resource: {
          buffer: menderResultBuffer,
        },
      },
    ],
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      // Updating color attachment
      const textureView = context.getCurrentTexture().createView();
      passColorAttachment.view = textureView;

      const pass = commandEncoder.beginRenderPass(passDescriptor);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
    }
  };
});