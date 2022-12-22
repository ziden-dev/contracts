const { ethers } = require("hardhat");
const fs = require("fs");
const snarkjs = require("snarkjs");

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

async function main() {
  const addresses = JSON.parse(fs.readFileSync("address.json"));

  const State = await ethers.getContractFactory("State");
  const stateContract = State.attach(addresses.state);
  const Register = await ethers.getContractFactory("RegisterMetrics");
  const registerContract = Register.attach(addresses.register);

  const signers = await ethers.getSigners();
  const zidenjs = await import("zidenjs");
  await zidenjs.params.setupParams();

  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  const blockTimestamp = block.timestamp;
  let users = [];
  const numberOfUsers = 6;
  for (let i = 0; i < numberOfUsers; i++) {
    const privateKey = Buffer.alloc(32, i * 11 + 11);
    const auth = zidenjs.auth.newAuthFromPrivateKey(privateKey);
    const authsDb = new zidenjs.db.SMTLevelDb("db_test/user" + i + "/auths");
    const claimsDb = new zidenjs.db.SMTLevelDb("db_test/user" + i + "/claims");
    const authRevDb = new zidenjs.db.SMTLevelDb(
      "db_test/user" + i + "/authRev"
    );
    const claimRevDb = new zidenjs.db.SMTLevelDb(
      "db_test/user" + i + "/claimRev"
    );
    const state = await zidenjs.state.State.generateState(
      [auth],
      authsDb,
      claimsDb,
      authRevDb,
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
      state,
    };
    users.push(user);
  }

  let query0, query1, query2;
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

  let claim0, claim1, claim2;

  const {
    newClaim,
    schemaHashFromBigInt,
    withIndexID,
    withSlotData,
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
    )
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
    )
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
    )
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
    // const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    //   inputs,
    //   "build/stateTransition.wasm",
    //   "build/stateTransition.zkey"
    // );
    // const { a, b, c, public } = await callData(proof, publicSignals);
    // const tx = await stateContract.transitState(
    //   public[0],
    //   public[1],
    //   public[2],
    //   public[3] === BigInt(0) ? false : true,
    //   a,
    //   b,
    //   c
    // );
    // await tx.wait();
    // console.log(tx);
  };

  await issueClaims(0, [claim0]); // issuer: user0, holder: user3, claim: 0
  await issueClaims(1, [claim1]); // issuer: user1, holder: user4, claim: 1
  await issueClaims(2, [claim2]); // issuer: user2, holder: user5, claim: 2

  // const { bitsToNum } = zidenjs.utils;
  // const setupAllowedQuery = async (issuerIndex, query, factor) => {
  //   const issuer = users[issuerIndex];
  //   const allowedQuery = {
  //     issuerId: bitsToNum(issuer.state.userID),
  //     factor,
  //     from: query.from,
  //     to: query.to,
  //     claimSchema: query.claimSchema,
  //     slotIndex: query.slotIndex,
  //   };
  //   const tx = await registerContract.addAllowedQueries(allowedQuery);
  //   await tx.wait();
  // };

  // await setupAllowedQuery(0, query0, 3);
  // await setupAllowedQuery(1, query1, 2);
  // await setupAllowedQuery(2, query2, 1);

  const numAllowedQueries = await registerContract.getNumOfAllowedQueries();
  console.log(numAllowedQueries);
  const getVotingPower = async (
    issuerIndex,
    holderIndex,
    claim,
    query,
    voter,
    queryId
  ) => {
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

    const start = Date.now();
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      "build/credentialAtomicQueryMTP.wasm",
      "build/credentialAtomicQueryMTP.zkey"
    );
    const provingTime = (Date.now() - start) / 1000;
    console.log("Proving time: " + provingTime);
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
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
