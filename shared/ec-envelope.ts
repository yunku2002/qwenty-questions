import { base64ToBytes, bytesToBase64 } from "./base64";

export type Envelope = {
  secret: string;
  key: string;
  nonce: string;
};

export const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const HKDF_INFO = new TextEncoder().encode("qwenty-aes-256-gcm");
/** NIST P-256 field prime p. Curve is y² = x³ − 3x + b (mod p). */
const P256_P =
  0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
/** NIST P-256 coefficient b. */
const P256_B =
  0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function bigIntToBytes(n: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = len - 1; i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  if (n !== 0n) throw new Error("integer too large");
  return out;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

function compressP256(raw: Uint8Array): Uint8Array {
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error("uncompressed P-256 expected");
  const out = new Uint8Array(33);
  out[0] = raw[64] & 1 ? 0x03 : 0x02;
  out.set(raw.subarray(1, 33), 1);
  return out;
}

function decompressP256(compressed: Uint8Array): Uint8Array {
  if (compressed.length !== 33) throw new Error("compressed P-256 expected");
  const prefix = compressed[0];
  if (prefix !== 0x02 && prefix !== 0x03) throw new Error("compressed P-256 expected");
  const x = bytesToBigInt(compressed.subarray(1));
  if (x >= P256_P) throw new Error("invalid P-256 point");
  const y2 = (x * x * x + (P256_P - 3n) * x + P256_B) % P256_P;
  let y = modPow(y2, (P256_P + 1n) / 4n, P256_P);
  if ((y * y) % P256_P !== y2) throw new Error("invalid P-256 point");
  if ((y & 1n) !== (prefix === 0x03 ? 1n : 0n)) y = P256_P - y;
  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  raw.set(bigIntToBytes(x, 32), 1);
  raw.set(bigIntToBytes(y, 32), 33);
  return raw;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importRawPublic(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(raw), ECDH, false, []);
}

async function deriveAesKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  usages: ["encrypt"] | ["decrypt"],
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey } as never,
    privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(new Uint8Array()),
      info: toArrayBuffer(HKDF_INFO),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function encryptWithPublic(
  plaintext: string,
  staticPublic: CryptoKey,
): Promise<Envelope> {
  const ephemeral = (await crypto.subtle.generateKey(ECDH, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const aesKey = await deriveAesKey(ephemeral.privateKey, staticPublic, [
    "encrypt",
  ]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  const rawPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", ephemeral.publicKey)) as ArrayBuffer,
  );
  return {
    secret: bytesToBase64(new Uint8Array(ciphertext)),
    key: bytesToBase64(compressP256(rawPublic)),
    nonce: bytesToBase64(nonce),
  };
}

export async function decryptWithPrivate(
  envelope: Envelope,
  staticPrivate: CryptoKey,
): Promise<string> {
  const compressed = base64ToBytes(envelope.key);
  const ephemeralPublic = await importRawPublic(decompressP256(compressed));
  const aesKey = await deriveAesKey(staticPrivate, ephemeralPublic, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(envelope.nonce)) },
    aesKey,
    toArrayBuffer(base64ToBytes(envelope.secret)),
  );
  return new TextDecoder().decode(plaintext);
}
