import './style.css';

import { GBuffer } from './gBuffer';
// import { GBufferStep } from './gBufferStep';
import { GBufferDebugger } from './gBufferDebugger';
import { GBufferMeshRenderer } from './gBufferMeshRenderer';
import { MenderStep } from './menderStep';
import { FPSCounter } from './fpsCounter';
import { PostProcessingStep } from './postProcessingStep';
import { EdgeDetectionStep } from './edgeDetectionStep';
import { ResampleStep } from './resampleStep/resampleStep';

new FPSCounter(document.getElementById('fps-counter')!);

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    throw new Error(`Null GPU adapter`);
  }

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxComputeWorkgroupStorageSize: 32768,
    },
  });

  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const gBuffer = new GBuffer(device, [canvas.width, canvas.height]);

  //
  // Mender result buffer
  //

  const menderResultBuffer = device.createBuffer({
    label: 'Mender Result Buffer',
    size:
      gBuffer.size[0] * gBuffer.size[1] * 3 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  //

  const gBufferMeshRenderer = new GBufferMeshRenderer(device, gBuffer);

  const upscaleStep = ResampleStep({
    device,
    context,
    targetFormat: 'rgba8unorm',
    sourceTexture: gBuffer.quarterView,
    targetTexture: gBuffer.upscaledView,
  });

  const edgeDetectionStep = EdgeDetectionStep({
    device,
    gBuffer,
    menderResultBuffer,
  });
  // const menderStep = MenderStep({ device, gBuffer, menderResultBuffer });

  const gBufferDebugger = new GBufferDebugger(
    device,
    presentationFormat,
    gBuffer,
  );
  const postProcessing = PostProcessingStep({
    device,
    context,
    gBuffer,
    presentationFormat,
    menderResultBuffer,
  });

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();

    gBufferMeshRenderer.perform(device, commandEncoder);

    upscaleStep.perform(commandEncoder);

    // edgeDetectionStep.perform(commandEncoder);
    // menderStep.perform(commandEncoder);

    // postProcessing.perform(commandEncoder);
    gBufferDebugger.perform(context, commandEncoder);

    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
