// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "../interfaces/IValidator.sol";

contract TestValidator{
  address owner;
  IValidator validator;
  constructor(address _validator) {
    validator = IValidator(_validator);
  }
  function verify(uint[2] memory a,uint[2][2] memory b, uint[2] memory c, uint[9] memory pubSigs ) public returns (bool){
    IValidator.Query memory query;
    query.deterministicValue = pubSigs[6];
    query.compactInput = pubSigs[7];
    query.mask = pubSigs[8];
    query.circuitId = "Query";
     if (validator.verify(a,b,c,pubSigs, query)){
      owner = msg.sender;
      return true;
     } else {
      return false;
     }
  }
}