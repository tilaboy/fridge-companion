import { describe, expect, it } from 'vitest';
import { isValidAmount, parseAmount, roundAmount } from '../../src/domain/amount';

describe('parseAmount', () => {
  it('reads whole and decimal numbers, with surrounding space', () => {
    expect(parseAmount('3')).toBe(3);
    expect(parseAmount(' 4 ')).toBe(4);
    expect(parseAmount(7)).toBe(7);
    expect(parseAmount('0.5')).toBe(0.5);
    expect(parseAmount('.5')).toBe(0.5);
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount('1e3')).toBe(1000);
  });

  it('reads fractions, mixed numbers, and unicode fractions', () => {
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('3 / 4')).toBe(0.75);
    expect(parseAmount('1 1/2')).toBe(1.5);
    expect(parseAmount('2 1/3')).toBeCloseTo(2.333);
    expect(parseAmount('½')).toBe(0.5);
    expect(parseAmount('1½')).toBe(1.5);
    expect(parseAmount('2¼')).toBe(2.25);
  });

  it('refuses division by zero and nonsense', () => {
    expect(parseAmount('1/0')).toBeNull();
    expect(parseAmount('1 1/0')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('two')).toBeNull();
    expect(parseAmount('Infinity')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it('rounds to thousandths so totals stay clean', () => {
    expect(parseAmount('1/3')).toBe(0.333);
    expect(parseAmount('2/3')).toBe(0.667);
    expect(roundAmount(0.1 + 0.2)).toBe(0.3);
  });
});

describe('isValidAmount', () => {
  it('accepts positive decimals and fractions', () => {
    expect(isValidAmount(1)).toBe(true);
    expect(isValidAmount(0.5)).toBe(true);
    expect(isValidAmount(2.333)).toBe(true);
    expect(isValidAmount(0.001)).toBe(true);
  });

  it('refuses zero, negatives, and non-numbers', () => {
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(0.0001)).toBe(false);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(-0.5)).toBe(false);
    expect(isValidAmount(NaN)).toBe(false);
    expect(isValidAmount(Infinity)).toBe(false);
    expect(isValidAmount('3')).toBe(false);
    expect(isValidAmount(null)).toBe(false);
  });
});
