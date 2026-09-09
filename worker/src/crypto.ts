import {
  decryptWithPrivate,
  ECDH,
  encryptWithPublic,
  type Envelope,
} from "../../shared/ec-envelope";

export type { Envelope };

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
    (jwk as JsonWebKey).kty !== "EC" ||
    (jwk as JsonWebKey).crv !== "P-256" ||
    typeof (jwk as JsonWebKey).x !== "string" ||
    typeof (jwk as JsonWebKey).y !== "string" ||
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
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true },
    ECDH,
    false,
    [],
  );
  return publicKeyPromise;
}

function getPrivateKey(raw: string | undefined): Promise<CryptoKey> {
  const jwk = privateJwk(raw);
  privateKeyPromise ??= crypto.subtle.importKey("jwk", jwk, ECDH, false, [
    "deriveBits",
  ]);
  return privateKeyPromise;
}

export async function encryptSecret(
  plaintext: string,
  privateJwkJson: string | undefined,
): Promise<Envelope> {
  return encryptWithPublic(plaintext, await getPublicKey(privateJwkJson));
}

export async function decryptSecret(
  envelope: Envelope,
  privateJwkJson: string | undefined,
): Promise<string> {
  return decryptWithPrivate(envelope, await getPrivateKey(privateJwkJson));
}
