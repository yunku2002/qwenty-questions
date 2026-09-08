import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encryptSecret } from "../client/src/crypto/envelope.ts";
import { decryptSecret } from "../worker/src/crypto.ts";

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

const sample = "Secret";
const envelope = await encryptSecret(sample);
const back = await decryptSecret(
  envelope,
  envValue(join(root, "worker", ".dev.vars"), "PRIVATE_JWK"),
);
if (back !== sample) {
  console.error("mismatch", { sample, back, envelope });
  process.exit(1);
}
if (atob(envelope.nonce).length !== 12) {
  console.error("nonce length", envelope.nonce);
  process.exit(1);
}
console.log("crypto ok");
