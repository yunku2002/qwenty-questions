function copyBytes(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
}

async function transform(
  bytes: Uint8Array,
  stream: TransformStream<BufferSource, Uint8Array>,
): Promise<Uint8Array> {
  const input = new Blob([copyBytes(bytes).buffer as ArrayBuffer]).stream();
  return new Uint8Array(
    await new Response(input.pipeThrough(stream)).arrayBuffer(),
  );
}

async function zlibRaw(kind: "deflate" | "inflate", bytes: Uint8Array): Promise<Uint8Array> {
  const spec = "node:zlib";
  const zlib = (await import(spec)) as {
    deflateRawSync: (data: Uint8Array) => Uint8Array;
    inflateRawSync: (data: Uint8Array) => Uint8Array;
  };
  return kind === "deflate" ? zlib.deflateRawSync(bytes) : zlib.inflateRawSync(bytes);
}

export async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== "undefined") {
    return transform(bytes, new CompressionStream("deflate-raw"));
  }
  return zlibRaw("deflate", bytes);
}

export async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    return transform(bytes, new DecompressionStream("deflate-raw"));
  }
  return zlibRaw("inflate", bytes);
}
