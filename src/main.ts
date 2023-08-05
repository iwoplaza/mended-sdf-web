import './style.css';

import { GBuffer } from './gBuffer';
// import { GBufferStep } from './gBufferStep';
import { GBufferDebugger } from './gBufferDebugger';
import { GBufferMeshRenderer } from './gBufferMeshRenderer';
import { MenderStep } from './menderStep';
import { FPSCounter } from './fpsCounter';

new FPSCounter(document.getElementById('fps-counter')!);

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
  // const gBufferStep = new GBufferStep(device, gBuffer);
  const gBufferMeshRenderer = new GBufferMeshRenderer(device, gBuffer);
  const menderStep = new MenderStep(device, presentationFormat, gBuffer);
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

  function frame() {
    const commandEncoder = device.createCommandEncoder();

    // gBufferStep.perform(commandEncoder);
    gBufferMeshRenderer.perform(device, commandEncoder);

    menderStep.perform(context, commandEncoder);
    // gBufferDebugger.perform(context, commandEncoder);

    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
