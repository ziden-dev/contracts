// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IQueryVerifier {
  function verifyProof(
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c, 
    uint[9] memory inputs) 
  external view returns (bool);
}