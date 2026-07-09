const e = require("electron");
console.log("typeof:", typeof e);
console.log("length:", e.length);
console.log("first 3:", e[0], e[1], e[2]);
console.log("app:", typeof e.app);
console.log("BrowserWindow:", typeof e.BrowserWindow);