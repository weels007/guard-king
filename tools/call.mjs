// Generic GuardKing writer: proper JSON args (the CLI mangles quotes).
// Usage:
//   $env:KSPW="keystore-password"
//   node tools/call.mjs <method> '<json-array-of-args>' [valueGen]
// Contract address defaults to the deployed GuardKing unlessADDR env is set.
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const G = "D:/Genlayer-project/weels/pact-ledger/frontend/node_modules/";
const gljs = await import("file:///" + G + "genlayer-js/dist/index.js");
const chains = await import("file:///" + G + "genlayer-js/dist/chains/index.js");
const { ethers } = require(G + "ethers");
const fs = require("fs");

const CONTRACT = process.env.ADDR || "0x643c882F99f3e048B7d87927f74843b71a6e5b1B";
let [method, argsJson, valueGen] = process.argv.slice(2);
if (!method || !argsJson) {
  console.error("usage: node tools/call.mjs <method> '<json-array>' [valueGen]");
  console.error("   or: node tools/call.mjs <method> @args.json [valueGen]");
  process.exit(1);
}
if (argsJson.startsWith("@")) {
  argsJson = fs.readFileSync(argsJson.slice(1), "utf8");
}
// Revive {__bigint: "..."} markers as BigInt (JSON has no bigint).
const args = JSON.parse(argsJson, (k, v) =>
  v && typeof v === "object" && typeof v.__bigint === "string" ? BigInt(v.__bigint) : v
);
const wallet = await ethers.Wallet.fromEncryptedJson(
  fs.readFileSync("D:/Genlayer-project/weels/wallet/pactledger-keystore.json", "utf8"),
  process.env.KSPW
);
const account = gljs.createAccount(wallet.privateKey);
const client = gljs.createClient({ chain: chains.studionet, account });
const call = { address: CONTRACT, functionName: method, args };
if (valueGen) call.value = BigInt(Math.round(Number(valueGen) * 1e18));
const tx = await client.writeContract(call);
console.log("TX=" + tx);
const receipt = await client.waitForTransactionReceipt({ hash: tx, status: "FINALIZED", retries: 80 });
const s = JSON.stringify(receipt, (k, v) => (typeof v === "bigint" ? v.toString() : v));
console.log("STATUS=" + (receipt.status_name || receipt.status));
console.log("SUCCESS_COUNT=" + (s.match(/SUCCESS/g) || []).length);
const m = /\[EXPECTED\][^"\\]*/.exec(s);
if (m) console.log("EXPECTED=" + m[0]);
