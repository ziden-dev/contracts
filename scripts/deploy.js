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

  const QueryMTPVerifier = await hre.ethers.getContractFactory(
    "QueryMTPVerifier"
  );
  const queryMTPVerifier = await QueryMTPVerifier.connect(deployer).deploy();
  await queryMTPVerifier.deployed();

  const QuerySigVerifier = await hre.ethers.getContractFactory(
    "QuerySigVerifier"
  );
  const querySigVerifier = await QuerySigVerifier.deploy();
  await querySigVerifier.deployed();

  console.log(
    "========================== Verifiers deployed =========================="
  );
  console.log("StateTransitionVerifier at : ", stateTransitionVerifier.address);
  console.log("QueryMTPVerifier at : ", queryMTPVerifier.address);
  console.log("QuerySigVerifier at : ", querySigVerifier.address);

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

  // ========================== Deploy QueryMTPValidator ==========================

  const QueryMTPValidator = await hre.ethers.getContractFactory(
    "QueryMTPValidator"
  );
  const queryMTPvalidator = await QueryMTPValidator.deploy();
  await queryMTPvalidator.deployed();

  console.log(
    "========================== QueryMTPValidator deployed =========================="
  );
  console.log("QueryMTPValidator at : ", queryMTPvalidator.address);

  await queryMTPvalidator
    .connect(deployer)
    .initialize(queryMTPVerifier.address, state.address);
  console.log(
    "QueryMTPValidator's verifier : ",
    await queryMTPvalidator.verifier()
  );
  console.log("QueryMTPValidator's state : ", await queryMTPvalidator.state());

  // ========================== Deploy QuerySigValidator ==========================

  const QuerySigValidator = await hre.ethers.getContractFactory(
    "QuerySigValidator"
  );
  const querySigValidator = await QuerySigValidator.deploy();
  await querySigValidator.deployed();
  console.log(
    "========================== QuerySigValidator deployed =========================="
  );

  await querySigValidator
    .connect(deployer)
    .initialize(querySigVerifier.address, state.address);
  console.log("QuerySigValidator at : ", querySigValidator.address);
  console.log(
    "QuerySigValidator's verifier : ",
    await querySigValidator.verifier()
  );
  console.log("QuerySigValidator's state : ", await querySigValidator.state());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
