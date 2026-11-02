import { MAX_ZOOM, MIN_ZOOM, zoomAt } from './view';

describe('zoomAt', () => {
  it('keeps the point under the pointer fixed', () => {
    const before = { x: 100, y: 50, z: 1 };
    const after = zoomAt(before, 2, 300, 250);
    // World point under (300, 250) before: ((300-100)/1, (250-50)/1) = (200, 200).
    expect(200 * after.z + after.x).toBe(300);
    expect(200 * after.z + after.y).toBe(250);
  });

  it('clamps the zoom level', () => {
    expect(zoomAt({ x: 0, y: 0, z: 1 }, 100, 0, 0).z).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, z: 1 }, 0.001, 0, 0).z).toBe(MIN_ZOOM);
  });
});
