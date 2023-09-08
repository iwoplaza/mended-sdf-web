export const WhiteNoiseBuffer = (
  device: GPUDevice,
  elements: number,
  bufferUsage: number,
) => {
  const buffer = device.createBuffer({
    size: elements * Float32Array.BYTES_PER_ELEMENT,
    usage: bufferUsage,
    mappedAtCreation: true,
  });

  {
    const mapping = new Float32Array(buffer.getMappedRange());
    for (let i = 0; i < elements; ++i) {
      mapping[i] = Math.random();
    }

    buffer.unmap();
  }

  return buffer;
};
