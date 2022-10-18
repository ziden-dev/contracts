const hre = require("hardhat");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { expect } = require("chai");
const snarkjs = require("snarkjs");
const path = require("path");

describe("Test Sig Validator contract", async () => {
  let zidenjs,
    deployer,
    state,
    sigValidator,
    stateVerifier,
    querySigVerifier,
    eddsa,
    tester,
    F,
    hasher,
    hash0,
    hash1;
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

  it("Deploy contract", async () => {
    const StateVerifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    stateVerifier = await StateVerifier.deploy();
    await stateVerifier.deployed();

    const QuerySigVerifier = await hre.ethers.getContractFactory(
      "QuerySigVerifier"
    );
    querySigVerifier = await QuerySigVerifier.deploy();
    await querySigVerifier.deployed();

    const State = await hre.ethers.getContractFactory("State");
    state = await State.connect(deployer).deploy();
    await state.deployed();

    await state.connect(deployer).initialize(stateVerifier.address);

    const SigValidator = await hre.ethers.getContractFactory(
      "QuerySigValidator"
    );
    sigValidator = await SigValidator.deploy();
    await sigValidator.deployed();

    await sigValidator
      .connect(deployer)
      .initialize(querySigVerifier.address, state.address);

    const TestValidator = await hre.ethers.getContractFactory("TestValidator");
    tester = await TestValidator.deploy(deployer.address, sigValidator.address);

    await tester.deployed();
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
      8
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
      8
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
      zidenjs.claim.id.IDType.Default
    );

    holder1Id = zidenjs.utils.bitsToNum(holder1Tree.userID);
    holder2Id = zidenjs.utils.bitsToNum(holder2Tree.userID);
    issuerId = zidenjs.utils.bitsToNum(issuerTree.userID);

    console.log("Holder 1 ID : ", holder1Id);
    console.log("Holder 2 ID : ", holder2Id);
    console.log("Issuer ID : ", issuerId);
  });

  let issuerClaim;

  it("Issue claims for holder 1", async () => {
    let schemaHash = zidenjs.claim.entry.schemaHashFromBigInt(
      BigInt("123456789")
    );

    let h1IndexA, h1IndexB, h1ValueA, h1ValueB;
    // let h2IndexA, h2IndexB, h2ValueA, h2ValueB;
    h1IndexA = Buffer.alloc(32, 0);
    h1IndexA.write("Vitalik Buterin", "utf-8");

    h1IndexB = zidenjs.utils.numToBits(BigInt(19941031), 32);
    h1ValueA = zidenjs.utils.numToBits(BigInt(100), 32);
    h1ValueB = zidenjs.utils.numToBits(BigInt(120), 32);

    issuerClaim = zidenjs.claim.entry.newClaim(
      schemaHash,
      zidenjs.claim.entry.withIndexData(h1IndexA, h1IndexB),
      zidenjs.claim.entry.withValueData(h1ValueA, h1ValueB),
      zidenjs.claim.entry.withIndexID(holder1Tree.userID)
    );

    const stateTransitionInput =
      await zidenjs.witness.stateTransition.stateTransitionWitness(
        eddsa,
        issuerPk,
        issuerAuthClaim,
        issuerTree,
        [issuerClaim],
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

    await state.transitState(
      public[0],
      public[1],
      public[2],
      public[3],
      a,
      b,
      c
    );
  });

  let values, challenge, hashFunction, queryInput;
  it("Generate inputs for query with EQUAL operator", async () => {
    values = [BigInt(19931031)];
    challenge = BigInt("1390849295786071768276380950238675083608645509734");
    hashFunction = await zidenjs.global.buildFMTHashFunction(hash0, F);

    let kycQuerySigInput =
      await zidenjs.witness.querySig.kycGenerateQuerySigInput(
        eddsa,
        hasher,
        issuerPk,
        issuerAuthClaim,
        issuerClaim,
        issuerTree
      );
    let kycQuerySigNonRevInput =
      await zidenjs.witness.querySig.kycGenerateQuerySigNonRevInput(
        issuerClaim.getRevocationNonce(),
        issuerTree
      );

    queryInput = await zidenjs.witness.querySig.holderGenerateQuerySigWitness(
      issuerClaim,
      eddsa,
      holder1Pk,
      holder1AuthClaim,
      challenge,
      holder1Tree,
      kycQuerySigInput,
      kycQuerySigNonRevInput,
      3,
      3,
      values,
      10,
      0,
      100,
      hashFunction,
      F
    );
    console.log(queryInput);
  });

  it("Test validator verify function", async () => {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      queryInput,
      path.resolve("build/querySig/credentialAtomicQuerySig.wasm"),
      path.resolve("build/querySig/querySig_final.zkey")
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

    console.log(public);

    await tester.connect(deployer).verifySig(a, b, c, public);
  });
});
