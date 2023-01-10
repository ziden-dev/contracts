// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../lib/GenesisUtil.sol";
import "../interfaces/IValidator.sol";
import "../interfaces/IState.sol";
import "../interfaces/IQueryVerifier.sol";
import "hardhat/console.sol";

contract QuerySigValidator is OwnableUpgradeable, IValidator {
 // string constant CIRCUIT_ID = "credentialAtomicQuerySig";
  uint256 constant CHALLENGE_INDEX = 3;
  uint256 constant USER_ID_INDEX = 1;

  IQueryVerifier public verifier;
  IState public state;

  uint256 public revocationStateExpirationTime;

  function initialize(
    address _verifierContractAddress,
    address _stateContractAddress
  ) public initializer{
    revocationStateExpirationTime = 1 hours;
    verifier = IQueryVerifier(_verifierContractAddress);
    state = IState(_stateContractAddress);
    __Ownable_init();
  }

  function setRevocationStateExpirationTime(uint256 expirationTime) public onlyOwner {
    revocationStateExpirationTime = expirationTime;
  }

    // 0: userId
    // 1: userState
    // 2: challenge
    // 3: issuerAuthId
    // 4: issuerAuthState
    // 5: issuerClaimNonRevState
    // 6: timestamp
    // 7: claimSchema
    // 8: slotIndex
    // 9: operator
    // 10: mask
    // 11: deterministicValue
  function verify(
    uint256[2] memory a,
    uint256[2][2] memory b,
    uint256[2] memory c,
    uint256[12] memory inputs,
    Query memory query
   ) external view override returns (bool r){
    // verify query
        require(
            inputs[6] == uint256(query.timestamp),
            "wrong timestamp value has been used for proof generation"
        );
        require(
            inputs[7] == uint256(query.claimSchema),
            "wrong claim schema value has been used for proof generation"
        );
        require(
            inputs[8] == uint256(query.slotIndex),
            "wrong slot index value has been used for proof generation"
        );
        require(
            inputs[9] == uint256(query.operator),
            "wrong operator value has been used for proof generation"
        );
        require(
            inputs[11] == query.deterministicValue,
            "wrong deterministic value has been used for proof generation"
        );
        require(
            inputs[10] == query.mask,
            "wrong mask has been used for proof generation"
        );

    //verify user state

    uint256 userId = inputs[0];
    uint256 userState = inputs[1];
    uint256 issuerAuthState = inputs[4];
    uint256 issuerId = inputs[3];
    uint256 issuerClaimNonRevState = inputs[5];

    //1.Uset state must be lastest or genesis

    uint256 userStateFromContract = state.getState(userId);
        if (userStateFromContract == 0) {
            require(
                GenesisUtils.isGenesisState(userId, userState),
                "User state isn't genesis nor in state contract"
            );
        } else {
            // The non-empty state is returned, and it’s not equal to the state that the user has provided.
            require(
                userStateFromContract == userState,
                "User state isn't lastest hahaha"
            );
        }
    
    // 2. Issuer state must be registered in state contracts or be genesis
    bool isIssuerStateGenesis = GenesisUtils.isGenesisState(
        issuerId, 
        issuerAuthState);

    if(!isIssuerStateGenesis) {
      ( , , , , uint256 issuerIdFromState,  ) = state.getTransitionInfo(issuerAuthState);
      require(issuerId == issuerIdFromState, 
      "Issuer state doesn't exist in state contract"
      );
    }
    
    uint256 issuerClaimNonRevFromContract = state.getState(issuerId);

    if(issuerClaimNonRevFromContract == 0){
      require(GenesisUtils.isGenesisState(issuerId, issuerClaimNonRevState), 
      "Non-Revocation state isn't in state contract and not genesis");
    } else {
      if(issuerClaimNonRevFromContract != issuerClaimNonRevState) {
         (uint256 replacedAtTimestamp, , , , uint256 id, ) = state
         .getTransitionInfo(issuerClaimNonRevState);
          if (id == 0 || id != issuerId) {
            revert("state in transition info contains invalid id");
          }

          if (replacedAtTimestamp == 0) {
            revert("Non-Latest state doesn't contain replacement information");
          }

          if (block.timestamp - replacedAtTimestamp  > revocationStateExpirationTime) {
            revert("Non-Revocation state of Issuer expired");
        }
      }
    }
    require(verifier.verifyProof(a, b, c, inputs), "Sig proof not valid");
    return true;
  }
}