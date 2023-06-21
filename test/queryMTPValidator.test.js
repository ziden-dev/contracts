const hre = require("hardhat");
const crypto = require("crypto");
const { expect } = require("chai");
const path = require("path");
const snarkjs = require("snarkjs");
const { buildEddsa, buildBabyjub } = require("circomlibjs");

describe("Full test for MTP and Sig validator", async () => {
  let zidenjs,
    deployer,
    state,
    sigValidator,
    mtpValidator,
    testContract,
    eddsa,
    F,
    hasher,
    hash0,
    hash1;
  it("Set up global params", async () => {
    zidenjs = await import("zidenjs");
    deployer = await ethers.getSigner();
    eddsa = await zidenjs.global.buildSigner();
    F = await zidenjs.global.buildSnarkField();
    hasher = await zidenjs.global.buildHasher();
    let hs = await zidenjs.global.buildHash0Hash1(hasher, F);
    hash0 = hs.hash0;
    hash1 = hs.hash1;
    console.log("Deployer's address : ", deployer.address);
  });

  it("Deploy contracts", async () => {
    const StateVerifier = await hre.ethers.getContractFactory(
      "StateTransitionVerifier"
    );
    const stateVerifier = await StateVerifier.deploy();
    await stateVerifier.deployed();
    const QueryMTPVerifier = await hre.ethers.getContractFactory(
      "QueryMTPVerifier"
    );
    const queryMTPVerifier = await QueryMTPVerifier.deploy();
    await queryMTPVerifier.deployed();

    const QuerySigVerifier = await hre.ethers.getContractFactory(
      "QuerySigVerifier"
    );
    const querySigVerifier = await QuerySigVerifier.deploy();
    await querySigVerifier.deployed();

    const State = await hre.ethers.getContractFactory("State");
    state = await State.deploy();
    await state.deployed();

    await state.connect(deployer).initialize(stateVerifier.address);

    const QueryMTPValidator = await hre.ethers.getContractFactory(
      "QueryMTPValidator"
    );
    mtpValidator = await QueryMTPValidator.deploy();
    await mtpValidator.deployed();

    await mtpValidator
      .connect(deployer)
      .initialize(queryMTPVerifier.address, state.address);

    const QuerySigValidator = await hre.ethers.getContractFactory(
      "QuerySigValidator"
    );
    sigValidator = await QuerySigValidator.deploy();
    await sigValidator.deployed();

    await sigValidator
      .connect(deployer)
      .initialize(querySigVerifier.address, state.address);

    const TestContract = await hre.ethers.getContractFactory("TestValidator");
    testContract = await TestContract.deploy(
      mtpValidator.address,
      sigValidator.address
    );
    await testContract.deployed();
  });
  it("Test with given data", async () => {
    let givenData = {
      zkProofs: [
        {
          proof: {
            pi_a: [
              "2294714041381492618222900757448061473017363898187161621976367891421228776749",
              "13082812569390834665066589551758249666119862472733758681800882361852442951045",
              "1",
            ],
            pi_b: [
              [
                "19291397738459427161147924328908524975787351521197726369620836520968088278132",
                "19564955864635890001177262642679803879235397064585832736612077857232765828434",
              ],
              [
                "20803271249736480016293225513303453433602493669103623510140149939383199061958",
                "18284633961973392858203321543629272357913954806356705506747271220417013974454",
              ],
              ["1", "0"],
            ],
            pi_c: [
              "1267407665817672655050350250990328101467058619847970383042424360432304660673",
              "21684641802288157587414678217735777602808399919962717242851581453815801587162",
              "1",
            ],
            protocol: "groth16",
            curve: "bn128",
          },
          publicData: [
            "1958375783885358129967916794510516423567080776637634712215111059280363520",
            "501344200674651681271786699394692204433172678819234486327068431175778300759",
            "312590053190603080471743812520740873581",
            "3182152604993216643181371289370574611171293374447269080531610525744422347488",
            "33045299924372224873612342218278837468229311999168651246394402684929376256",
            "3182152604993216643181371289370574611171293374447269080531610525744422347488",
            "36505995624693978628145864365043406761259247393536178",
            "851135736467063169055098693630432780862095360",
            "91343852290646136522612994111845862799524757504",
          ],
        },
      ],
      requestId: "9767fd54-8361-4215-8f66-ba3c2ea26725",
    };

    // let givenData02 = {
    //   zkProofs: [
    //     {
    //       proof: {
    //         pi_a: [
    //           "11685272322907611176644327649965824403830278954549303518198969206038321184542",
    //           "11990253611482109905191926029736053716027893903137434949771524973207631841613",
    //           "1",
    //         ],
    //         pi_b: [
    //           [
    //             "18348776711968785846393879022813812480659355528808719946910636579091412307304",
    //             "7873519821837014849169978437988380603375866745908949586852549139680733953806",
    //           ],
    //           [
    //             "5839368442317834498452955309433022770132331347569999871950070953824650142001",
    //             "19272273467219956409146575194133053243440180261340954013933626186065367864364",
    //           ],
    //           ["1", "0"],
    //         ],
    //         pi_c: [
    //           "1338121318176198867538807236464657487568012871201347527172172539281510967510",
    //           "14497245491441990221084666032576590683263632474307673923555570340070766511756",
    //           "1",
    //         ],
    //         protocol: "groth16",
    //         curve: "bn128",
    //       },
    //       publicData: [
    //         "25838667792912704215738829599472019873310404234211455020107033061073879040",
    //         "6614698954985652279229140377464837087567463483958132485147400463634914198840",
    //         "1",
    //         "2645648172016232621856561434381693526031581339909110696877372284314639225674",
    //         "85138000724797722501014843887761525863835753004870062448046506220368953344",
    //         "2645648172016232621856561434381693526031581339909110696877372284314639225674",
    //         "36436108465156164442736923091804139314707708661620018",
    //         "6819293001614665822590836933767985566167597056",
    //         "730750818325169092180903952894766902396198060032",
    //       ],
    //     },
    //   ],
    // };
    // let givenData = {
    //   zkProofs: [
    //     {
    //       proof: {
    //         pi_a: [
    //           "1351750110455402941028062429747038056174653979200150016408758575183528417603",
    //           "20615374137219961103008935757835057210713094438646481748715859376902376028633",
    //           "1",
    //         ],
    //         pi_b: [
    //           [
    //             "17924674192094730986721982849054661643220128259370139148389154451309334343352",
    //             "17495770512049922322231963635876226020417794911160610065009899499375537164816",
    //           ],
    //           [
    //             "11850147212087102887997012812706321616447480637094406937488059438257171670810",
    //             "1047141171447480429378036863864253845121240007255300404453486995023371365980",
    //           ],
    //           ["1", "0"],
    //         ],
    //         pi_c: [
    //           "9210713079669406188394926406250534286410936842884781867812483674951705875837",
    //           "19763696491513538942388764065880740000981339168443018197857983913368047088342",
    //           "1",
    //         ],
    //         protocol: "groth16",
    //         curve: "bn128",
    //       },
    //       publicData: [
    //         "21759126946865110939507375343918347468204421109508830811219123751234895872",
    //         "5570336498397468400513888088043096951860331804034260687672095680316137786809",
    //         "1233411610111511634583497989934125",
    //         "13813470185166634732584984209534741940742878381623346836531580221654120290355",
    //         "55732432088994232800273771064430217382171834733740615825547009840699801600",
    //         "13813470185166634732584984209534741940742878381623346836531580221654120290355",
    //         "36368238418386040786064261364946553623756467510052530",
    //         "6819293001614665822590836933767985566167597056",
    //         "730750818325169092180903952894766902396198060032",
    //       ],
    //     },
    //   ],
    // };
    const callData = (
      await snarkjs.groth16.exportSolidityCallData(
        givenData.zkProofs[0].proof,
        givenData.zkProofs[0].publicData
      )
    )
      .toString()
      .split(",")
      .map((e) => {
        return e.replaceAll(/([\[\]\s\"])/g, "");
      });
    // console.log(callData);

    let a,
      b = [],
      c,
      publicInp;
    a = callData.slice(0, 2).map((e) => BigInt(e));
    b[0] = callData.slice(2, 4).map((e) => BigInt(e));
    b[1] = callData.slice(4, 6).map((e) => BigInt(e));
    c = callData.slice(6, 8).map((e) => BigInt(e));
    publicInp = callData.slice(8, callData.length).map((e) => BigInt(e));
    let trimmedCompactInput = BigInt(
      "0b" + BigInt(publicInp[6]).toString(2).padStart(198, "0").slice(64, 198)
    );

    let query = {
      determinisiticValue: publicInp[7],
      mask: publicInp[8],
      compactInput: trimmedCompactInput,
      circuitId: "Query",
    };
    console.log(query.determinisiticValue.toString());
    console.log(query.compactInput.toString());
    console.log(query.mask.toString());
    console.log(await testContract.verifyMTP(a, b, c, publicInp));
  });
});
