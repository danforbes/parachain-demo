# Polkadot Parachain Demo 🚀

This project is comprised of two scripts that automate the
[Substrate Developer Hub Cumulus Tutorial](https://docs.substrate.io/tutorials/v3/cumulus/start-relay/).

## Requirements and Installation 🤓

The scripts in project depend on Node v16.1.0 or greater. Once Node is installed, install the other dependencies with
`npm i`.

### Preparation ✅

Before executing the scripts in this repository, it's necessary to place `polkadot` v0.9.13 and `parachain-collator`
v0.9.13 executables in the project root. The maintainers of Polkadot provide a `polkadot` executable for Linux-based
systems - here is
[the link for the v0.9.13 release](https://github.com/paritytech/polkadot/releases/download/v0.9.13/polkadot). If
necessary, the tutorial provides
[instructions for building Polkadot from source](https://docs.substrate.io/tutorials/v3/cumulus/start-relay/#building-the-relay-chain-node).
Here are
[the instructions for building the parachain collator from source](https://docs.substrate.io/tutorials/v3/cumulus/start-relay/#building-the-parachain-template),
which is necessary in all cases since executable files are not made available for the
[Substrate Parachain Template](https://github.com/substrate-developer-hub/substrate-parachain-template/). Here are
[instructions for setting up a Substrate build environment](https://github.com/substrate-developer-hub/substrate-node-template/blob/main/docs/rust-setup.md) -
in particular, it's necessary to have
[up-to-date Rust toolchains](https://github.com/substrate-developer-hub/substrate-node-template/blob/main/docs/rust-setup.md#rust-developer-environment)
before trying to build Polkadot or the parachain template.

## Demo & Scripts 🎥

This repository contains two scripts: [`start-validators`](start-validators.mjs) and
[`start-collator`](start-collator.mjs). To perform the demo, open a terminal and start Alice & Bob
[validators](https://docs.substrate.io/v3/getting-started/glossary/#validator) for a
[Polkadot-like relay chain](https://wiki.polkadot.network/docs/learn-architecture) by executing
`node ./start-validators.mjs`; next, open another terminal and start an Alice "collator" for a simple
[Substrate](https://substrate.io/)- and [Cumulus](https://github.com/paritytech/cumulus)-based
[parachain](https://wiki.polkadot.network/docs/glossary#parachain) by executing `node ./start-collator.mjs`. The term
"collator" refers to a parachain block-authoring node. Here is an overview of the actions performed by the scripts:

### `start-validators` 👯

This script starts an Alice validator with the following command:

```sh
./polkadot \
  --alice \
  --validator \
  --tmp \
  --chain relay-spec-raw.json \
  --port 30333 \
  --ws-port 9944
```

Alice's output is monitored, and when her local node identity is available, a Bob validator is started with this
command:

```sh
./polkadot \
  --bob \
  --validator \
  --tmp \
  --chain relay-spec-raw.json \
  --bootnodes /ip4/127.0.0.1/tcp/30333/p2p/${alice} \
  --port 30334 \
  --ws-port 9945
```

To learn more about executables that are built with Substrate (e.g. `polkadot`) and the configuration parameters they
accept, review the help documentation that is included with `polkadot`:

```sh
./polkadot --help
```

The logs for the Alice & Bob validators will be sent to the `alice.log` and `bob.log` files, respectively. Leave the
`start-validators` script running. Here is a sample of its expected output:

```
 >>> Alice & Bob validators started 👯
 >>> Finalized relay block #1 (0xeda5…d012) ✨
 >>> Finalized relay block #2 (0x0a91…7c85) ✨
 >>> Finalized relay block #3 (0x21bf…6c8f) ✨
```

### `start-collator` 💃

The first thing this script does is use [the `polkadot{.js}` API](https://polkadot.js.org/docs/api) to connect to the
Alice validator and reserve a para ID. Next, the `parachain-collator` executable is used to generate a number of
dependencies: a [chain specification](https://docs.substrate.io/v3/runtime/chain-specs/) that is updated to included the
reserved para ID, a snapshot of the chain's
[genesis state](https://docs.substrate.io/v3/getting-started/glossary/#genesis-configuration), and a
[Wasm blob](https://docs.substrate.io/v3/getting-started/glossary/#webassembly-wasm) that defines the
[runtime](https://docs.substrate.io/v3/concepts/runtime/) that parachain collators will execute. Next, a collator is
started with the following command:

```sh
./parachain-collator \
  --alice \
  --collator \
  --force-authoring \
  --chain parachain-collator-spec-raw.json \
  --tmp \
  --ws-port 40333 \
  -- \
  --execution wasm \
  --chain relay-spec-raw.json \
  --port 30343 \
  --ws-port 9977
```

Notice the "dangling" `--` characters in the above command - this signals the beginning of the parameters for the
collator's internal validator process, which is used to process relay chain blocks. The `start-collator` script waits
for the collator to import relay chain blocks before proceeding. Review the `collator.log` file and notice that,
although the collator is processing relay chain blocks, it is not authoring parachain blocks.

After the collator has started importing relay chain blocks, the script will use the `polkadot{.js}` API to register the
previously reserved para ID along with the genesis state and Wasm blob that were generated by the `parachain-collator`
executable, which will initiate the [_parathread_](https://wiki.polkadot.network/docs/learn-parathreads) onboarding
process - this process will take over a minute (i.e. one
[relay chain epoch](https://wiki.polkadot.network/docs/glossary#epoch)). The next step is for the script to use the
`polkadot{.js}` API to reserve a _parachain_ lease. The Polkadot Wiki describes
[the difference between parathreads and parachains](https://wiki.polkadot.network/docs/build-build-with-polkadot#parachains--parathreads),
but for the purposes of this demonstration it is sufficient to understand that parathreads have a lower economic
overhead when compared to parachains, as well as reduced guarantees with respect to availability. To observe this
difference in availability in action, review the `collator.log` file during the onboarding processes and notice that
even after the parathread has been onboarded, the collator is still not authoring blocks. After another epoch has passed
and the _parachain_ onboarding process has completed, the collator will begin authoring blocks.

The output of this script should look something like this:

```
 >>> Connecting to relay chain 💤
 >>> Reserved para ID 2000 🔏
 >>> Alice collator started 💃
 >>> Waiting for collator to import relay chain blocks 💤
 >>> Registered para ID 2000 📝
 >>> Waiting for parathread onboarding 💤💤💤
 >>> Leased slot for para ID 2000 ✅
 >>> Waiting for collator to execute as parachain 💤💤💤
 >>> Collator executing as parachain 🚀
 >>> Finalized parachain block #1 (0x1e24…25ed) ✨
 >>> Finalized parachain block #2 (0xc2bb…a2fa) ✨
 >>> Finalized parachain block #3 (0x4932…7c9e) ✨
```
