const hre = require("hardhat");
const crypto = require("crypto");
const path = require("path");
const snarkjs = require("snarkjs");

describe("Test State contract", async () => {
  let zidenjs, deployer, state, verifier;

  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await hre.ethers.getSigner();
    await zidenjs.global.setupParams();
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
      holder1Pk
    );
    holder2AuthClaim = await zidenjs.claim.authClaim.newAuthClaimFromPrivateKey(
      holder2Pk
    );
    issuerAuthClaim = await zidenjs.claim.authClaim.newAuthClaimFromPrivateKey(
      issuerPk
    );

    holder1ClaimsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder1Claims");
    holder1RevsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder1Revs");
    holder1RootsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder1Roots");

    holder2ClaimsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder2Claims");
    holder2RevsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder2Revs");
    holder2RootsDb = new zidenjs.db.SMTLevelDb("trees/test_db/holder2Roots");

    issuerClaimsDb = new zidenjs.db.SMTLevelDb("trees/test_db/issuerClaims");
    issuerRevsDb = new zidenjs.db.SMTLevelDb("trees/test_db/issuerRevs");
    issuerRootsDb = new zidenjs.db.SMTLevelDb("trees/test_db/issuerRoots");

    holder1Tree = await zidenjs.trees.Trees.generateID(
      [holder1AuthClaim],
      holder1ClaimsDb,
      holder1RevsDb,
      holder1RootsDb,
      zidenjs.claim.id.IDType.Default,
      32,
      zidenjs.trees.SMTType.BinSMT
    );

    holder2Tree = await zidenjs.trees.Trees.generateID(
      [holder2AuthClaim],
      holder2ClaimsDb,
      holder2RevsDb,
      holder2RootsDb,
      zidenjs.claim.id.IDType.Default,
      32,
      zidenjs.trees.SMTType.BinSMT
    );

    issuerTree = await zidenjs.trees.Trees.generateID(
      [issuerAuthClaim],
      issuerClaimsDb,
      issuerRevsDb,
      issuerRootsDb,
      zidenjs.claim.id.IDType.Default,
      32,
      zidenjs.trees.SMTType.BinSMT
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
        issuerPk,
        issuerAuthClaim,
        issuerTree,
        [holder1Claim],
        []
      );

    console.log(stateTransitionInput);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      stateTransitionInput,
      path.resolve("./build/state transition/stateTransition.wasm"),
      path.resolve("./build/state transition/stateTransition.zkey")
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

    await tx.wait();

    console.log(await state.getState(issuerId));
  });
});
