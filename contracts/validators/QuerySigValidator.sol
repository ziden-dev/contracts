// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../lib/GenesisUtil.sol";
import "../interfaces/IValidator.sol";
import "../interfaces/IState.sol";
import "../interfaces/IQueryVerifier.sol";
import "hardhat/console.sol";

contract QuerySigValidator is OwnableUpgradeable {
    string constant CIRCUIT_ID = "credentialAtomicQuerySig";
    uint256 constant CHALLENGE_INDEX = 3;
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
        onlyOwner
    {
        revocationStateExpirationTime = expirationTime;
    }

    function getCircuitId() external pure returns (string memory id) {
        return CIRCUIT_ID;
    }

    function getChallengeInputIndex()
        external
        pure
        returns (uint256 index)
    {
        return CHALLENGE_INDEX;
    }

    function getUserIdInputIndex()
        external
        pure
        returns (uint256 index)
    {
        return USER_ID_INDEX;
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory inputs,
        IValidator.Query memory query
    ) external view returns (bool r) {
        require(
            verifier.verifyProof(a, b, c, inputs),
            "Atomic query signature proof not valid"
        );
        require(
            inputs[6] == query.compactInput,
            "Wrong compact input value has been used for proof generation"
        );
        require(
            inputs[7] == query.deterministicValue,
            "Wrong deterministic value has been used for proof generation"
        );
        require(
            inputs[8] == query.mask,
            "Wrong mask has been used for proof generation"
        );

        //verify user state
        uint256 issuerAuthState = inputs[0];
        uint256 userId = inputs[USER_ID_INDEX];
        uint256 userState = inputs[2];
        uint256 issuerId = inputs[4];
        uint256 issuerClaimNonRevState = inputs[5];

        uint256 userStateFromContract = state.getState(userId);

        if (userStateFromContract == 0) {
            require(
                GenesisUtils.isGenesisState(userId, userState),
                "User state isn't in state contract and not genesis"
            );
        } else {
            require(
                userStateFromContract == userState,
                "User state is not latest"
            );
        }

        bool isIssuerStateGenesis = GenesisUtils.isGenesisState(
            issuerId,
            issuerAuthState
        );

        if (!isIssuerStateGenesis) {
            (, , , , uint256 issuerIdFromState, ) = state.getTransitionInfo(
                issuerAuthState
            );
            require(
                issuerId == issuerIdFromState,
                "Issuer state doesn't exist in state contract"
            );
        }

        uint256 issuerClaimNonRevFromContract = state.getState(issuerId);

        if (issuerClaimNonRevFromContract == 0) {
            require(
                GenesisUtils.isGenesisState(issuerId, issuerClaimNonRevState),
                "Non-Revocation state isn't in state contract and not genesis"
            );
        } else {
            if (issuerClaimNonRevFromContract != issuerClaimNonRevState) {
                (uint256 replacedAtTimestamp, , , , uint256 id, ) = state
                    .getTransitionInfo(issuerClaimNonRevState);
                if (id == 0 || id != issuerId) {
                    revert("state in transition info contains invalid id");
                }

                if (replacedAtTimestamp == 0) {
                    revert(
                        "Non-Latest state doesn't contain replacement information"
                    );
                }

                if (
                    block.timestamp - replacedAtTimestamp >
                    revocationStateExpirationTime
                ) {
                    revert("Non-Revocation state of Issuer expired");
                }
            }
        }
        return true;
    }
}
