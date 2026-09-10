import { bytesToBase64 } from "../shared/base64.ts";
import type { SharePayload, ShareTurn } from "../client/src/share.ts";
import {
  buildShareFragment,
  parseShareFragment,
  parseShareInput,
  sessionFromTurns,
  turnsFromMessages,
} from "../client/src/share.ts";

function fakePayload(hint: string | null, turns: ShareTurn[] = []): SharePayload {
  const secret = new Uint8Array(20).fill(1);
  const key = new Uint8Array(33).fill(3);
  key[0] = 0x02;
  return {
    secret: bytesToBase64(secret),
    key: bytesToBase64(key),
    nonce: bytesToBase64(new Uint8Array(12).fill(7)),
    hint,
    turns,
  };
}

function samePayload(a: SharePayload, b: SharePayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function roundtrip(payload: SharePayload): Promise<SharePayload> {
  const fragment = await buildShareFragment(payload);
  if (/[+/=]/.test(fragment)) {
    throw new Error(`fragment not unpadded base64url ${fragment}`);
  }
  const parsed = await parseShareFragment(`#${fragment}`);
  if (parsed.kind !== "ok") throw new Error(`hash parse failed ${JSON.stringify(parsed)}`);
  return parsed.payload;
}

const payload = fakePayload("hint");
const restored = await roundtrip(payload);
if (!samePayload(restored, payload)) {
  console.error("payload mismatch", restored);
  process.exit(1);
}

const fromUrl = await parseShareInput(
  `https://example.com/play#${await buildShareFragment(payload)}`,
);
if (fromUrl.kind !== "ok" || !samePayload(fromUrl.payload, payload)) {
  console.error("url paste failed", fromUrl);
  process.exit(1);
}

if ((await parseShareInput("https://example.com/play")).kind !== "invalid") {
  console.error("url without fragment should be invalid");
  process.exit(1);
}
if ((await parseShareFragment("")).kind !== "empty") {
  console.error("empty hash should be empty");
  process.exit(1);
}
if ((await parseShareInput("")).kind !== "empty") {
  console.error("blank paste should be empty");
  process.exit(1);
}
if ((await parseShareInput("@@@")).kind !== "invalid") {
  console.error("garbage paste should be invalid");
  process.exit(1);
}

const parsedNone = await roundtrip(fakePayload(null));
if (parsedNone.hint !== null || parsedNone.turns.length !== 0) {
  console.error("empty remainder should be null hint", parsedNone);
  process.exit(1);
}

if ((await parseShareFragment("#QQ==")).kind !== "invalid") {
  console.error("padded standard base64 should be invalid");
  process.exit(1);
}

const turns: ShareTurn[] = [
  { question: "a", code: "YES" },
  { question: "한", code: "MAYBE" },
  { question: "b", code: "INVALID" },
  { question: "c", code: "GUESS_CORRECT" },
];
const noneFrag = await buildShareFragment(fakePayload("hint"));
const progressFrag = await buildShareFragment(fakePayload("hint", turns));
if (progressFrag.length <= noneFrag.length) {
  console.error("progress fragment should be longer", noneFrag, progressFrag);
  process.exit(1);
}
const withProgress = await roundtrip(fakePayload("hint", turns));
if (!samePayload(withProgress, fakePayload("hint", turns))) {
  console.error("progress mismatch", withProgress);
  process.exit(1);
}

const noHintProgress = await roundtrip(fakePayload(null, turns));
if (noHintProgress.hint !== null || !samePayload(noHintProgress, fakePayload(null, turns))) {
  console.error("no-hint progress mismatch", noHintProgress);
  process.exit(1);
}

const fromMessages = turnsFromMessages([
  { role: "user", text: "Q1" },
  { role: "bot", text: "fail", code: "FAILURE" },
  { role: "user", text: "Q2" },
  { role: "bot", text: "yes", code: "YES" },
  { role: "user", text: "pending" },
]);
if (JSON.stringify(fromMessages) !== JSON.stringify([{ question: "Q2", code: "YES" }])) {
  console.error("turnsFromMessages", fromMessages);
  process.exit(1);
}

const session = sessionFromTurns(turns);
if (session.asked !== 3 || session.over !== "GUESS_CORRECT") {
  console.error("sessionFromTurns", session);
  process.exit(1);
}
if (session.messages.some((m) => m.role === "bot" && m.text !== "")) {
  console.error("restored bot should have no message");
  process.exit(1);
}

console.log("share ok");
