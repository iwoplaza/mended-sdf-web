/**
 * @param value
 * @param modulo has to be power of 2
 */
export const roundUp = (value: number, modulo: number) => {
  const bitMask = modulo - 1;
  const invBitMask = ~bitMask;
  return (value & bitMask) === 0 ? value : (value & invBitMask) + modulo;
};

/**
 * @param value
 */
export const roundUpToPowerOfTwo = (value: number) => {
  if (value === 0) {
    return 0;
  }

  return 1 << Math.ceil(Math.log2(value));
};
