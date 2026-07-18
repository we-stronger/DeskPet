const assert = require("node:assert/strict");
const test = require("node:test");

const { decodeResponseBuffer, repairMojibake } = require("../src/text-normalize");

test("repairMojibake converts common GBK-decoded UTF-8 text back to readable Chinese", () => {
  assert.equal(repairMojibake("浣犲ソ涓栫晫"), "你好世界");
  assert.equal(repairMojibake("正常文本"), "正常文本");
});

test("decodeResponseBuffer honors the response charset and returns UTF-8 text", () => {
  const iconv = require("iconv-lite");
  const buffer = iconv.encode("网易云音乐", "gb18030");
  assert.equal(decodeResponseBuffer(buffer, { "content-type": "application/json; charset=gb18030" }), "网易云音乐");
});
