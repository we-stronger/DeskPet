// NetEase weapi encryption helpers.
//
// The /weapi/* endpoints require AES-128-CBC + RSA encryption on the
// request body. Plaintext params are double-encrypted with a random
// 16-byte secret key, which itself is RSA-encrypted into encSecKey.
//
// Algorithm reference (mirrors Binaryify/NeteaseCloudMusicApi):
//   text          = JSON.stringify(params)
//   first         = AES-128-CBC(text,        PUBLIC_KEY, IV)
//   second        = AES-128-CBC(first,       secretKey, IV)   -> base64
//   encSecKey     = RSA(hex(secretKey),      PUB_KEY, MODULUS) -> hex
//   POST body     = `params=${second}&encSecKey=${encSecKey}`
//
// All crypto is built on node:crypto so it works without external deps.

const crypto = require("node:crypto");

const IV = Buffer.from("0102030405060708", "binary");
const PUBLIC_KEY = "0CoJUm6Qyw8W8jud";
const PUB_KEY = "010001";
const MODULUS = "00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7";

function aesEncrypt(buffer, key) {
  const cipher = crypto.createCipheriv("aes-128-cbc", key, IV);
  return Buffer.concat([cipher.update(buffer), cipher.final()]);
}

function modPow(base, exponent, modulus) {
  if (modulus === 1n) return 0n;
  let result = 1n;
  base = ((base % modulus) + modulus) % modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

function rsaEncryptHex(hexString) {
  // Reverse the byte order of the secret key, then RSA-encrypt with the
  // fixed public exponent. Result is a 256-char zero-padded hex string.
  const reversed = Buffer.from(hexString, "hex").reverse();
  const m = BigInt("0x" + MODULUS);
  const e = BigInt("0x" + PUB_KEY);
  const t = BigInt("0x" + reversed.toString("hex"));
  return modPow(t, e, m).toString(16).padStart(256, "0");
}

function weapiEncrypt(params) {
  const text = JSON.stringify(params);
  const secretKey = crypto.randomBytes(16);
  const first = aesEncrypt(Buffer.from(text, "utf8"), Buffer.from(PUBLIC_KEY, "utf8"));
  const second = aesEncrypt(first, secretKey);
  return {
    params: second.toString("base64"),
    encSecKey: rsaEncryptHex(secretKey.toString("hex")),
  };
}

function buildWeapiBody(params) {
  const enc = weapiEncrypt(params);
  // URL-encoded form body, matches what the NetEase web client sends.
  return `params=${encodeURIComponent(enc.params)}&encSecKey=${encodeURIComponent(enc.encSecKey)}`;
}

module.exports = {
  aesEncrypt,
  rsaEncryptHex,
  modPow,
  weapiEncrypt,
  buildWeapiBody,
  PUBLIC_KEY,
  PUB_KEY,
  MODULUS,
  IV,
};