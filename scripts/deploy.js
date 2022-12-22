const hre = require("hardhat");
const fs = require("fs");

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

  console.log(
    "========================== Verifiers deployed =========================="
  );
  console.log("StateTransitionVerifier at : ", stateTransitionVerifier.address);
  console.log("QueryMTPVerifier at : ", queryMTPVerifier.address);

  // ========================== Deploy state contract ==========================

  const State = await hre.ethers.getContractFactory("State");
  const state = await State.connect(deployer).deploy();
  await state.deployed();

  console.log(
    "========================== State deployed =========================="
  );
  console.log("State at : ", state.address);

  const initState = await state.connect(deployer).initialize(stateTransitionVerifier.address);
  await initState.wait();
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

  // ========================== Deploy Register Ziden Metrics ==========================

  const RegisterMetrics = await hre.ethers.getContractFactory(
    "RegisterMetrics"
  );
  const registerContract = await RegisterMetrics.deploy(
    queryMTPvalidator.address,
    state.address
  );
  await registerContract.deployed();
  console.log(
    "========================== Register Ziden Metrics deployed =========================="
  );

  const addresses = {
    state: state.address,
    mtpValidator: queryMTPvalidator.address,
    register: registerContract.address,
  };

  fs.writeFileSync("address.json", JSON.stringify(addresses));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
