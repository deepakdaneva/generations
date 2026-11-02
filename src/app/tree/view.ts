/** Canvas pan and zoom: screen = world * z + (x, y). */
export interface View {
  x: number;
  y: number;
  z: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

/** Zooms by `factor` keeping the screen point (px, py) fixed under the pointer. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.z * factor));
  const k = z / view.z;
  return { x: px - (px - view.x) * k, y: py - (py - view.y) * k, z };
}
