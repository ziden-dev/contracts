// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../lib/GenesisUtil.sol";
import "../interfaces/IValidator.sol";
import "../interfaces/IQueryVerifier.sol";
import "../interfaces/IState.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "hardhat/console.sol";

contract QueryMTPValidator is OwnableUpgradeable, IValidator {
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

    function setRevocationStateExpirationTime(
        uint256 expirationTime
    ) public onlyOwner {
        revocationStateExpirationTime = expirationTime;
    }

    function getCircuitId() external pure override returns (string memory id) {
        id = CIRCUIT_ID;
    }

    function getChallengeInputIndex()
        external
        pure
        override
        returns (uint256 index)
    {
        return CHALLENGE_INDEX;
    }

    function getUserIdInputIndex()
        external
        pure
        override
        returns (uint256 index)
    {
        return USER_ID_INDEX;
    }

    function verify(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[9] memory inputs,
        Query memory query
    ) external view override returns (bool r) {
        //verify compact input
        {
            bytes memory typDefault = hex"000000000000000000000000000000"; // 15 bytes of 0
            bytes memory compactInputBytes = GenesisUtils.int256ToBytes(
                inputs[6] * 4
            ); // shift left 2 bits
            bytes memory cutCompactInputBytes = BytesLib.slice(
                compactInputBytes,
                15,
                17
            ); // slice 17 bytes start from byte number 15
            cutCompactInputBytes = BytesLib.concat(
                typDefault,
                cutCompactInputBytes
            );
            uint256 cutCompactInp = GenesisUtils.toUint256(
                cutCompactInputBytes
            ) / 4; // shift right 2 bits

            require(
                cutCompactInp == query.compactInput,
                "wrong compact input has been used for proof generation"
            );
        }
        // verify query
        require(
            inputs[7] == query.deterministicValue,
            "wrong deterministic value has been used for proof generation"
        );
        require(
            inputs[8] == query.mask,
            "wrong mask has been used for proof generation"
        );
        // verify user state

        uint256 userId = inputs[0];
        uint256 userState = inputs[1];
        uint256 issuerClaimIdenState = inputs[3];
        uint256 issuerId = inputs[4];
        uint256 issuerClaimNonRevState = inputs[5];

        // 1. User state must be lastest or genesis

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
                "User state isn't latest"
            );
        }

        // 2. Issuer state must be registered in state contracts or be genesis
        bool isIssuerGenesisState = GenesisUtils.isGenesisState(
            issuerId,
            issuerClaimIdenState
        );

        if (!isIssuerGenesisState) {
            (, , , , uint256 issuerIdFromState, ) = state.getTransitionInfo(
                issuerClaimIdenState
            );
            require(
                issuerId == issuerIdFromState,
                "Issuer state doesn't exist in contract"
            );
        }

        uint256 issuerClaimNonRevFromContract = state.getState(issuerId);

        if (issuerClaimNonRevFromContract == 0) {
            require(
                GenesisUtils.isGenesisState(issuerId, issuerClaimIdenState),
                "Non-Revocation state isn't genesis nor in state contract"
            );
        } else {
            if (issuerClaimNonRevFromContract != issuerClaimNonRevState) {
                // Non empty state is returned and it's not equal to the state that the user has provided.
                (uint256 replacedAtTimestamp, , , , uint256 id, ) = state
                    .getTransitionInfo(issuerClaimNonRevState);

                if (id == 0 || id != issuerId) {
                    revert("state in transition info contains invalid id");
                }

                if (replacedAtTimestamp == 0) {
                    revert(
                        "Non-latest state doesn't contain replacement information"
                    );
                }

                if (
                    block.timestamp - replacedAtTimestamp >
                    revocationStateExpirationTime
                ) {
                    revert("Issuer non-revocation state expired");
                }
            }
        }

        require(verifier.verifyProof(a, b, c, inputs), "MTP not valid");
        return true;
    }
}
