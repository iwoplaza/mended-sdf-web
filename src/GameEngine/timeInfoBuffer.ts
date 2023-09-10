export const TimeInfoBuffer = (device: GPUDevice, bufferUsage: number) => {
  const buffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT,
    usage: bufferUsage | GPUBufferUsage.COPY_DST,
  });

  const cpuBuffer = new Float32Array(1);

  return {
    buffer,
    update() {
      cpuBuffer[0] = Date.now() % 7507;

      device.queue.writeBuffer(
        buffer,
        0,
        cpuBuffer.buffer,
        cpuBuffer.byteOffset,
        cpuBuffer.byteLength,
      );
    },
  };
};
