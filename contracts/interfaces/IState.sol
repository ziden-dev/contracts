// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

interface IState {
  function getState(uint id) external view returns (uint256);
  function getTransitionInfo(uint256 state) external view returns (uint256, uint256, uint64, uint64, uint256, uint256);
}