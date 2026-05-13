export async function blobLooksLikeWav(blob: Blob) {
  if (blob.size < 12) {
    return false;
  }

  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());

  return (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x41 &&
    head[10] === 0x56 &&
    head[11] === 0x45
  );
}
