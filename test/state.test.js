const hre = require("hardhat");
const crypto = require("crypto");
const { execSync } = require("child_process");
const fs = require("fs");
const { expect } = require("chai");
const path = require("path");
const snarkjs = require("snarkjs");

describe("Test State contract", async () => {
  let zidenjs, deployer, state, verifier, eddsa, F, hasher, hash0, hash1;
  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await hre.ethers.getSigner();
    eddsa = await zidenjs.global.buildSigner();
    F = await zidenjs.global.buildSnarkField();
    hasher = await zidenjs.global.buildHasher();
    let hs = await zidenjs.global.buildHash0Hash1(hasher, F);
    hash0 = hs.hash0;
    hash1 = hs.hash1;
    console.log("Deployer's address : ", deployer.address);
  });

  it("Deploy contracts", async () => {
    const Verifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    verifier = await Verifier.connect(deployer).deploy();
    await verifier.deployed();

    const State = await hre.ethers.getContractFactory("State");
    state = await State.connect(deployer).deploy();
    await state.deployed();

    await state.connect(deployer).initialize(verifier.address);
  });

  let holder1Pk, holder2Pk, issuerPk;
  let holder1AuthClaim, holder2AuthClaim, issuerAuthClaim;
  let holder1ClaimsDb, holder1RevsDb, holder1RootsDb, holder1Tree;
  let holder2ClaimsDb, holder2RevsDb, holder2RootsDb, holder2Tree;
  let issuerClaimsDb, issuerRevsDb, issuerRootsDb, issuerTree;
  let holder1Id, holder2Id, issuerId;
  it("Generate 2 holders and 1 issuer", async () => {
    holder1Pk = crypto.randomBytes(32);
    holder2Pk = crypto.randomBytes(32);
    issuerPk = crypto.randomBytes(32);

    holder1AuthClaim = await zidenjs.claim.authClaim.newAuthClaimFromPrivateKey(
      eddsa,
      F,
      holder1Pk
    );
    holder2AuthClaim = await zidenjs.claim.authClaim.newAuthClaimFromPrivateKey(
      eddsa,
      F,
      holder2Pk
    );
    issuerAuthClaim = await zidenjs.claim.authClaim.newAuthClaimFromPrivateKey(
      eddsa,
      F,
      issuerPk
    );

    holder1ClaimsDb = new zidenjs.db.SMTLevelDb(
      "trees/test_db/holder1Claims",
      F
    );
    holder1RevsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder1Revs", F);
    holder1RootsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder1Roots", F);

    holder2ClaimsDb = new zidenjs.db.SMTLevelDb(
      "trees/test_db/holder2Claims",
      F
    );
    holder2RevsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder2Revs", F);
    holder2RootsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder2Roots", F);

    issuerClaimsDb = new zidenjs.db.SMTLevelDb("trees/test_db/issuerClaims", F);
    issuerRevsDb = new zidenjs.db.SMTLevelDb("trees/test_db/issuerRevs", F);
    issuerRootsDb = new zidenjs.db.SMTLevelDb("trees/test_db/issuerRoots", F);

    holder1Tree = await zidenjs.trees.Trees.generateID(
      F,
      hash0,
      hash1,
      hasher,
      [holder1AuthClaim],
      holder1ClaimsDb,
      holder1RevsDb,
      holder1RootsDb,
      zidenjs.claim.id.IDType.Default,
      32,
      0
    );

    holder2Tree = await zidenjs.trees.Trees.generateID(
      F,
      hash0,
      hash1,
      hasher,
      [holder2AuthClaim],
      holder2ClaimsDb,
      holder2RevsDb,
      holder2RootsDb,
      zidenjs.claim.id.IDType.Default,
      32,
      0
    );

    issuerTree = await zidenjs.trees.Trees.generateID(
      F,
      hash0,
      hash1,
      hasher,
      [issuerAuthClaim],
      issuerClaimsDb,
      issuerRevsDb,
      issuerRootsDb,
      zidenjs.claim.id.IDType.Default,
      32,
      0
    );

    holder1Id = zidenjs.utils.bitsToNum(holder1Tree.userID);
    holder2Id = zidenjs.utils.bitsToNum(holder2Tree.userID);
    issuerId = zidenjs.utils.bitsToNum(issuerTree.userID);

    console.log("Holder 1 ID : ", holder1Id);
    console.log("Holder 2 ID : ", holder2Id);
    console.log("Issuer ID : ", issuerId);
  });

  let holder1Claim, holder2Claim;

  it("Issue claims for holder 1", async () => {
    let schemaHash = zidenjs.claim.entry.schemaHashFromBigInt(
      BigInt("123456789")
    );

    let h1IndexA, h1IndexB, h1ValueA, h1ValueB;
    let h2IndexA, h2IndexB, h2ValueA, h2ValueB;
    h1IndexA = Buffer.alloc(32, 0);
    h1IndexA.write("Vitalik Buterin", "utf-8");
    h1IndexB = Buffer.alloc(32, 0);
    h1IndexB.writeBigInt64LE(BigInt(19940131));
    h1ValueA = Buffer.alloc(32, 0);
    h1ValueA.writeBigInt64LE(BigInt(100));
    h1ValueB = Buffer.alloc(32, 0);
    h1ValueB.writeBigInt64LE(BigInt(120));

    h2IndexA = Buffer.alloc(32, 0);
    h2IndexA.write("Changpeng Zhao", "utf-8");
    h2IndexB = Buffer.alloc(32, 0);
    h2IndexB.writeBigInt64LE(BigInt(19771009));
    h2ValueA = Buffer.alloc(32, 0);
    h2ValueA.writeBigInt64LE(BigInt(101));
    h2ValueB = Buffer.alloc(32, 0);
    h2ValueB.writeBigInt64LE(BigInt(111));

    holder1Claim = zidenjs.claim.entry.newClaim(
      schemaHash,
      zidenjs.claim.entry.withIndexData(h1IndexA, h1IndexB),
      zidenjs.claim.entry.withValueData(h1ValueA, h1ValueB)
    );

    holder2Claim = zidenjs.claim.entry.newClaim(
      schemaHash,
      zidenjs.claim.entry.withIndexData(h2IndexA, h2IndexB),
      zidenjs.claim.entry.withValueData(h2ValueA, h2ValueB)
    );

    const stateTransitionInput =
      await zidenjs.witness.stateTransition.stateTransitionWitness(
        eddsa,
        issuerPk,
        issuerAuthClaim,
        issuerTree,
        [holder1Claim],
        [],
        hasher
      );
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      stateTransitionInput,
      path.resolve("./build/stateTransition/stateTransition.wasm"),
      path.resolve("./build/stateTransition/state_final.zkey")
    );
    const callData = (
      await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)
    )
      .toString()
      .split(",")
      .map((e) => {
        return e.replaceAll(/([\[\]\s\"])/g, "");
      });
    let a,
      b = [],
      c,
      public;
    a = callData.slice(0, 2).map((e) => BigInt(e));
    b[0] = callData.slice(2, 4).map((e) => BigInt(e));
    b[1] = callData.slice(4, 6).map((e) => BigInt(e));
    c = callData.slice(6, 8).map((e) => BigInt(e));
    public = callData.slice(8, callData.length).map((e) => BigInt(e));

    const tx = await state.transitState(
      public[0],
      public[1],
      public[2],
      public[3],
      a,
      b,
      c
    );

    console.log(await state.getState(issuerId));
  });
});
