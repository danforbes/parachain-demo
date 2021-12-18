import { createWriteStream } from "fs";
import { spawn } from "child_process";

// start Alice's node and pipe output to alice.log file
const alice = spawn("./polkadot", [
  "--alice",
  "--validator",
  "--tmp",
  "--chain",
  "relay-spec-raw.json",
  "--port",
  "30333",
  "--ws-port",
  "9944",
]);

// when Alice logs her node ID, start Bob's node & use Alice as a bootnode
let finalized = 0;
alice.stderr.setEncoding("utf-8");
const aliceStream = createWriteStream("alice.log");
alice.stderr.on("data", (chunk) => {
  aliceStream.write(chunk);

  // log finalized blocks
  const finalizedMatch = /finalized #([1-9]\d*) \((0x\S+)\),/.exec(chunk);
  if (finalizedMatch) {
    const thisFinalized = parseInt(finalizedMatch[1]);
    if (finalized < thisFinalized) {
      finalized = thisFinalized;
      console.log(` >>> Finalized relay block #${thisFinalized} (${finalizedMatch[2]}) ✨`);
    }
  }

  // could also use system.localPeerId RPC call https://polkadot.js.org/docs/substrate/rpc#localpeerid-text
  const match = /Local node identity is: (\w+)/.exec(chunk);
  if (!match) {
    return;
  }

  // start Bob's node and pipe output to bob.log file
  const bob = spawn("./polkadot", [
    "--bob",
    "--validator",
    "--tmp",
    "--chain",
    "relay-spec-raw.json",
    "--bootnodes",
    "/ip4/127.0.0.1/tcp/30333/p2p/" + match[1],
    "--port",
    "30334",
    "--ws-port",
    "9945",
  ]);

  bob.stderr.pipe(createWriteStream("bob.log"));

  console.log(" >>> Alice & Bob validators started 👯");
});
