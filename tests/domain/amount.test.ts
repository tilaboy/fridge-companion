import { describe, expect, it } from 'vitest';
import { isValidAmount, parseAmount } from '../../src/domain/amount';

describe('parseAmount', () => {
  it('reads whole numbers, with surrounding space', () => {
    expect(parseAmount('3')).toBe(3);
    expect(parseAmount(' 4 ')).toBe(4);
    expect(parseAmount(7)).toBe(7);
    expect(parseAmount('1e3')).toBe(1000);
  });

  it('returns null for anything that is not a number', () => {
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('two')).toBeNull();
    expect(parseAmount('Infinity')).toBeNull();
  });

  it('does not round: decimals survive parsing and are stopped later', () => {
    expect(parseAmount('2.5')).toBe(2.5);
    expect(isValidAmount(parseAmount('2.5'))).toBe(false);
  });
});

describe('isValidAmount', () => {
  it('accepts positive whole numbers only', () => {
    expect(isValidAmount(1)).toBe(true);
    expect(isValidAmount(12)).toBe(true);
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(1.5)).toBe(false);
    expect(isValidAmount(NaN)).toBe(false);
    expect(isValidAmount(Infinity)).toBe(false);
  });

  it('does not coerce strings', () => {
    expect(isValidAmount('3')).toBe(false);
    expect(isValidAmount(null)).toBe(false);
  });
});
