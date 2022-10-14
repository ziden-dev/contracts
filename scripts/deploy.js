const hre = require("hardhat");

async function main() {
  const deployer = await hre.ethers.getSigner();
  console.log("Deployer's address: ", deployer.address);

  // ========================== Deploy verifier contracts ==========================
  const StateTransitionVerifier = await hre.ethers.getContractFactory(
    "StateTransitionVerifier"
  );
  const stateTransitionVerifier = await StateTransitionVerifier.connect(
    deployer
  ).deploy();
  await stateTransitionVerifier.deployed();

  const QueryVerifier = await hre.ethers.getContractFactory("QueryVerifier");
  const queryVerifier = await QueryVerifier.connect(deployer).deploy();
  await queryVerifier.deployed();

  console.log(
    "========================== Verifiers deployed =========================="
  );
  console.log("StateTransitionVerifier at : ", stateTransitionVerifier.address);
  console.log("QueryVerifier at : ", queryVerifier.address);

  // ========================== Deploy state contract ==========================
  const State = await hre.ethers.getContractFactory("State");
  const state = await State.connect(deployer).deploy();
  await state.deployed();

  console.log(
    "========================== State deployed =========================="
  );
  console.log("State at : ", state.address);

  await state.connect(deployer).initialize(stateTransitionVerifier.address);
  console.log("State's owner : ", await state.owner());
  console.log("State verifier at : ", await state.verifier());
  // ========================== Deploy Validator ==========================
  const Validator = await hre.ethers.getContractFactory("Validator");
  const validator = await Validator.deploy();
  await validator.deployed();

  console.log(
    "========================== Validator deployed =========================="
  );
  console.log("Validator at : ", validator.address);
  // console.log("Validator's owner : ", validator.owner());
  await validator
    .connect(deployer)
    .initialize(queryVerifier.address, state.address);
  console.log("Validator's verifier : ", await validator.verifier());
  console.log("Validator's state : ", await validator.state());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
