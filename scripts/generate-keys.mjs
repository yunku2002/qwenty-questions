import { webcrypto } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function upsertEnv(file, entries, defaults = {}) {
  const vars = new Map();
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      vars.set(line.slice(0, eq), line.slice(eq + 1));
    }
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!vars.has(key)) vars.set(key, value);
  }
  for (const [key, value] of Object.entries(entries)) vars.set(key, value);
  writeFileSync(
    file,
    [...vars.entries()].map(([key, value]) => `${key}=${value}`).join("\n") +
      "\n",
  );
}

const pair = await crypto.subtle.generateKey(
  {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["encrypt", "decrypt"],
);

const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

delete publicJwk.d;
delete publicJwk.p;
delete publicJwk.q;
delete publicJwk.dp;
delete publicJwk.dq;
delete publicJwk.qi;
publicJwk.key_ops = ["encrypt"];
privateJwk.key_ops = ["decrypt"];

const publicJson = JSON.stringify(publicJwk);
upsertEnv(
  join(root, "worker", ".dev.vars"),
  { PRIVATE_JWK: JSON.stringify(privateJwk) },
  { LOG_LLM: "true" },
);
upsertEnv(
  join(root, "client", ".env"),
  { VITE_PUBLIC_JWK: publicJson },
  { VITE_API_URL: "http://localhost:8787" },
);
upsertEnv(join(root, "client", ".env.production"), {
  VITE_PUBLIC_JWK: publicJson,
});

console.log("Wrote VITE_PUBLIC_JWK and PRIVATE_JWK into local env files");
console.log("Production worker: wrangler secret put PRIVATE_JWK");
