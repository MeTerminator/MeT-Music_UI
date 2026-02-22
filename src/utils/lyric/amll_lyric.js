import { __wbg_set_wasm } from "./amll_lyric_bg.js";

let wasmModule = null;
let wasmReady = false;

let wasmReadyPromise = (async () => {
  wasmModule = await import("./amll_lyric_bg.wasm");
  __wbg_set_wasm(wasmModule);
  wasmModule.__wbindgen_start();
  console.log("WebAssembly module loaded and initialized");
  wasmReady = true;
})();

export const waitForWasmReady = () => wasmReadyPromise;

export * from "./amll_lyric_bg.js";
