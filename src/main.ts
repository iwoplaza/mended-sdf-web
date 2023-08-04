import './style.css';

import { GBuffer } from './gBuffer';
import { GBufferStep } from './gBufferStep';
import { GBufferDebugger } from './gBufferDebugger';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    throw new Error(`Null GPU adapter`);
  }

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const gBuffer = new GBuffer(device, [canvas.width, canvas.height]);
  const gBufferStep = new GBufferStep(device, gBuffer);
  const gBufferDebugger = new GBufferDebugger(
    device,
    presentationFormat,
    gBuffer,
  );

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  // Create a sampler with linear filtering for smooth interpolation.
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // const uniformBindGroup = device.createBindGroup({
  //   layout: pipeline.getBindGroupLayout(0),
  //   entries: [
  //     {
  //       binding: 0,
  //       resource: {
  //         buffer: uniformBuffer,
  //       },
  //     },
  //     {
  //       binding: 1,
  //       resource: sampler,
  //     },
  //     {
  //       binding: 2,
  //       resource: cubeTexture.createView(),
  //     },
  //   ],
  // });

  function frame() {
    const commandEncoder = device.createCommandEncoder();

    gBufferStep.perform(commandEncoder);
    gBufferDebugger.perform(context, commandEncoder);

    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
