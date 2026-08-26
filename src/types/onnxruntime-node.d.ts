/**
 * Minimal ambient types for `onnxruntime-node`.
 *
 * The package's manifest points `types` at `dist/index.d.ts`, but the published
 * tarball for 1.17.3 does not contain that file — only the compiled JS. Without
 * a declaration, every import resolves to `any` under `noImplicitAny`.
 *
 * Only the surface the ADH provider actually uses is declared, and it is
 * declared honestly: `Tensor.data` is typed as Float32Array because that is
 * what we construct and what the model returns, not because the runtime is
 * incapable of other element types.
 */
declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(type: 'float32', data: Float32Array, dims: number[]);
    readonly data: Float32Array;
    readonly dims: readonly number[];
    readonly type: string;
  }

  export interface InferenceSessionOptions {
    executionProviders?: string[];
    graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
    /**
     * ONNX Runtime's CPU arena pre-reserves a pool sized for the largest
     * intermediate tensor and does not release it. On BiRefNet that measured
     * ~5.7GB of resident memory; disabling it holds around 400MB.
     */
    enableCpuMemArena?: boolean;
    enableMemPattern?: boolean;
    intraOpNumThreads?: number;
    interOpNumThreads?: number;
    executionMode?: 'sequential' | 'parallel';
  }

  export class InferenceSession {
    static create(path: string, options?: InferenceSessionOptions): Promise<InferenceSession>;
    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
  }

  export const env: {
    versions: Record<string, string>;
  };
}
