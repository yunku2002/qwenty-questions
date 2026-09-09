import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encryptSecret } from "../client/src/crypto/envelope.ts";
import { decryptSecret, encryptSecret as workerEncrypt } from "../worker/src/crypto.ts";

if (!globalThis.crypto?.subtle) {
  globalThis.crypto = webcrypto as Crypto;
}

function envValue(file: string, name: string): string {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.startsWith(`${name}=`)) continue;
    return line.slice(name.length + 1);
  }
  throw new Error(`${name} missing from ${file}`);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.VITE_PUBLIC_JWK = envValue(
  join(root, "client", ".env"),
  "VITE_PUBLIC_JWK",
);
const privateJwk = envValue(join(root, "worker", ".dev.vars"), "PRIVATE_JWK");

const sample = "Secret";
const envelope = await encryptSecret(sample);
const back = await decryptSecret(envelope, privateJwk);
if (back !== sample) {
  console.error("mismatch", { sample, back, envelope });
  process.exit(1);
}

const key = atob(envelope.key);
if (key.length !== 33 || (key.charCodeAt(0) !== 2 && key.charCodeAt(0) !== 3)) {
  console.error("key", envelope.key);
  process.exit(1);
}
if (atob(envelope.nonce).length !== 12) {
  console.error("nonce length", envelope.nonce);
  process.exit(1);
}

const generated = await workerEncrypt(sample, privateJwk);
if ((await decryptSecret(generated, privateJwk)) !== sample) {
  console.error("worker roundtrip failed", generated);
  process.exit(1);
}

console.log("crypto ok");
