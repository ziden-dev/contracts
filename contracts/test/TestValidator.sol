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
  IValidator.Query query = IValidator.Query(19941031,7901234521,1267650600228229401496703205375, "Query");
  function verifyMTP(uint[2] memory a,uint[2][2] memory b, uint[2] memory c, uint[9] memory pubSigs ) public returns (bool){
     if (mtpValidator.verify(a,b,c,pubSigs, query)){
      owner = msg.sender;
      return true;
     } else {
      return false;
     }
  }

  function verifySig(uint[2] memory a, uint[2][2] memory b, uint[2] memory c,uint[9] memory pubSigs) public returns (bool){

    if(sigValidator.verify(a, b, c, pubSigs, query)){
      owner = msg.sender;
      return true;
    } else {
      return false;
      }

  }
}