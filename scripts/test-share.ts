import { utf8ToBase64 } from "../shared/base64.ts";
import type { SharePayload } from "../client/src/crypto/envelope.ts";
import {
  buildShareFragment,
  parseShareFragment,
  parseShareInput,
} from "../client/src/share.ts";

const payload: SharePayload = {
  secret: "YQ==",
  key: "Yg==",
  nonce: utf8ToBase64("n".repeat(12)),
  hint: "hint",
};

const fragment = buildShareFragment(payload);
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

const missingHint = parseShareFragment(
  `#${utf8ToBase64(JSON.stringify({ secret: "a", key: "b", nonce: "c" }))}`,
);
if (missingHint.kind !== "invalid") {
  console.error("envelope without hint should be invalid", missingHint);
  process.exit(1);
}

console.log("share ok");
