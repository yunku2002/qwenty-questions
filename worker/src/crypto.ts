import { base64ToBytes, bytesToBase64 } from "../../shared/base64";

export type Envelope = {
  secret: string;
  key: string;
  nonce: string;
};

const RSA = { name: "RSA-OAEP", hash: "SHA-256" } as const;

let cachedRaw: string | null = null;
let publicKeyPromise: Promise<CryptoKey> | null = null;
let privateKeyPromise: Promise<CryptoKey> | null = null;

function privateJwk(raw: string | undefined): JsonWebKey {
  if (!raw) throw new Error("PRIVATE_JWK missing");
  if (cachedRaw !== raw) {
    cachedRaw = raw;
    publicKeyPromise = null;
    privateKeyPromise = null;
  }
  const jwk: unknown = JSON.parse(raw);
  if (
    !jwk ||
    typeof jwk !== "object" ||
    (jwk as JsonWebKey).kty !== "RSA" ||
    typeof (jwk as JsonWebKey).n !== "string" ||
    typeof (jwk as JsonWebKey).d !== "string"
  ) {
    throw new Error("PRIVATE_JWK invalid");
  }
  return jwk as JsonWebKey;
}

function getPublicKey(raw: string | undefined): Promise<CryptoKey> {
  const jwk = privateJwk(raw);
  publicKeyPromise ??= crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg,
      ext: true,
      key_ops: ["encrypt"],
    },
    RSA,
    false,
    ["encrypt"],
  );
  return publicKeyPromise;
}

function getPrivateKey(raw: string | undefined): Promise<CryptoKey> {
  const jwk = privateJwk(raw);
  privateKeyPromise ??= crypto.subtle.importKey("jwk", jwk, RSA, false, [
    "decrypt",
  ]);
  return privateKeyPromise;
}

export async function encryptSecret(
  plaintext: string,
  privateJwkJson: string | undefined,
): Promise<Envelope> {
  const publicKey = await getPublicKey(privateJwkJson);
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  const rawAes = await crypto.subtle.exportKey("raw", aesKey);
  const wrapped = await crypto.subtle.encrypt(RSA, publicKey, rawAes);
  return {
    secret: bytesToBase64(new Uint8Array(ciphertext)),
    key: bytesToBase64(new Uint8Array(wrapped)),
    nonce: bytesToBase64(nonce),
  };
}

export async function decryptSecret(
  envelope: Envelope,
  privateJwkJson: string | undefined,
): Promise<string> {
  const key = await getPrivateKey(privateJwkJson);
  const rawAes = await crypto.subtle.decrypt(
    RSA,
    key,
    base64ToBytes(envelope.key),
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.nonce) },
    aesKey,
    base64ToBytes(envelope.secret),
  );
  return new TextDecoder().decode(plaintext);
}
