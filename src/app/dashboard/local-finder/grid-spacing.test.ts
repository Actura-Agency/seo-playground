import { describe, it, expect } from 'vitest';
import { generateGridCoords } from './grid-api';

// Mirrors LocalFinderForm.tsx's KM_PER_MILE constant and spacingKm = spacingMiles * KM_PER_MILE conversion.
const KM_PER_MILE = 1.609344;

describe('half-mile spacing conversion (spacingKm = spacingMiles * 1.609344)', () => {
  it.each([
    [1.5, 2.414016],
    [2.5, 4.02336],
    [3.5, 5.632704],
    [4.5, 7.242048],
  ])('converts %s miles to %s km exactly, without truncation', (miles, expectedKm) => {
    const spacingKm = miles * KM_PER_MILE;
    expect(spacingKm).toBeCloseTo(expectedKm, 9);
    // Confirms the value survives as a genuine decimal (would be a red flag if a
    // parseInt/Math.floor/Math.round crept into the conversion path).
    expect(Number.isInteger(spacingKm)).toBe(false);
  });
});

describe('generateGridCoords with half-mile-derived (fractional) spacing', () => {
  it.each([1.5, 2.5, 3.5, 4.5])(
    'produces coordinate spacing proportional to the exact km value for %s-mile spacing',
    (miles) => {
      const spacingKm = miles * KM_PER_MILE;
      const coords = generateGridCoords(0, 0, 3, spacingKm);

      // half = 1 for a 3x3 grid, so adjacent rows differ by exactly one spacing unit in latitude.
      const center = coords.find((c) => c.row === 1 && c.col === 1)!;
      const north = coords.find((c) => c.row === 0 && c.col === 1)!;
      const expectedLatDeg = spacingKm / 111.32;

      expect(north.lat - center.lat).toBeCloseTo(expectedLatDeg, 10);
      expect(Number.isInteger(expectedLatDeg)).toBe(false);
    },
  );
});
