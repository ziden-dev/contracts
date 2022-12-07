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
let zidenjs,
  deployer,
  state,
  validator,
  stateVerifier,
  queryMTPVerifier,
  registerContract,
  testContract,
  signers;

const setupGlobal = async () => {
  zidenjs = await import("zidenjs");
  signers = await hre.ethers.getSigners();
  deployer = signers[0];
  await zidenjs.global.setupParams();
  console.log("Deployer's address : ", deployer.address);
};

let fromTimestamp, toTimestamp, expirationDate;
const getTimestamp = async () => {
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  const timestamp = block.timestamp;
  fromTimestamp = timestamp + 100000;
  toTimestamp = timestamp + 100000000;
  expirationDate = timestamp + 100000000;
};

const loadContract = async () => {
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

  const MTPValidator = await hre.ethers.getContractFactory("QueryMTPValidator");
  validator = MTPValidator.attach(addresses.validator);

  const TestValidator = await hre.ethers.getContractFactory("TestValidator");
  testContract = TestValidator.attach(addresses.test);

  const RegisterMetrics = await hre.ethers.getContractFactory(
    "RegisterMetrics"
  );

  registerContract = RegisterMetrics.attach(addresses.register);

  console.log(validator.address);
  console.log(registerContract.address);
};

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

const generateHolders = async () => {
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
};

const generateIssuers = async () => {
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
};

let query0, query1, query2;
let compactQuery0, compactQuery1, compactQuery2;
const generateQueries = () => {
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
};

let claims0 = [];
let claims1 = [];
let claims2 = [];
const issueQuery0 = async () => {
  // issuer[0]: claims for query0
  // issuer[1]: claims for query1
  // issuer[2]: claims for query2
  // "issuer 0 issues claims of query0 for holders 0,1,2,3,4,5"
  const claim = zidenjs.claim.entry;
  const utils = zidenjs.utils;

  // issuer 0 issues claims of query0 for holders 0,1,2,3,4,5

  for (let i = 0; i <= 5; i++) {
    const claim0 = claim.newClaim(
      claim.schemaHashFromBigInt(query0.claimSchema),
      claim.withIndexID(holderTrees[i].userID),
      claim.withSlotData(query0.slotIndex, utils.numToBits(BigInt("1000"), 32)),
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
};

const issueQuery1 = async () => {
  // issuer[0]: claims for query0
  // issuer[1]: claims for query1
  // issuer[2]: claims for query2
  // issuer 1 issues claims of query1 for holders 6,7,8,9
  const claim = zidenjs.claim.entry;
  const utils = zidenjs.utils;

  // issuer 1 issues claims of query1 for holders 6,7,8,9

  for (let i = 6; i <= 9; i++) {
    const claim1 = claim.newClaim(
      claim.schemaHashFromBigInt(query1.claimSchema),
      claim.withIndexID(holderTrees[i].userID),
      claim.withSlotData(query1.slotIndex, utils.numToBits(BigInt("1000"), 32)),
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
};

const issueQuery2 = async () => {
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
      claim.withSlotData(query2.slotIndex, utils.numToBits(BigInt("1000"), 32)),
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
};

const setupResigerContract = async () => {
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
  console.log(numAllowedQueries);

  const contractQuery0 = await registerContract.getAllowedQuery(0);
  console.log(contractQuery0);
};

async function main() {
  await setupGlobal();
  await getTimestamp();
  await loadContract();
  generateQueries();
  await generateHolders();
  await generateIssuers();

//   await issueQuery0();
//   await issueQuery1();
//   await issueQuery2();

  await setupResigerContract();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
