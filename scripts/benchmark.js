const { ethers } = require("hardhat");
const fs = require("fs");
const snarkjs = require("snarkjs");
const { params, auth, db, claim, state, OPERATOR } = require("@zidendev/zidenjs");

async function main() {
  const signers = await ethers.getSigners();
  await params.setupParams();

  const blockNumber = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNumber);
  const blockTimestamp = block.timestamp;
  let users = [];
  const numberOfUsers = 10;
  for (let i = 0; i < numberOfUsers; i++) {
    const privateKey = Buffer.alloc(32, i * 11 + 11);
    const userAuth = auth.newAuthFromPrivateKey(privateKey);
    const authsDb = new db.SMTLevelDb("db_test/user" + i + "/auths");
    const claimsDb = new db.SMTLevelDb("db_test/user" + i + "/claims");
    const authRevDb = new db.SMTLevelDb(
      "db_test/user" + i + "/authRev"
    );
    const claimRevDb = new db.SMTLevelDb(
      "db_test/user" + i + "/claimRev"
    );
    const userState = await state.State.generateState(
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
          value: userAuth,
          isRevoked: false,
        },
      ],
      claims: [],
      state: userState,
    };
    users.push(user);
  }

  let query0, query1, query2;
  query0 = {
    slotIndex: 2,
    operator: OPERATOR.GREATER_THAN,
    values: [BigInt("10000000")],
    from: 50,
    to: 100,
    valueTreeDepth: 6,
    timestamp: blockTimestamp + 1000000000,
    claimSchema: BigInt("13741492"),
  };

  query1 = {
    slotIndex: 3,
    operator: OPERATOR.GREATER_THAN,
    values: [BigInt("100000000")],
    from: 50,
    to: 100,
    valueTreeDepth: 6,
    timestamp: blockTimestamp + 1000000000,
    claimSchema: BigInt("13741493"),
  };

  query2 = {
    slotIndex: 6,
    operator: OPERATOR.GREATER_THAN,
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
    withExpirationDate,
  } = claim;
  const { numToBits, setBits } = utils;
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
    await stateTransition.stateTransitionWitnessWithPrivateKey(
      user.auths[0].privateKey,
      user.auths[0].value,
      user.state,
      [],
      claims,
      [],
      []
    );
  };

  await issueClaims(0, [claim0]); // issuer: user0, holder: user3, claim: 0
  await issueClaims(1, [claim1]); // issuer: user1, holder: user4, claim: 1
  await issueClaims(2, [claim2]); // issuer: user2, holder: user5, claim: 2

  const benchmark = async (issuerIndex, holderIndex, claim, query, voter) => {
    const issuer = users[issuerIndex];
    const holder = users[holderIndex];
    const kycMTPInput = await queryMTP.kycGenerateQueryMTPInput(
      claim.hiRaw(),
      issuer.state
    );
    const kycNonRevInput =
      await queryMTP.kycGenerateNonRevQueryMTPInput(
        claim.getRevocationNonce(),
        issuer.state
      );
    const inputs =
      await queryMTP.holderGenerateQueryMTPWitnessWithPrivateKey(
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
    await snarkjs.groth16.fullProve(
      inputs,
      "build/credentialAtomicQueryMTP.wasm",
      "build/credentialAtomicQueryMTP.zkey"
    );
    const provingTime = (Date.now() - start) / 1000;
    console.log("Proving time: " + provingTime);
  };
  for (let i = 0; i < 10; i++) {
    await benchmark(0, 3, claim0, query0, signers[1]);
    await benchmark(1, 4, claim1, query1, signers[2]);
    await benchmark(2, 5, claim2, query2, signers[3]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
