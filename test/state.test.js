const hre = require("hardhat");
const crypto = require("crypto");
const path = require("path");
const snarkjs = require("snarkjs");
const { expect, use } = require("chai");
const { assert } = require("console");
const exp = require("constants");

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

describe("Test State contract", async () => {
  let zidenjs, deployer, stateContract, verifier, gist;

  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await hre.ethers.getSigner();
    await zidenjs.params.setupParams();
    console.log("Deployer's address : ", deployer.address);
  });

  it("Deploy contracts", async () => {
    const Verifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    verifier = await Verifier.connect(deployer).deploy();
    await verifier.deployed();

    const State = await hre.ethers.getContractFactory("State");
    stateContract = await State.connect(deployer).deploy();
    await stateContract.deployed();

    await stateContract.connect(deployer).initialize(verifier.address);
  });

  let users = [];
  const numberOfUsers = 10;

  it("setup users", async () => {
    const gistDb = new zidenjs.db.SMTLevelDb("db_test/gist");
    gist = await zidenjs.gist.Gist.generateGist(gistDb);
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
      //   console.log("user ", i, " = ", user);
      users.push(user);
    }
  });

  it("user 0 add a new auth and new claim", async () => {
    // console.log("users = ", users);
    const newPrivateKey = crypto.randomBytes(32);
    const newAuth = zidenjs.auth.newAuthFromPrivateKey(newPrivateKey);
    const {
      newClaim,
      schemaHashFromBigInt,
      withIndexID,
      withIndexData,
      withValueData,
    } = zidenjs.claim;
    const { bitsToNum, numToBits } = zidenjs.utils;
    const schemaHash = schemaHashFromBigInt(BigInt("42136162"));

    const claim = newClaim(
      schemaHash,
      //withIndexID(users[1].state.userID),
      //withIndexData(numToBits(BigInt("1234")), numToBits(BigInt("7347")))
      //withValueData(numToBits(BigInt("432987492")), numToBits(BigInt("4342")))
      withIndexData(Buffer.alloc(30, 1234), Buffer.alloc(30, 7347)),
      withValueData(Buffer.alloc(30, 432987492), Buffer.alloc(30, 4342))
    );

    const inputs =
      await zidenjs.stateTransition.stateTransitionWitnessWithPrivateKey(
        users[0].auths[0].privateKey,
        users[0].auths[0].value,
        users[0].state,
        gist,
        [newAuth],
        [claim],
        [],
        []
      );

    await gist.insertGist(
      users[0].state.genesisID,
      users[0].state.getIdenState()
    );
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      "build/stateTransition.wasm",
      "build/stateTransition.zkey"
    );

    const { a, b, c, public } = await callData(proof, publicSignals);
    console.log(public);
    const tx = await stateContract.transitState(
      public[0],
      public[1],
      public[2],
      public[3],
      public[4] === BigInt(0) ? false : true,
      public[5],
      a,
      b,
      c
    );
    await tx.wait();

    const newState = await stateContract.getState(
      bitsToNum(users[0].state.userID)
    );
    expect(newState.toString()).to.be.eq(public[3].toString());
    const newRoot = await stateContract.getGistRoot();

    expect(public[0].toString()).to.be.eq(gist.getRoot().toString());
    expect(newRoot.toString()).to.be.eq(public[0].toString());
    users[0].auths.push({
      value: newAuth,
      privateKey: newPrivateKey,
      isRevoked: false,
    });
  });

  it("user 1 add a new auth and new claim", async () => {
    // console.log("users = ", users);
    const newPrivateKey = crypto.randomBytes(32);
    const newAuth = zidenjs.auth.newAuthFromPrivateKey(newPrivateKey);
    const {
      newClaim,
      schemaHashFromBigInt,
      withIndexID,
      withIndexData,
      withValueData,
    } = zidenjs.claim;
    const { bitsToNum, numToBits } = zidenjs.utils;
    const schemaHash = schemaHashFromBigInt(BigInt("42136162"));

    const claim = newClaim(
      schemaHash,
      withIndexID(users[1].state.userID),
      //withIndexData(numToBits(BigInt("1234")), numToBits(BigInt("7347")))
      //withValueData(numToBits(BigInt("432987492")), numToBits(BigInt("4342")))
      withIndexData(Buffer.alloc(30, 1234), Buffer.alloc(30, 7347)),
      withValueData(Buffer.alloc(30, 432987492), Buffer.alloc(30, 4342))
    );

    const inputs =
      await zidenjs.stateTransition.stateTransitionWitnessWithPrivateKey(
        users[1].auths[0].privateKey,
        users[1].auths[0].value,
        users[1].state,
        gist,
        [newAuth],
        [claim],
        [],
        []
      );

    await gist.insertGist(
      users[1].state.genesisID,
      users[1].state.getIdenState()
    );
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      "build/stateTransition.wasm",
      "build/stateTransition.zkey"
    );

    const { a, b, c, public } = await callData(proof, publicSignals);
    console.log(public);
    const tx = await stateContract.transitState(
      public[0],
      public[1],
      public[2],
      public[3],
      public[4] === BigInt(0) ? false : true,
      public[5],
      a,
      b,
      c
    );
    await tx.wait();

    const newState = await stateContract.getState(
      bitsToNum(users[0].state.userID)
    );
    expect(newState.toString()).to.be.eq(public[3].toString());
    const newRoot = await stateContract.getGistRoot();

    expect(public[0].toString()).to.be.eq(gist.getRoot().toString());
    expect(newRoot.toString()).to.be.eq(public[0].toString());
    users[0].auths.push({
      value: newAuth,
      privateKey: newPrivateKey,
      isRevoked: false,
    });
  });
});
