import { spawn } from "child_process";
import { createWriteStream } from "fs";
import { exit } from "process";

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";

console.log(" >>> Connecting to relay chain 💤");

// connect to relay chain API
const wsProvider = new WsProvider("ws://127.0.0.1:9944");
const api = await ApiPromise.create({ provider: wsProvider });

// set-up signing key
const keyring = new Keyring({ type: "sr25519", ss58Format: 0 });
const alice = keyring.createFromUri("//Alice");

// ref: https://polkadot.js.org/docs/api/cookbook/tx#how-do-i-take-the-pending-tx-pool-into-account-in-my-nonce
let nonce = await api.rpc.system.accountNextIndex(alice.publicKey);

// helper lambda for extracting para ID from chain events
const getNumberFromEvent = (event) => event.data[0].toNumber();

// reserve para ID
const paraId = await sendTx(api.tx.registrar.reserve(), "registrar.Reserved", getNumberFromEvent);
console.log(` >>> Reserved para ID ${paraId} 🔏`);

// export parachain spec and update para ID
const buildSpec = spawn("./parachain-collator", ["build-spec", "--disable-default-bootnode"]);
buildSpec.stdout.setEncoding("utf-8");
const specStream = createWriteStream("parachain-collator-spec.json");
buildSpec.stdout.on("data", (chunk) => {
  const match = /"para.+": (\d+)/g.exec(chunk);
  if (!match) {
    specStream.write(chunk);
  } else {
    specStream.write(chunk.replace(match[0], match[0].replace(match[1], paraId)));
  }
});

// compile parachain spec
buildSpec.stdout.on("end", () => {
  const buildRawSpec = spawn("./parachain-collator", [
    "build-spec",
    "--disable-default-bootnode",
    "--raw",
    "--chain",
    "parachain-collator-spec.json",
  ]);

  buildRawSpec.stdout.pipe(createWriteStream("parachain-collator-spec-raw.json"));
  buildRawSpec.stdout.on("end", () => {
    // export parachain state
    const exportGenesis = spawn("./parachain-collator", [
      "export-genesis-state",
      "--chain",
      "parachain-collator-spec-raw.json",
    ]);

    let genesis = "";
    exportGenesis.stdout.setEncoding("utf-8");
    exportGenesis.stdout.on("data", (chunk) => (genesis += chunk));

    // export parachain Wasm blob
    const exportWasm = spawn("./parachain-collator", [
      "export-genesis-wasm",
      "--chain",
      "parachain-collator-spec-raw.json",
    ]);

    let wasm = "";
    exportWasm.stdout.setEncoding("utf-8");
    exportWasm.stdout.on("data", (chunk) => (wasm += chunk));

    // start collator
    const startCollator = spawn("./parachain-collator", [
      "--alice",
      "--collator",
      "--force-authoring",
      "--chain",
      "parachain-collator-spec-raw.json",
      "--tmp",
      "--ws-port",
      "40333",
      "--",
      "--execution",
      "wasm",
      "--chain",
      "relay-spec-raw.json",
      "--port",
      "30343",
      "--ws-port",
      "9977",
    ]);

    console.log(" >>> Alice collator started 💃");

    // wait for collator to import relay block before registering para ID
    let registered = false;
    let finalized = 0;
    console.log(" >>> Waiting for collator to import relay chain blocks 💤");
    const collatorStream = createWriteStream("collator.log");
    startCollator.stderr.setEncoding("utf-8");
    startCollator.stderr.on("data", async (chunk) => {
      collatorStream.write(chunk);

      // log finalized blocks
      const finalizedMatch = /\[Parachain\] .+ finalized #([1-9]\d*) \((0x\S+)\),/.exec(chunk);
      if (finalizedMatch) {
        const thisFinalized = parseInt(finalizedMatch[1]);
        if (thisFinalized <= finalized) {
          return;
        }

        finalized = thisFinalized;
        console.log(` >>> Finalized parachain block #${thisFinalized} (${finalizedMatch[2]}) ✨`);
        return;
      }

      if (registered) {
        return;
      }

      const importMatch = /Imported #\d+ \(0x\S+\)/.exec(chunk);
      if (!importMatch) {
        return;
      }

      // register para ID
      registered = true;
      const registerCall = api.tx.registrar.register(paraId, genesis, wasm);
      const registeredId = await sendTx(registerCall, "registrar.Registered", getNumberFromEvent);
      console.log(` >>> Registered para ID ${registeredId} 📝`);

      // wait for parathread to finish onboarding before leasing para slot
      let leased = false;
      console.log(" >>> Waiting for parathread onboarding 💤💤💤");

      // ref: https://polkadot.js.org/docs/api/examples/promise/listen-to-balance-change
      const unsub = await api.query.paras.paraLifecycles(registeredId, async (data) => {
        // ref: https://github.com/paritytech/polkadot/blob/v0.9.13/runtime/parachains/src/paras.rs#L89
        if ("Parachain" === `${data}`) {
          console.log(` >>> Collator executing as parachain 🚀`);
          unsub();
          return;
        }

        if (leased || "Parathread" !== `${data}`) {
          return;
        }

        // lease para slot
        leased = true;
        const leaseCall = api.tx.slots.forceLease(paraId, alice.address, 100, 0, 65536);
        const sudoCall = api.tx.sudo.sudoUncheckedWeight(leaseCall, 0);
        const leasedId = await sendTx(sudoCall, "slots.Leased", getNumberFromEvent);

        console.log(` >>> Leased slot for para ID ${leasedId} ✅`);
        console.log(" >>> Waiting for collator to execute as parachain 💤💤💤");
      });
    });
  });
});

// ref: https://polkadot.js.org/docs/api/cookbook/tx#how-do-i-get-the-decoded-enum-for-an-extrinsicfailed-event
function sendTx(call, targetEvent, extract) {
  try {
    return new Promise((resolve, reject) => {
      call.signAndSend(alice, { nonce: nonce++ }, ({ status, events, dispatchError }) => {
        if (dispatchError) {
          let msg;
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { docs, name, section } = decoded;

            msg = `${section}.${name}: ${docs.join(" ")}`;
          } else {
            msg = dispatchError.toString();
          }

          return reject(`Transaction for ${targetEvent} failed (${msg})`);
        }

        // this demonstration script does not wait for finalized blocks
        if (!status.isInBlock) {
          return;
        }

        const target = events.find(({ event }) => `${event.section}.${event.method}` === targetEvent);
        if (!target) {
          return reject(`${targetEvent} event not found`);
        }

        return resolve(extract(target.event));
      });
    });
  } catch (e) {
    console.error(`${e}`);
    exit(1);
  }
}
