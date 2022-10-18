// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "../interfaces/IValidator.sol";

contract TestValidator{
  address public owner;
  IValidator public mtpValidator;
  IValidator public sigValidator;
  constructor(address _mtpValidator, address _sigValidator) {
    mtpValidator = IValidator(_mtpValidator);
    sigValidator = IValidator(_sigValidator);
  }
  function verifyMTP(uint[2] memory a,uint[2][2] memory b, uint[2] memory c, uint[9] memory pubSigs ) public returns (bool){
    IValidator.Query memory query;
    query.deterministicValue = pubSigs[6];
    query.compactInput = pubSigs[7];
    query.mask = pubSigs[8];
    query.circuitId = "Query";
     if (mtpValidator.verify(a,b,c,pubSigs, query)){
      owner = msg.sender;
      return true;
     } else {
      return false;
     }
  }

  function verifySig(uint[2] memory a, uint[2][2] memory b, uint[2] memory c,uint[9] memory pubSigs) public returns (bool){
    IValidator.Query memory query;
    query.compactInput = pubSigs[6];
    query.deterministicValue = pubSigs[7];
    query.mask = pubSigs[8];
    query.circuitId = "Query";
    if(sigValidator.verify(a, b, c, pubSigs, query)){
      owner = msg.sender;
      return true;
    } else {
      return false;
      }

  }
}