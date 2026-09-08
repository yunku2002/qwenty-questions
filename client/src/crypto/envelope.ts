import { bytesToBase64 } from "../../../shared/base64";

export type Envelope = {
  secret: string;
  key: string;
  nonce: string;
};

export type SharePayload = Envelope & {
  hint: string | null;
};

const RSA = { name: "RSA-OAEP", hash: "SHA-256" } as const;

let cachedRaw: string | null = null;
let publicKeyPromise: Promise<CryptoKey> | null = null;

function publicJwkRaw(): string {
  const fromVite = import.meta.env?.VITE_PUBLIC_JWK;
  if (fromVite) return fromVite;
  const fromProcess =
    typeof process !== "undefined" ? process.env.VITE_PUBLIC_JWK : undefined;
  if (fromProcess) return fromProcess;
  throw new Error("VITE_PUBLIC_JWK missing");
}

function getPublicKey(): Promise<CryptoKey> {
  const raw = publicJwkRaw();
  if (cachedRaw !== raw) {
    cachedRaw = raw;
    publicKeyPromise = null;
  }
  const jwk: unknown = JSON.parse(raw);
  if (
    !jwk ||
    typeof jwk !== "object" ||
    (jwk as JsonWebKey).kty !== "RSA" ||
    typeof (jwk as JsonWebKey).n !== "string"
  ) {
    throw new Error("VITE_PUBLIC_JWK invalid");
  }
  publicKeyPromise ??= crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    RSA,
    false,
    ["encrypt"],
  );
  return publicKeyPromise;
}

export async function encryptSecret(plaintext: string): Promise<Envelope> {
  const publicKey = await getPublicKey();
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

export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.secret === "string" &&
    o.secret.length > 0 &&
    typeof o.key === "string" &&
    o.key.length > 0 &&
    typeof o.nonce === "string" &&
    o.nonce.length > 0
  );
}

export function isSharePayload(value: unknown): value is SharePayload {
  if (!isEnvelope(value)) return false;
  const hint = (value as SharePayload).hint;
  return hint === null || typeof hint === "string";
}
