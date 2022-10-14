// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IValidator{
  struct Query{
    uint256 deterministicValue;
    uint256 compactInput;
    uint256 mask;
    string circuitId;
  }

  function verify(
    uint[2] memory a,
    uint[2][2] memory b,
    uint[2] memory c,
    uint[9] memory inputs,
    Query memory query
  ) external view returns (bool r);

  function getCircuitId() external pure returns (string memory id);

  function getChallengeInputIndex() external pure returns (uint256 index);

  function getUserIdInputIndex() external pure returns (uint256 index);
}