/**
 * heic-decode ships no type declarations. Only the single-image default export
 * is used here; `decode.all()` for multi-image HEIC sequences is not needed.
 */
declare module 'heic-decode' {
  interface DecodeInput {
    buffer: Uint8Array | ArrayBuffer;
  }
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  function decode(input: DecodeInput): Promise<DecodedImage>;
  export default decode;
}
