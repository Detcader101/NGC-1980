// Type stub for the vendored html2canvas 1.4.1 bundle (keeps tsc from checking the vendor file itself).
// Only what game/js/xr/panel.js uses. See tsconfig.json / tools/check.mjs types.
export interface Html2CanvasOptions {
  backgroundColor?: string | null;
  scale?: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  logging?: boolean;
  useCORS?: boolean;
  ignoreElements?: (element: Element) => boolean;
  onclone?: (doc: Document, element: HTMLElement) => void;
  [option: string]: unknown;
}
declare function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
export default html2canvas;
