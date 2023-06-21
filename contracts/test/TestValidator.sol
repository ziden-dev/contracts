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
  IValidator.Query query = IValidator.Query(851135736467063169055098693630432780862095360,13370140437026814190596886883407207299250,91343852290646136522612994111845862799524757504, "Query");
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