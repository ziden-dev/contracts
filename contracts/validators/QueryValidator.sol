// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../lib/GenesisUtil.sol";
import "../interfaces/IValidator.sol";
import "../interfaces/IQueryVerifier.sol";
import "../interfaces/IState.sol";
import "hardhat/console.sol";

contract Validator is OwnableUpgradeable, IValidator{
  string constant CIRCUIT_ID = "credentialAtomicQuery";
  uint256 constant CHALLENGE_INDEX = 2;
  uint256 constant USER_ID_INDEX = 1;

  IQueryVerifier public verifier;
  IState public state;
  
  uint256 public revocationStateExpirationTime;

  function initialize(
    address _verifierContractAddress,
    address _stateContractAddress 
  ) public initializer {
    revocationStateExpirationTime = 1 hours;
    verifier = IQueryVerifier(_verifierContractAddress);
    state = IState(_stateContractAddress);
    __Ownable_init();
  }

  function setRevocationStateExpirationTime(uint256 expirationTime) 
    public 
    onlyOwner {
      revocationStateExpirationTime = expirationTime;
    }

    function getCircuitId()
      external
      pure
      override
      returns(string memory id){
        id = CIRCUIT_ID;
      }
    function getChallengeInputIndex()
      external
      pure 
      override
      returns(uint256 index){
        return CHALLENGE_INDEX;
      }

    function getUserIdInputIndex()
      external
      pure
      override
      returns(uint256 index){
        return USER_ID_INDEX;
      }

    function verify(
      uint[2] memory a,
      uint[2][2] memory b,
      uint[2] memory c,
      uint[9] memory inputs,
      Query memory query
    ) external view override returns (bool r){

      // verify query
      require(inputs[6] == query.deterministicValue, "wrong deterministic value has been used for proof generation");
      require(inputs[7] == query.compactInput, "wrong compact input has been used for proof generation");
      require(inputs[8] == query.mask, "wrong mask has been used for proof generation");

      // verify user state

      uint256 userId = inputs[0];
      uint256 userState = inputs[1];
      uint256 issuerClaimIdenState = inputs[3];
      uint256 issuerId = inputs[4];
      uint256 issuerClaimNonRevState = inputs[5];

      // 1. User state must be lastest or genesis

      uint256 userStateFromContract = state.getState(userId);
      if(userStateFromContract == 0){
        require(GenesisUtils.isGenesisState(userId, userState), "User state isn't genesis nor in state contract");
      } else {
        // The non-empty state is returned, and it’s not equal to the state that the user has provided.
        require(userStateFromContract == userState, "User state isn't lastest");
      }

      // 2. Issuer state must be registered in state contracts or be genesis
      bool isIssuerGenesisState = GenesisUtils.isGenesisState(issuerId, issuerClaimIdenState);

      if(!isIssuerGenesisState){
        ( , , , , uint256 issuerIdFromState, ) = state.getTransitionInfo(issuerClaimIdenState);
        require(issuerId == issuerIdFromState, "Issuer state doesn't exist in contract");
      }

      uint256 issuerClaimNonRevFromContract = state.getState(issuerId);

      if(issuerClaimNonRevFromContract == 0){
        require(GenesisUtils.isGenesisState(issuerId, issuerClaimIdenState),"Non-Revocation state isn't genesis nor in state contract");
      } else {
        if(issuerClaimNonRevFromContract != issuerClaimNonRevState){
        // Non empty state is returned and it's not equal to the state that the user has provided. 
          (uint256 replacedAtTimestamp, , , , uint256 id, ) = state.getTransitionInfo(issuerClaimNonRevState);

          if( id == 0 || id != issuerId) {
            revert("state in transition info contains invalid id");
          }

          if(replacedAtTimestamp == 0) {
            revert("Non-latest state doesn't contain replacement information");
          }

          if(block.timestamp - replacedAtTimestamp > revocationStateExpirationTime){
            revert("Issuer non-revocation state expired");
          }
        }
      }

      require(verifier.verifyProof(a, b, c, inputs), "MTP not valid");
      return true;
    }
}