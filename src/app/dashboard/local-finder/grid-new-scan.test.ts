import { describe, it, expect } from 'vitest';
import { parseNewScanSettings } from './grid-schedule';

const valid: Record<string, string> = {
  keyword: ' plumber ',
  grid_target: 'Joes Plumbing',
  location_coordinate: '47.6062, -122.3321',
  grid_size: '11',
  spacing_km: '1.609344',
  language: 'English',
};
const parse = (overrides: Record<string, string | undefined> = {}) => {
  const p = { ...valid, ...overrides };
  return parseNewScanSettings((k) => p[k]);
};

describe('parseNewScanSettings', () => {
  it('accepts the fields the Geo-Grid form submits, trimmed and normalized', () => {
    expect(parse()).toEqual({
      keyword: 'plumber',
      target: 'Joes Plumbing',
      center: '47.606200,-122.332100',
      gridSize: 11,
      spacingKm: 1.609344,
      language: 'English',
    });
  });

  it('rejects a missing keyword, business or map center', () => {
    expect(parse({ keyword: '  ' })).toBeNull();
    expect(parse({ grid_target: undefined })).toBeNull();
    expect(parse({ location_coordinate: '' })).toBeNull();
  });

  it('rejects malformed or out-of-range coordinates', () => {
    expect(parse({ location_coordinate: 'Seattle' })).toBeNull();
    expect(parse({ location_coordinate: '95,10' })).toBeNull();
    expect(parse({ location_coordinate: '10,190' })).toBeNull();
  });

  it('only allows the grid sizes and spacings the form offers', () => {
    expect(parse({ grid_size: '4' })).toBeNull();
    expect(parse({ grid_size: '15' })).toBeNull();
    expect(parse({ spacing_km: '0.1' })).toBeNull();
    expect(parse({ spacing_km: '50' })).toBeNull();
    expect(parse({ grid_size: '3', spacing_km: String(0.25 * 1.609344) })).not.toBeNull();
    expect(parse({ grid_size: '13', spacing_km: String(5 * 1.609344) })).not.toBeNull();
  });

  it('defaults the language to English', () => {
    expect(parse({ language: undefined })?.language).toBe('English');
  });
});
