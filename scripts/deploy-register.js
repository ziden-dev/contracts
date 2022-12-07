const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  const timestamp = block.timestamp;
  const fromTimestamp = timestamp + 100000;
  const toTimestamp = timestamp + 100000000;
  // const expirationDate = timestamp + 100000000;

  const StateVerifier = await hre.ethers.getContractFactory(
    "StateTransitionVerifier"
  );
  const stateVerifier = await StateVerifier.connect(deployer).deploy();
  await stateVerifier.deployed();

  console.log("State Verifier deployed: ", stateVerifier.address);

  const QueryMTPVerifier = await hre.ethers.getContractFactory(
    "QueryMTPVerifier"
  );
  const queryMTPVerifier = await QueryMTPVerifier.deploy();
  await queryMTPVerifier.deployed();

  console.log("Query MTP Verifier deployed: ", queryMTPVerifier.address);

  const State = await hre.ethers.getContractFactory("State");
  const state = await State.connect(deployer).deploy();
  await state.deployed();

  await state.connect(deployer).initialize(stateVerifier.address);

  console.log("State deployed: ", state.address);

  const MTPValidator = await hre.ethers.getContractFactory("QueryMTPValidator");
  const validator = await MTPValidator.deploy();
  await validator.deployed();

  await validator
    .connect(deployer)
    .initialize(queryMTPVerifier.address, state.address);

  console.log("Validator deployed: ", validator.address);

  const TestValidator = await hre.ethers.getContractFactory("TestValidator");
  const testContract = await TestValidator.deploy(
    validator.address,
    validator.address
  );
  await testContract.deployed();

  console.log("Test Contract deployed: ", testContract.address);

  const RegisterMetrics = await hre.ethers.getContractFactory(
    "RegisterMetrics"
  );
  const registerContract = await RegisterMetrics.deploy(
    validator.address,
    fromTimestamp,
    toTimestamp
  );
  await registerContract.deployed();

  console.log("Register Contract deployed: ", registerContract.address);

  let addresses = {
    state: state.address,
    stateVerifier: stateVerifier.address,
    queryMTPVerifier: queryMTPVerifier.address,
    validator: validator.address,
    test: testContract.address,
    register: registerContract.address,
  };

  const addresses_json = JSON.stringify(addresses);
  fs.writeFileSync("address.json", addresses_json);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
