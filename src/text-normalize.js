const iconv = require("iconv-lite");

const MOJIBAKE_MARKERS = /[锟斤拷浣犲ソ涓栫晫缃戞槗鎾斁鍠滄]/g;

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] || "") : "";
}

function charsetFromHeaders(headers) {
  const contentType = headerValue(headers, "content-type");
  const match = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  return match ? match[1].toLowerCase() : "utf8";
}

function decodeResponseBuffer(buffer, headers = {}) {
  const charset = charsetFromHeaders(headers);
  if (charset === "gbk" || charset === "gb2312" || charset === "gb18030") {
    return iconv.decode(Buffer.from(buffer), "gb18030");
  }
  return Buffer.from(buffer).toString("utf8");
}

function mojibakeScore(text) {
  return (String(text).match(MOJIBAKE_MARKERS) || []).length;
}

function repairMojibake(value) {
  if (typeof value !== "string" || !value || mojibakeScore(value) === 0) return value;
  const repaired = iconv.decode(iconv.encode(value, "gb18030"), "utf8");
  return mojibakeScore(repaired) < mojibakeScore(value) ? repaired : value;
}

module.exports = {
  charsetFromHeaders,
  decodeResponseBuffer,
  repairMojibake,
};
