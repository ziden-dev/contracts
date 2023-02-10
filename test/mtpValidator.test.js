const crypto = require("crypto");
const { expect } = require("chai");
const path = require("path");
const snarkjs = require("snarkjs");
const { ethers } = require("hardhat");

const callData = async (proof, publicSignals) => {
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
  return { a, b, c, public };
};

describe("Test MTP Validator contract", async () => {
  let zidenjs,
    deployer,
    stateContract,
    Sigvalidator,
    Mtpvalidator,
    stateVerifier,
    querySigVerifier,
    queryMTPVerifier,
    testContract;

  let blockNumber, blockTimestamp;
  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await ethers.getSigner();
    await zidenjs.params.setupParams();
    console.log("Deployer's address : ", deployer.address);
    blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    blockTimestamp = block.timestamp;
  });

  it("Deploy contract", async () => {
    // Query MTP verifier
    const QueryMTPVerifier = await hre.ethers.getContractFactory(
      "QueryMTPVerifier"
    );
    queryMTPVerifier = await QueryMTPVerifier.deploy();
    await queryMTPVerifier.deployed();

    // State
    const StateVerifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    stateVerifier = await StateVerifier.connect(deployer).deploy();
    await stateVerifier.deployed();
    const State = await hre.ethers.getContractFactory("State");
    stateContract = await State.connect(deployer).deploy();
    await stateContract.deployed();
    await stateContract.connect(deployer).initialize(stateVerifier.address);
    // Mtp Validator
    const MtpValidator = await hre.ethers.getContractFactory(
      "QueryMTPValidator"
    );
    Mtpvalidator = await MtpValidator.deploy();
    await Mtpvalidator.connect(deployer).initialize(
      queryMTPVerifier.address,
      stateContract.address
    );

    // Test Contract
    const TestValidator = await hre.ethers.getContractFactory("TestValidator");
    testContract = await TestValidator.deploy(Mtpvalidator.address);
    await testContract.deployed();
  });

  let users = [];
  const numberOfUsers = 10;
  it("setup users", async () => {
    for (let i = 0; i < numberOfUsers; i++) {
      const privateKey = crypto.randomBytes(32);
      const auth = zidenjs.auth.newAuthFromPrivateKey(privateKey);
      const authsDb = new zidenjs.db.SMTLevelDb("db_test/user" + i + "/auths");
      const claimsDb = new zidenjs.db.SMTLevelDb(
        "db_test/user" + i + "/claims"
      );
      const claimRevDb = new zidenjs.db.SMTLevelDb(
        "db_test/user" + i + "/claimRev"
      );
      const state = await zidenjs.state.State.generateState(
        [auth],
        authsDb,
        claimsDb,
        claimRevDb
      );
      const user = {
        auths: [
          {
            privateKey,
            value: auth,
            isRevoked: false,
          },
        ],
        claims: [],
        state,
      };
      users.push(user);
    }
  });

  let query0, query1, query2;
  it("setup queries", async () => {
    query0 = {
      slotIndex: 2,
      operator: zidenjs.OPERATOR.EQUAL,
      values: [BigInt("12345")],
      from: 50,
      to: 100,
      valueTreeDepth: 6,
      timestamp: blockTimestamp + 1000,
      claimSchema: BigInt("13741492"),
    };

    query1 = {
      slotIndex: 3,
      operator: zidenjs.OPERATOR.LESS_THAN,
      values: [BigInt("23456")],
      from: 50,
      to: 100,
      valueTreeDepth: 6,
      timestamp: blockTimestamp + 1000,
      claimSchema: BigInt("13741492"),
    };

    query2 = {
      slotIndex: 3,
      operator: zidenjs.OPERATOR.IN,
      values: [BigInt("100"), BigInt("101"), BigInt("102")],
      from: 50,
      to: 100,
      valueTreeDepth: 6,
      timestamp: blockTimestamp + 1000,
      claimSchema: BigInt("13741492"),
    };
  });

  let claim0, claim1, claim2, expiredClaim;
  it("users issue claims", async () => {
    const {
      newClaim,
      schemaHashFromBigInt,
      withIndexID,
      withSlotData,
      withExpirationDate,
    } = zidenjs.claim;
    const { numToBits, setBits } = zidenjs.utils;
    claim0 = newClaim(
      schemaHashFromBigInt(query0.claimSchema),
      withIndexID(users[3].state.userID),
      withSlotData(
        query0.slotIndex,
        numToBits(setBits(BigInt(0), query0.from, query0.values[0]), 32)
      ),
      withExpirationDate(BigInt(query0.timestamp + 1000))
    );
    claim1 = newClaim(
      schemaHashFromBigInt(query1.claimSchema),
      withIndexID(users[4].state.userID),
      withSlotData(
        query1.slotIndex,
        numToBits(
          setBits(BigInt(0), query1.from, query1.values[0] - BigInt(11)),
          32
        )
      ),
      withExpirationDate(BigInt(query0.timestamp + 1000))
    );
    claim2 = newClaim(
      schemaHashFromBigInt(query2.claimSchema),
      withIndexID(users[5].state.userID),
      withSlotData(
        query2.slotIndex,
        numToBits(setBits(BigInt(0), query2.from, query2.values[1]), 32)
      ),
      withExpirationDate(BigInt(query0.timestamp + 1000))
    );
    expiredClaim = newClaim(
      schemaHashFromBigInt(query2.claimSchema),
      withIndexID(users[5].state.userID),
      withSlotData(
        query2.slotIndex,
        numToBits(setBits(BigInt(0), query2.from, query2.values[1]), 32)
      ),
      withExpirationDate(BigInt(10))
    );

    const issueClaims = async (userIndex, claims) => {
      const user = users[userIndex];
      const inputs =
        await zidenjs.stateTransition.stateTransitionWitnessWithPrivateKey(
          user.auths[0].privateKey,
          user.auths[0].value,
          user.state,
          [],
          claims,
          [],
          []
        );
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        "build/stateTransition.wasm",
        "build/stateTransition.zkey"
      );
      const { a, b, c, public } = await callData(proof, publicSignals);
      const tx = await stateContract.transitState(
        public[0],
        public[1],
        public[2],
        public[3] === BigInt(0) ? false : true,
        a,
        b,
        c
      );
      await tx.wait();
    };

    await issueClaims(0, [claim0]);
    await issueClaims(1, [claim1]);
    await issueClaims(2, [claim2, expiredClaim]);
  });

  it("test query MTP", async () => {
    const queryMTP = async (issuerIndex, holderIndex, claim, query) => {
      const issuer = users[issuerIndex];
      const holder = users[holderIndex];
      const kycMTPInput = await zidenjs.queryMTP.kycGenerateQueryMTPInput(
        claim.hiRaw(),
        issuer.state
      );
      const kycNonRevInput =
        await zidenjs.queryMTP.kycGenerateNonRevQueryMTPInput(
          claim.getRevocationNonce(),
          issuer.state
        );

      const inputs =
        await zidenjs.queryMTP.holderGenerateQueryMTPWitnessWithPrivateKey(
          claim,
          holder.auths[0].privateKey,
          holder.auths[0].value,
          BigInt(1),
          holder.state,
          kycMTPInput,
          kycNonRevInput,
          query
        );
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        "build/credentialAtomicQueryMTP.wasm",
        "build/credentialAtomicQueryMTP.zkey"
      );
      const { a, b, c, public } = await callData(proof, publicSignals);
      const tx = await testContract.verifyMTP(a, b, c, public);
      await tx.wait();
    };

    await queryMTP(0, 3, claim0, query0);

    // await queryMTP(1, 4, claim1, query1);
    // await queryMTP(2, 5, claim2, query2);

    // try {
    //   await queryMTP(2, 5, expiredClaim, query2);
    // } catch (err) {
    //   console.log(err);
    // }
  });
});
