const hre = require("hardhat");
const crypto = require("crypto");
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
    tester;
  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await hre.ethers.getSigner();
    await zidenjs.global.setupParams();
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
        issuerPk,
        issuerAuthClaim,
        issuerTree,
        [issuerClaim],
        []
      );

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
  });

  let values, challenge, hashFunction, queryInput;
  it("Generate inputs for query with EQUAL operator", async () => {
    values = [BigInt(19931031)];
    challenge = BigInt("1390849295786071768276380950238675083608645509734");

    let kycQuerySigInput =
      await zidenjs.witness.querySig.kycGenerateQuerySigInput(
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
      Date.now()
    );
    console.log(queryInput);
  });

  it("Test validator verify function", async () => {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      queryInput,
      path.resolve("build/querySig/credentialAtomicQuerySig.wasm"),
      path.resolve("build/querySig/credentialAtomicQuerySig.zkey")
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
