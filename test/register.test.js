const hre = require("hardhat");
const crypto = require("crypto");
const path = require("path");
const snarkjs = require("snarkjs");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");

async function exportCalldata(proof, publicSignals) {
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
  return {
    a,
    b,
    c,
    public,
  };
}
describe("Test Register metrics contract", async () => {
  let zidenjs,
    deployer,
    state,
    validator,
    stateVerifier,
    queryMTPVerifier,
    registerContract,
    testContract,
    signers;

  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    signers = await hre.ethers.getSigners();
    deployer = signers[0];
    await zidenjs.global.setupParams();
    console.log("Deployer's address : ", deployer.address);
  });

  let fromTimestamp, toTimestamp, expirationDate;
  it("Get block timestamp", async () => {
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;
    fromTimestamp = timestamp + 100000;
    toTimestamp = timestamp + 100000000;
    expirationDate = timestamp + 100000000;
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
    const RegisterMetrics = await hre.ethers.getContractFactory(
      "RegisterMetrics"
    );
    registerContract = await RegisterMetrics.deploy(
      validator.address,
      fromTimestamp,
      toTimestamp
    );
    await registerContract.deployed();

    // let addresses = {
    //   state: state.address,
    //   stateVerifier: stateVerifier.address,
    //   queryMTPVerifier: queryMTPVerifier.address,
    //   validator: validator.address,
    //   test: testContract.address,
    //   register: registerContract.address,
    // };

    // const addresses_json = JSON.stringify(addresses);
    // fs.writeFileSync("address.json", addresses_json);
  });

  it.skip("Load Contract", async () => {
    const addresses_json = fs.readFileSync("address.json");
    const addresses = JSON.parse(addresses_json);

    const StateVerifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    stateVerifier = StateVerifier.attach(addresses.stateVerifier);

    const QueryMTPVerifier = await hre.ethers.getContractFactory(
      "QueryMTPVerifier"
    );
    queryMTPVerifier = QueryMTPVerifier.attach(addresses.queryMTPVerifier);

    const State = await hre.ethers.getContractFactory("State");
    state = State.attach(addresses.state);

    const MTPValidator = await hre.ethers.getContractFactory(
      "QueryMTPValidator"
    );
    validator = MTPValidator.attach(addresses.validator);

    const TestValidator = await hre.ethers.getContractFactory("TestValidator");
    testContract = TestValidator.attach(addresses.test);

    const RegisterMetrics = await hre.ethers.getContractFactory(
      "RegisterMetrics"
    );

    register = RegisterMetrics.attach(addresses.register);

    console.log(validator.address);
    console.log(register.address);
  });

  const holderNum = 10;
  const issuerNum = 3;
  let holderPks = new Array(holderNum);
  let holderAuthClaims = new Array(holderNum);
  let holderTrees = new Array(holderNum);
  let issuerPks = new Array(issuerNum);
  let issuerAuthClaims = new Array(issuerNum);
  let issuerTrees = new Array(issuerNum);
  let holderIds = new Array(holderNum);
  let issuerIds = new Array(issuerNum);

  it("Generate " + holderNum + " holders", async () => {
    for (let i = 0; i < holderNum; i++) {
      holderPks[i] = Buffer.alloc(32, i);

      holderAuthClaims[i] =
        await zidenjs.claim.authClaim.newAuthClaimFromPrivateKey(holderPks[i]);

      const holderClaimsDb = new zidenjs.db.SMTLevelDb(
        "trees/test_db/holderClaims" + i
      );
      const holderRevsDb = new zidenjs.db.SMTLevelDb(
        "trees/test_db/holderRevs" + i
      );
      const holderRootsDb = new zidenjs.db.SMTLevelDb(
        "trees/test_db/holderRoots" + i
      );

      holderTrees[i] = await zidenjs.trees.Trees.generateID(
        [holderAuthClaims[i]],
        holderClaimsDb,
        holderRevsDb,
        holderRootsDb,
        zidenjs.claim.id.IDType.Default,
        32,
        zidenjs.trees.SMTType.BinSMT
      );

      holderIds[i] = zidenjs.utils.bitsToNum(holderTrees[i].userID);

      console.log("Holder-" + i + " ID : ", holderIds[i]);
    }
  });

  it("Generate " + issuerNum + " issuers", async () => {
    for (let i = 0; i < issuerNum; i++) {
      issuerPks[i] = Buffer.alloc(32, i + 111);

      issuerAuthClaims[i] =
        await zidenjs.claim.authClaim.newAuthClaimFromPrivateKey(issuerPks[i]);

      const issuerClaimsDb = new zidenjs.db.SMTLevelDb(
        "trees/test_db/issuerClaims" + i
      );
      const issuerRevsDb = new zidenjs.db.SMTLevelDb(
        "trees/test_db/issuerRevs" + i
      );
      const issuerRootsDb = new zidenjs.db.SMTLevelDb(
        "trees/test_db/isuerRoots" + i
      );

      issuerTrees[i] = await zidenjs.trees.Trees.generateID(
        [issuerAuthClaims[i]],
        issuerClaimsDb,
        issuerRevsDb,
        issuerRootsDb,
        zidenjs.claim.id.IDType.Default,
        32,
        zidenjs.trees.SMTType.BinSMT
      );

      issuerIds[i] = zidenjs.utils.bitsToNum(issuerTrees[i].userID);

      console.log("Issuer-" + i + " ID : ", issuerIds[i]);
    }
  });

  let query0, query1, query2;
  let compactQuery0, compactQuery1, compactQuery2;
  it("Generate Queries", () => {
    const greater_than = zidenjs.witness.query.OPERATOR.GREATER_THAN;

    query0 = {
      slotIndex: 3,
      operator: greater_than,
      values: [],
      valueTreeDepth: 0,
      from: 0,
      to: 200,
      timestamp: Date.now() + 1000000000,
      claimSchema: BigInt("1234"),
    };

    compactQuery0 = zidenjs.witness.query.compactQuery(query0, false);

    query1 = {
      slotIndex: 6,
      operator: greater_than,
      values: [],
      valueTreeDepth: 0,
      from: 0,
      to: 200,
      timestamp: Date.now() + 1000000000,
      claimSchema: BigInt("5678"),
    };

    compactQuery1 = zidenjs.witness.query.compactQuery(query1, false);

    query2 = {
      slotIndex: 7,
      operator: greater_than,
      values: [],
      valueTreeDepth: 0,
      from: 0,
      to: 200,
      timestamp: Date.now() + 1000000000,
      claimSchema: BigInt("5679"),
    };

    compactQuery2 = zidenjs.witness.query.compactQuery(query2, false);

    console.log("Compact input 0: " + compactQuery0.compactInput);
    console.log("Compact input 1: " + compactQuery1.compactInput);
    console.log("Compact input 2: " + compactQuery2.compactInput);
  });

  let claims0 = [];
  let claims1 = [];
  let claims2 = [];
  it("issuer 0 issues claims of query0 for holders 0,1,2,3,4,5", async () => {
    // issuer[0]: claims for query0
    // issuer[1]: claims for query1
    // issuer[2]: claims for query2

    const claim = zidenjs.claim.entry;
    const utils = zidenjs.utils;

    // issuer 0 issues claims of query0 for holders 0,1,2,3,4,5

    for (let i = 0; i <= 5; i++) {
      const claim0 = claim.newClaim(
        claim.schemaHashFromBigInt(query0.claimSchema),
        claim.withIndexID(holderTrees[i].userID),
        claim.withSlotData(
          query0.slotIndex,
          utils.numToBits(BigInt("1000"), 32)
        ),
        claim.withExpirationDate(BigInt(expirationDate))
      );
      claims0.push(claim0);
    }

    const stateTransitionInput =
      await zidenjs.witness.stateTransition.stateTransitionWitness(
        issuerPks[0],
        issuerAuthClaims[0],
        issuerTrees[0],
        claims0,
        []
      );

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      stateTransitionInput,
      path.resolve("./build/state transition/stateTransition.wasm"),
      path.resolve("./build/state transition/stateTransition.zkey")
    );

    const { a, b, c, public } = await exportCalldata(proof, publicSignals);

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

  it("issuer 1 issues claims of query1 for holders 6,7,8,9", async () => {
    // issuer[0]: claims for query0
    // issuer[1]: claims for query1
    // issuer[2]: claims for query2

    const claim = zidenjs.claim.entry;
    const utils = zidenjs.utils;

    // issuer 1 issues claims of query1 for holders 6,7,8,9

    for (let i = 6; i <= 9; i++) {
      const claim1 = claim.newClaim(
        claim.schemaHashFromBigInt(query1.claimSchema),
        claim.withIndexID(holderTrees[i].userID),
        claim.withSlotData(
          query1.slotIndex,
          utils.numToBits(BigInt("1000"), 32)
        ),
        claim.withExpirationDate(BigInt(expirationDate))
      );
      claims1.push(claim1);
    }

    const stateTransitionInput =
      await zidenjs.witness.stateTransition.stateTransitionWitness(
        issuerPks[1],
        issuerAuthClaims[1],
        issuerTrees[1],
        claims1,
        []
      );

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      stateTransitionInput,
      path.resolve("./build/state transition/stateTransition.wasm"),
      path.resolve("./build/state transition/stateTransition.zkey")
    );

    const { a, b, c, public } = await exportCalldata(proof, publicSignals);

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

  it("issuer 2 issues claims of query2 for holders 4,5,6,7", async () => {
    // issuer[0]: claims for query0
    // issuer[1]: claims for query1
    // issuer[2]: claims for query2

    const claim = zidenjs.claim.entry;
    const utils = zidenjs.utils;

    // issuer 2 issues claims of query2 for holders 4,5,6,7

    for (let i = 4; i <= 7; i++) {
      const claim2 = claim.newClaim(
        claim.schemaHashFromBigInt(query2.claimSchema),
        claim.withIndexID(holderTrees[i].userID),
        claim.withSlotData(
          query2.slotIndex,
          utils.numToBits(BigInt("1000"), 32)
        ),
        claim.withExpirationDate(BigInt(expirationDate))
      );
      claims2.push(claim2);
    }

    const stateTransitionInput =
      await zidenjs.witness.stateTransition.stateTransitionWitness(
        issuerPks[2],
        issuerAuthClaims[2],
        issuerTrees[2],
        claims2,
        []
      );

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      stateTransitionInput,
      path.resolve("./build/state transition/stateTransition.wasm"),
      path.resolve("./build/state transition/stateTransition.zkey")
    );

    const { a, b, c, public } = await exportCalldata(proof, publicSignals);

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

  it("setup register contract", async () => {
    const allowedQuery0 = {
      ...compactQuery0,
      circuitId: "Query MTP",
      issuerId: issuerIds[0].toString(),
      factor: 2,
    };
    const allowedQuery1 = {
      ...compactQuery1,
      circuitId: "Query MTP",
      issuerId: issuerIds[1].toString(),
      factor: 1,
    };
    const allowedQuery2 = {
      ...compactQuery2,
      circuitId: "Query MTP",
      issuerId: issuerIds[2].toString(),
      factor: 3,
    };
    console.log(allowedQuery0);
    const tx0 = await registerContract
      .connect(deployer)
      .addAllowedQuery(allowedQuery0);
    await tx0.wait();
    const tx1 = await registerContract
      .connect(deployer)
      .addAllowedQuery(allowedQuery1);
    await tx1.wait();
    const tx2 = await registerContract
      .connect(deployer)
      .addAllowedQuery(allowedQuery2);
    await tx2.wait();

    const numAllowedQueries = await registerContract.getNumOfAllowedQueries();
    expect(numAllowedQueries).to.be.eq(ethers.BigNumber.from(3));

    const contractQuery0 = await registerContract.getAllowedQuery(0);
    console.log(contractQuery0);
  });

  it("test mtp query claim0 of holder0, issuer0 and register for signer 1", async () => {
    const values = [BigInt("100")];
    let kycQueryInput = await zidenjs.witness.queryMTP.kycGenerateQueryMTPInput(
      claims0[0].hiRaw(),
      issuerTrees[0]
    );
    let kycQueryNonRevInput =
      await zidenjs.witness.queryMTP.kycGenerateNonRevQueryMTPInput(
        claims0[0].getRevocationNonce(),
        issuerTrees[0]
      );

    const queryInput =
      await zidenjs.witness.queryMTP.holderGenerateQueryMTPWitness(
        claims0[0],
        holderPks[0],
        holderAuthClaims[0],
        BigInt(signers[1].address),
        holderTrees[0],
        kycQueryInput,
        kycQueryNonRevInput,
        query0.slotIndex,
        query0.operator,
        values,
        10,
        query0.from,
        query0.to,
        query0.timestamp
      );

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      queryInput,
      path.resolve("./build/queryMTP/credentialAtomicQueryMTP.wasm"),
      path.resolve("./build/queryMTP/queryMTP_final.zkey")
    );

    const { a, b, c, public } = await exportCalldata(proof, publicSignals);
    console.log(public);

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

    const registerTx = await registerContract.register(a, b, c, public, 0);
    await registerTx.wait();

    const amount1 = await registerContract.getRegisteredAmount(
      signers[1].address,
      0
    );
    console.log(amount1);
    const votingPower1 = await registerContract.getVotingPower(
      signers[1].address
    );
    console.log(votingPower1);

    await expect(
      registerContract.register(a, b, c, public, 0)
    ).to.be.revertedWith("Ziden Register Metrics: query is registered");
  });

  it("test mtp query claim1 of holder7, issuer1", async () => {
    const values = [BigInt("200")];
    let kycQueryInput = await zidenjs.witness.queryMTP.kycGenerateQueryMTPInput(
      claims1[1].hiRaw(),
      issuerTrees[1]
    );
    let kycQueryNonRevInput =
      await zidenjs.witness.queryMTP.kycGenerateNonRevQueryMTPInput(
        claims1[1].getRevocationNonce(),
        issuerTrees[1]
      );

    const queryInput =
      await zidenjs.witness.queryMTP.holderGenerateQueryMTPWitness(
        claims1[1],
        holderPks[7],
        holderAuthClaims[7],
        BigInt(signers[7].address),
        holderTrees[7],
        kycQueryInput,
        kycQueryNonRevInput,
        query1.slotIndex,
        query1.operator,
        values,
        10,
        query1.from,
        query1.to,
        query1.timestamp
      );

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      queryInput,
      path.resolve("./build/queryMTP/credentialAtomicQueryMTP.wasm"),
      path.resolve("./build/queryMTP/queryMTP_final.zkey")
    );

    const { a, b, c, public } = await exportCalldata(proof, publicSignals);

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

    const registerTx = await registerContract.register(a, b, c, public, 1);
    await registerTx.wait();

    const totalVotingPower = await registerContract.totalVotingPower();
    console.log(totalVotingPower);
  });
});
