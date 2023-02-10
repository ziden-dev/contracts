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
    signers,
    stateContract,
    validator,
    stateVerifier,
    queryMTPVerifier,
    registerContract;

  let blockNumber, blockTimestamp;
  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    signers = await ethers.getSigners();
    await zidenjs.params.setupParams();

    blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    blockTimestamp = block.timestamp;
  });

  it("Deploy contracts", async () => {
    const deployer = signers[0];
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
    stateContract = await State.connect(deployer).deploy();
    await stateContract.deployed();

    await stateContract.connect(deployer).initialize(stateVerifier.address);

    const MTPValidator = await hre.ethers.getContractFactory(
      "QueryMTPValidator"
    );
    validator = await MTPValidator.deploy();
    await validator.deployed();

    await validator
      .connect(deployer)
      .initialize(queryMTPVerifier.address, stateContract.address);

    const Register = await hre.ethers.getContractFactory("RegisterMetrics");
    registerContract = await Register.deploy(
      validator.address,
      stateContract.address
    );
    await registerContract.deployed();
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
      // const authRevDb = new zidenjs.db.SMTLevelDb(
      //   "db_test/user" + i + "/authRev"
      // );
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
      operator: zidenjs.OPERATOR.GREATER_THAN,
      values: [BigInt("10000000")],
      from: 50,
      to: 100,
      valueTreeDepth: 6,
      timestamp: blockTimestamp + 1000000000,
      claimSchema: BigInt("13741492"),
    };

    query1 = {
      slotIndex: 3,
      operator: zidenjs.OPERATOR.GREATER_THAN,
      values: [BigInt("100000000")],
      from: 50,
      to: 100,
      valueTreeDepth: 6,
      timestamp: blockTimestamp + 1000000000,
      claimSchema: BigInt("13741493"),
    };

    query2 = {
      slotIndex: 6,
      operator: zidenjs.OPERATOR.GREATER_THAN,
      values: [BigInt("1000000000")],
      from: 50,
      to: 100,
      valueTreeDepth: 6,
      timestamp: blockTimestamp + 1000000000,
      claimSchema: BigInt("13741494"),
    };
  });

  let claim0, claim1, claim2;
  it("users issue claims", async () => {
    const {
      newClaim,
      schemaHashFromBigInt,
      withIndexID,
      withSlotData,
      withExpirationDate,
      getVersion,
    } = zidenjs.claim;
    const { numToBits, setBits } = zidenjs.utils;
    claim0 = newClaim(
      schemaHashFromBigInt(query0.claimSchema),
      withIndexID(users[3].state.userID),
      withSlotData(
        query0.slotIndex,
        numToBits(
          setBits(BigInt(0), query0.from, query0.values[0] + BigInt(11)),
          32
        )
      ),
      withExpirationDate(BigInt(query0.timestamp + 1000))
    );
    claim1 = newClaim(
      schemaHashFromBigInt(query1.claimSchema),
      withIndexID(users[4].state.userID),
      withSlotData(
        query1.slotIndex,
        numToBits(
          setBits(BigInt(0), query1.from, query1.values[0] + BigInt(11)),
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
        numToBits(
          setBits(BigInt(0), query2.from, query2.values[0] + BigInt(11)),
          32
        )
      ),
      withExpirationDate(BigInt(query0.timestamp + 1000))
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

    await issueClaims(0, [claim0]); // issuer: user0, holder: user3, claim: 0
    await issueClaims(1, [claim1]); // issuer: user1, holder: user4, claim: 1
    await issueClaims(2, [claim2]); // issuer: user2, holder: user5, claim: 2
  });

  // mask: 00..00               1111..111         00..00
  //       (256 - to) bits 0    (to-from) bits 1  from bits 0

  it("setup allowed queries", async () => {
    const { bitsToNum } = zidenjs.utils;
    const setupAllowedQuery = async (issuerIndex, query, factor) => {
      const issuer = users[issuerIndex];
      const allowedQuery = {
        issuerId: bitsToNum(issuer.state.userID),
        factor,
        from: query.from,
        to: query.to,
        claimSchema: query.claimSchema,
        slotIndex: query.slotIndex,
      };
      const tx = await registerContract.addAllowedQueries(allowedQuery);
      await tx.wait();
    };

    await setupAllowedQuery(0, query0, 3);
    await setupAllowedQuery(1, query1, 2);
    await setupAllowedQuery(2, query2, 1);

    const numAllowedQueries = await registerContract.getNumOfAllowedQueries();
    expect(numAllowedQueries.toString()).to.be.eq("3");
  });
  it("test register", async () => {
    const getVotingPower = async (
      issuerIndex,
      holderIndex,
      claim,
      query,
      voter,
      queryId
    ) => {
      console.log(" claimVersion =", claim.getVersion());

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
          BigInt(voter.address),
          holder.state,
          kycMTPInput,
          kycNonRevInput,
          query
        );

      console.log(inputs.determinisiticValue.valueOf() >> BigInt(query.from));
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        "build/credentialAtomicQueryMTP.wasm",
        "build/credentialAtomicQueryMTP.zkey"
      );
      const { a, b, c, public } = await callData(proof, publicSignals);
      const votingPower = await registerContract.getVotingPower(
        a,
        b,
        c,
        public,
        queryId,
        blockTimestamp + 10000,
        blockTimestamp + 10000000
      );
      return votingPower;
    };

    const votingPower1 = await getVotingPower(
      0,
      3,
      claim0,
      query0,
      signers[1],
      0
    );
    const votingPower2 = await getVotingPower(
      1,
      4,
      claim1,
      query1,
      signers[2],
      1
    );
    const votingPower3 = await getVotingPower(
      2,
      5,
      claim2,
      query2,
      signers[3],
      2
    );

    console.log(votingPower1);
    console.log(votingPower2);
    console.log(votingPower3);
  });
});
