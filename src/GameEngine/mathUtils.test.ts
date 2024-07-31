import { describe, it, expect } from 'vitest';
import { roundUpToPowerOfTwo } from './mathUtils';

describe('roundUpToPowerOfTwo', () => {
  it('leaves powers of two alone', () => {
    expect(roundUpToPowerOfTwo(0)).toBe(0);
    expect(roundUpToPowerOfTwo(1)).toBe(1);
    expect(roundUpToPowerOfTwo(2)).toBe(2);
    expect(roundUpToPowerOfTwo(4)).toBe(4);
    expect(roundUpToPowerOfTwo(8)).toBe(8);
    expect(roundUpToPowerOfTwo(16)).toBe(16);
    expect(roundUpToPowerOfTwo(32)).toBe(32);
    expect(roundUpToPowerOfTwo(64)).toBe(64);
  });

  it('properly rounds up values near the next power of 2', () => {
    expect(roundUpToPowerOfTwo(3)).toBe(4);
    expect(roundUpToPowerOfTwo(7)).toBe(8);
    expect(roundUpToPowerOfTwo(15)).toBe(16);
    expect(roundUpToPowerOfTwo(31)).toBe(32);
    expect(roundUpToPowerOfTwo(63)).toBe(64);
  });

  it('properly rounds up values far from the next power of 2', () => {
    expect(roundUpToPowerOfTwo(5)).toBe(8);
    expect(roundUpToPowerOfTwo(9)).toBe(16);
    expect(roundUpToPowerOfTwo(17)).toBe(32);
    expect(roundUpToPowerOfTwo(33)).toBe(64);
  });
});
