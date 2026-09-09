import { bytesToBase64 } from "../shared/base64.ts";
import type { SharePayload } from "../client/src/crypto/envelope.ts";
import {
  buildShareFragment,
  parseShareFragment,
  parseShareInput,
} from "../client/src/share.ts";

function fakePayload(hint: string | null): SharePayload {
  const secret = new Uint8Array(20).fill(1);
  const key = new Uint8Array(33).fill(3);
  key[0] = 0x02;
  return {
    secret: bytesToBase64(secret),
    key: bytesToBase64(key),
    nonce: bytesToBase64(new Uint8Array(12).fill(7)),
    hint,
  };
}

const payload = fakePayload("hint");
const fragment = buildShareFragment(payload);
if (/[+/=]/.test(fragment)) {
  console.error("fragment not unpadded base64url", fragment);
  process.exit(1);
}

const fromHash = parseShareFragment(`#${fragment}`);
if (fromHash.kind !== "ok") {
  console.error("hash parse failed", fromHash);
  process.exit(1);
}
if (JSON.stringify(fromHash.payload) !== JSON.stringify(payload)) {
  console.error("payload mismatch", fromHash.payload);
  process.exit(1);
}

const fromUrl = parseShareInput(`https://example.com/play#${fragment}`);
if (fromUrl.kind !== "ok" || JSON.stringify(fromUrl.payload) !== JSON.stringify(payload)) {
  console.error("url paste failed", fromUrl);
  process.exit(1);
}

if (parseShareInput("https://example.com/play").kind !== "invalid") {
  console.error("url without fragment should be invalid");
  process.exit(1);
}
if (parseShareFragment("").kind !== "empty") {
  console.error("empty hash should be empty");
  process.exit(1);
}
if (parseShareInput("").kind !== "empty") {
  console.error("blank paste should be empty");
  process.exit(1);
}
if (parseShareInput("@@@").kind !== "invalid") {
  console.error("garbage paste should be invalid");
  process.exit(1);
}

const parsedNone = parseShareFragment(`#${buildShareFragment(fakePayload(null))}`);
if (parsedNone.kind !== "ok" || parsedNone.payload.hint !== null) {
  console.error("empty remainder should be null hint", parsedNone);
  process.exit(1);
}

if (parseShareFragment("#QQ==").kind !== "invalid") {
  console.error("padded standard base64 should be invalid");
  process.exit(1);
}

console.log("share ok");
