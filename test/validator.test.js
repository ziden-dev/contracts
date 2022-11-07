const hre = require("hardhat");
const crypto = require("crypto");
const { expect } = require("chai");
const path = require("path");
const snarkjs = require("snarkjs");

describe("Full test for MTP and Sig validator", async () => {
  let zidenjs,
    deployer,
    state,
    sigValidator,
    mtpValidator,
    testContract,
    eddsa,
    F,
    hasher,
    hash0,
    hash1;
  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await ethers.getSigner();
    eddsa = await zidenjs.global.buildSigner();
    F = await zidenjs.global.buildSnarkField();
    hasher = await zidenjs.global.buildHasher();
    let hs = await zidenjs.global.buildHash0Hash1(hasher, F);
    hash0 = hs.hash0;
    hash1 = hs.hash1;
    console.log("Deployer's address : ", deployer.address);
  });

  it("Deploy contracts", async () => {
    const StateVerifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    const stateVerifier = await StateVerifier.deploy();
    await stateVerifier.deployed();
    const QueryMTPVerifier = await hre.ethers.getContractFactory(
      "QueryMTPVerifier"
    );
    const queryMTPVerifier = await QueryMTPVerifier.deploy();
    await queryMTPVerifier.deployed();

    const QuerySigVerifier = await hre.ethers.getContractFactory(
      "QuerySigVerifier"
    );
    const querySigVerifier = await QuerySigVerifier.deploy();
    await querySigVerifier.deployed();

    const State = await hre.ethers.getContractFactory("State");
    state = await State.deploy();
    await state.deployed();

    await state.connect(deployer).initialize(stateVerifier.address);

    const QueryMTPValidator = await hre.ethers.getContractFactory(
      "QueryMTPValidator"
    );
    mtpValidator = await QueryMTPValidator.deploy();
    await mtpValidator.deployed();

    await mtpValidator
      .connect(deployer)
      .initialize(queryMTPVerifier.address, state.address);

    const QuerySigValidator = await hre.ethers.getContractFactory(
      "QuerySigValidator"
    );
    sigValidator = await QuerySigValidator.deploy();
    await sigValidator.deployed();

    await sigValidator
      .connect(deployer)
      .initialize(querySigVerifier.address, state.address);

    const TestContract = await hre.ethers.getContractFactory("TestValidator");
    testContract = await TestContract.deploy(
      mtpValidator.address,
      sigValidator.address
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

    holder1Tree = await zidenjs.trees.default.generateID(
      F,
      hash0,
      hash1,
      hasher,
      [holder1AuthClaim],
      holder1ClaimsDb,
      holder1RevsDb,
      holder1RootsDb,
      zidenjs.claim.id.IDType.Default,
      0
    );

    holder2Tree = await zidenjs.trees.default.generateID(
      F,
      hash0,
      hash1,
      hasher,
      [holder2AuthClaim],
      holder2ClaimsDb,
      holder2RevsDb,
      holder2RootsDb,
      zidenjs.claim.id.IDType.Default,

      0
    );

    issuerTree = await zidenjs.trees.default.generateID(
      F,
      hash0,
      hash1,
      hasher,
      [issuerAuthClaim],
      issuerClaimsDb,
      issuerRevsDb,
      issuerRootsDb,
      zidenjs.claim.id.IDType.Default,
      0
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
    console.log(stateTransitionInput);
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      stateTransitionInput,
      path.resolve("./build/stateTransition/stateTransition.wasm"),
      path.resolve("./build/stateTransition/stateTransition.zkey")
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
      publicInp;
    a = callData.slice(0, 2).map((e) => BigInt(e));
    b[0] = callData.slice(2, 4).map((e) => BigInt(e));
    b[1] = callData.slice(4, 6).map((e) => BigInt(e));
    c = callData.slice(6, 8).map((e) => BigInt(e));
    publicInp = callData.slice(8, callData.length).map((e) => BigInt(e));

    await state.transitState(
      publicInp[0],
      publicInp[1],
      publicInp[2],
      publicInp[3],
      a,
      b,
      c
    );
  });

  let values, challenge, hashFunction, queryMTPInput, querySigInput;
  it("Generate calldata for query MTP with EQUAL operator", async () => {
    values = [BigInt(19941031)];
    challenge = BigInt("1390849295786071768276380950238675083608645509734");
    hashFunction = await zidenjs.global.buildFMTHashFunction(hash0, F);

    let kycQueryInput = await zidenjs.witness.queryMTP.kycGenerateQueryMTPInput(
      issuerClaim.hiRaw(issuerTree.hasher),
      issuerTree
    );

    let kycNonRevInput =
      await zidenjs.witness.queryMTP.kycGenerateNonRevQueryMTPInput(
        issuerClaim.getRevocationNonce(),
        issuerTree
      );

    queryMTPInput =
      await zidenjs.witness.queryMTP.holderGenerateQueryMTPWitness(
        issuerClaim,
        eddsa,
        holder1Pk,
        holder1AuthClaim,
        challenge,
        holder1Tree,
        kycQueryInput,
        kycNonRevInput,
        3,
        1,
        values,
        10,
        0,
        100,
        hashFunction,
        F
      );

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      queryMTPInput,
      path.resolve("build/queryMTP/credentialAtomicQueryMTP.wasm"),
      path.resolve("build/queryMTP/queryMTP_final.zkey")
    );
    const callData = (
      await snarkjs.groth16.exportSolidityCallData(proof, publicSignals)
    )
      .toString()
      .split(",")
      .map((e) => {
        return e.replaceAll(/([\[\]\s\"])/g, "");
      });
    console.log("Calldata for query MTP : ");
    console.log(callData);
    console.log(
      "=============================================================================="
    );
  });

  it("Generate calldata for query Sig with EQUAL operator", async () => {
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

    querySigInput =
      await zidenjs.witness.querySig.holderGenerateQuerySigWitness(
        issuerClaim,
        eddsa,
        holder1Pk,
        holder1AuthClaim,
        challenge,
        holder1Tree,
        kycQuerySigInput,
        kycQuerySigNonRevInput,
        3,
        1,
        values,
        10,
        0,
        100,
        hashFunction,
        F
      );
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      querySigInput,
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
    console.log("Calldata for query Sig : ");
    console.log(callData);
    console.log(
      "=============================================================================="
    );
  });
});
