/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("solidity-coverage");
require("solidity-bytes-utils");
require("hardhat-gas-reporter");

const fs = require("fs");
const mnemonic = JSON.parse(fs.readFileSync("secrets.json")).mnemonic;

module.exports = {
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    testbsc: {
      chainId: 97,
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts: { mnemonic, count: 20 },
    },
  },
  gasReporter: {
    currency: "BNB",
    gasPrice: 21,
    enabled: true,
  },
};
