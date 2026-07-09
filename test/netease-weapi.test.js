// Unit tests for the weapi encryption helpers. The crypto is deterministic
// for AES (key + IV + plaintext -> ciphertext) but uses a random secret key,
// so we check the structural invariants: AES round-trip with the public key
// decrypts to the original plaintext, and encSecKey is always 256 hex chars.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  aesEncrypt,
  rsaEncryptHex,
  modPow,
  weapiEncrypt,
  buildWeapiBody,
  PUBLIC_KEY,
  IV,
} = require("../src/music/netease-weapi");

function aesDecrypt(buffer, key) {
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, IV);
  return Buffer.concat([decipher.update(buffer), decipher.final()]);
}

test("aesEncrypt round-trips through aesDecrypt with the public key", () => {
  const plaintext = Buffer.from("hello world", "utf8");
  const ct = aesEncrypt(plaintext, Buffer.from(PUBLIC_KEY, "utf8"));
  const pt = aesDecrypt(ct, Buffer.from(PUBLIC_KEY, "utf8"));
  assert.equal(pt.toString("utf8"), "hello world");
  // PKCS#7 padding means ct length is a multiple of 16.
  assert.equal(ct.length % 16, 0);
});

test("aesEncrypt handles UTF-8 (Chinese, emoji)", () => {
  const plaintext = Buffer.from("网易云音乐 🎵", "utf8");
  const ct = aesEncrypt(plaintext, Buffer.from(PUBLIC_KEY, "utf8"));
  const pt = aesDecrypt(ct, Buffer.from(PUBLIC_KEY, "utf8"));
  assert.equal(pt.toString("utf8"), "网易云音乐 🎵");
});

test("rsaEncryptHex returns 256 hex chars for any 16-byte key", () => {
  const key = crypto.randomBytes(16);
  const enc = rsaEncryptHex(key.toString("hex"));
  assert.equal(enc.length, 256);
  assert.match(enc, /^[0-9a-f]+$/);
});

test("rsaEncryptHex is deterministic for the same key", () => {
  const key = "00112233445566778899aabbccddeeff";
  assert.equal(rsaEncryptHex(key), rsaEncryptHex(key));
});

test("modPow handles small exponents correctly", () => {
  // 2^10 mod 1000 = 1024 mod 1000 = 24
  assert.equal(modPow(2n, 10n, 1000n), 24n);
  // 3^5 mod 7 = 243 mod 7 = 5
  assert.equal(modPow(3n, 5n, 7n), 5n);
  // modulus 1 always returns 0
  assert.equal(modPow(7n, 99n, 1n), 0n);
});

test("weapiEncrypt produces base64 params and 256-hex-char encSecKey", () => {
  const enc = weapiEncrypt({ type: 1 });
  assert.equal(typeof enc.params, "string");
  assert.match(enc.params, /^[A-Za-z0-9+/=]+$/);
  assert.equal(enc.encSecKey.length, 256);
  assert.match(enc.encSecKey, /^[0-9a-f]+$/);
});

test("weapiEncrypt encrypts the first AES result as a base64 string", () => {
  const payload = {
    id: "99",
    tracks: '[{"type":3,"id":"1"}]',
    csrf_token: "token",
  };
  const enc = weapiEncrypt(payload, Buffer.from("0123456789abcdef", "utf8"));

  assert.equal(
    enc.params,
    "UZf/Xxjx2AWbcMyFvwQW6n0+aWeRcendmowpT6UemZnWBGnnz0drvothXXqU6cQy8JEq6bbj6ThDMqhXkq/8Al9FFnz0N6c4RO+HRCBVgaVjWoHBafM2VkQapGZKyapv3AeJvt93GX0ZXJIvfASSxw==",
  );
});

test("weapiEncrypt uses a different secret key on each call (params differ)", () => {
  const a = weapiEncrypt({ type: 1 });
  const b = weapiEncrypt({ type: 1 });
  // The plaintext is the same, but the random secret key changes both the
  // AES output and the encSecKey.
  assert.notEqual(a.encSecKey, b.encSecKey);
  // AES output differs in practice (random IV isn't used but secret key is).
  // Note: we don't strictly require params to differ — could collide — but
  // probability is 1/2^128 so in practice they always do.
  assert.notEqual(a.params, b.params);
});

test("buildWeapiBody emits a URL-encoded `params=...&encSecKey=...` string", () => {
  const body = buildWeapiBody({ key: "abc&def=", type: 1 });
  assert.match(body, /^params=[A-Za-z0-9%+/=]+&encSecKey=[0-9a-f]{256}$/);
});
