declare module "@paddlejs-models/ocr" {
  export type PaddleOcrPoint = [number, number];

  export type PaddleOcrRecognizeResult = {
    points?: PaddleOcrPoint[][];
    text?: string | string[];
  };

  export function init(): Promise<void>;

  export function recognize(
    image: HTMLImageElement,
    option?: {
      canvas?: HTMLCanvasElement;
      style?: {
        fillStyle?: string;
        lineWidth?: number;
        strokeStyle?: string;
      };
    },
  ): Promise<PaddleOcrRecognizeResult>;
}

declare module "@paddlejs-models/ocr/lib/index.js?url" {
  const url: string;

  export default url;
}
