const hre = require("hardhat");
const crypto = require("crypto");
const { expect } = require("chai");
const path = require("path");
const snarkjs = require("snarkjs");
const { ethers } = require("hardhat");

describe("Test MTP Validator contract", async () => {
  let zidenjs,
    deployer,
    state,
    validator,
    stateVerifier,
    queryMTPVerifier,
    testContract;
  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await hre.ethers.getSigner();
    await zidenjs.global.setupParams();
    console.log("Deployer's address : ", deployer.address);
  });

  it("Deploy contracts", async () => {
    const StateVerifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    stateVerifier = await StateVerifier.connect(deployer).deploy();
    await stateVerifier.deployed();

    const QueryMTPVerifier = await hre.ethers.getContractFactory(
      "QueryMTPVerifier"
    );
    queryMTPVerifier = await QueryMTPVerifier.deploy();
    await queryMTPVerifier.deployed();

    const State = await hre.ethers.getContractFactory("State");
    state = await State.connect(deployer).deploy();
    await state.deployed();

    await state.connect(deployer).initialize(stateVerifier.address);

    const MTPValidator = await hre.ethers.getContractFactory(
      "QueryMTPValidator"
    );
    validator = await MTPValidator.deploy();
    await validator.deployed();

    await validator
      .connect(deployer)
      .initialize(queryMTPVerifier.address, state.address);

    const TestValidator = await hre.ethers.getContractFactory("TestValidator");
    testContract = await TestValidator.deploy(
      validator.address,
      validator.address
    );
    await testContract.deployed();
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

  let values, challenge, queryInput;
  it("Generate inputs for query for NOT-IN operator", async () => {
    values = [
      BigInt(19931031),
      BigInt(19951031),
      BigInt(19961031),
      BigInt(19971031),
    ];
    challenge = BigInt("1390849295786071768276380950238675083608645509734");

    let kycQueryInput = await zidenjs.witness.queryMTP.kycGenerateQueryMTPInput(
      issuerClaim.hiRaw(),
      issuerTree
    );
    let kycQueryNonRevInput =
      await zidenjs.witness.queryMTP.kycGenerateNonRevQueryMTPInput(
        issuerClaim.getRevocationNonce(),
        issuerTree
      );

    queryInput = await zidenjs.witness.queryMTP.holderGenerateQueryMTPWitness(
      issuerClaim,
      holder1Pk,
      holder1AuthClaim,
      challenge,
      holder1Tree,
      kycQueryInput,
      kycQueryNonRevInput,
      3,
      5,
      values,
      10,
      0,
      100,
      Date.now()
    );
    console.log(queryInput);
  });

  let fromTimestamp, toTimestamp;
  it("Get block timestamp", async () => {
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;
    fromTimestamp = timestamp + 1000;
    toTimestamp = timestamp + 100000000;
  });
  it("Test validator verify function", async () => {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      queryInput,
      path.resolve("./build/queryMTP/credentialAtomicQueryMTP.wasm"),
      path.resolve("./build/queryMTP/queryMTP_final.zkey")
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
    // console.log(await validator.verify(a, b, c, public));
    const valid = await testContract.verifyMTP(a, b, c, public);
    expect(valid).to.be.true;

    const validInDuration = await testContract.verifyMTPInDuration(
      a,
      b,
      c,
      public,
      fromTimestamp,
      toTimestamp
    );
    expect(validInDuration).to.be.true;

    await expect(
      testContract.verifyMTPInDuration(a, b, c, public, 0, toTimestamp)
    ).to.be.revertedWith("MTP Validator: fromTimestamp < createAtTimestamp");
  });
});
