import { ECDH, encryptWithPublic, type Envelope } from "../../../shared/ec-envelope";

export type { Envelope };

export type SharePayload = Envelope & {
  hint: string | null;
};

let cachedRaw: string | null = null;
let publicKeyPromise: Promise<CryptoKey> | null = null;

function publicJwkRaw(): string {
  const fromVite = import.meta.env?.VITE_PUBLIC_JWK;
  if (fromVite) return fromVite;
  const fromProcess = (globalThis as { process?: { env?: Record<string, string> } })
    .process?.env?.VITE_PUBLIC_JWK;
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
    (jwk as JsonWebKey).kty !== "EC" ||
    (jwk as JsonWebKey).crv !== "P-256" ||
    typeof (jwk as JsonWebKey).x !== "string" ||
    typeof (jwk as JsonWebKey).y !== "string"
  ) {
    throw new Error("VITE_PUBLIC_JWK invalid");
  }
  publicKeyPromise ??= crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    ECDH,
    false,
    [],
  );
  return publicKeyPromise;
}

export async function encryptSecret(plaintext: string): Promise<Envelope> {
  return encryptWithPublic(plaintext, await getPublicKey());
}
