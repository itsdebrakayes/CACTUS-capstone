declare module "ngeohash" {
  export function encode(latitude: number, longitude: number, precision?: number): string;
  export function decode(hash: string): { latitude: number; longitude: number; error: { latitude: number; longitude: number } };
  export function neighbors(hash: string): {
    right: string;
    left: string;
    top: string;
    bottom: string;
    top_right: string;
    top_left: string;
    bottom_right: string;
    bottom_left: string;
  };
  export function bboxes(hash: string): number[][];
  export function bbox(hash: string): { minLat: number; minLon: number; maxLat: number; maxLon: number };
}
