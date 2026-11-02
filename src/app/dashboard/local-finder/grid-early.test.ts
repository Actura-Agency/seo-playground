import { describe, it, expect } from 'vitest';
import { canShowEarly } from './grid-early';

describe('canShowEarly', () => {
  it('shows an 11×11 scan with up to 2 points missing', () => {
    expect(canShowEarly(120, 121)).toBe(true);
    expect(canShowEarly(119, 121)).toBe(true);
    expect(canShowEarly(118, 121)).toBe(false);
  });

  it('shows a 13×13 scan from 98% (166 of 169)', () => {
    expect(canShowEarly(166, 169)).toBe(true);
    expect(canShowEarly(165, 169)).toBe(false);
  });

  it('shows small grids once only one point is left', () => {
    expect(canShowEarly(48, 49)).toBe(true);
    expect(canShowEarly(47, 49)).toBe(false);
    expect(canShowEarly(8, 9)).toBe(true);
    expect(canShowEarly(7, 9)).toBe(false);
  });

  it('is false for a finished scan or one with nothing in', () => {
    expect(canShowEarly(121, 121)).toBe(false);
    expect(canShowEarly(0, 1)).toBe(false);
    expect(canShowEarly(0, 0)).toBe(false);
  });
});
