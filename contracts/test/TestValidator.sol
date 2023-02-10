// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "../interfaces/IValidator.sol";

contract TestValidator {
    IValidator public mtpValidator;

    uint256 public nonce;

    constructor(address _mtpValidator) {
        mtpValidator = IValidator(_mtpValidator);
    }

    function verifyMTP(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[12] memory pubSigs
    ) external {
        IValidator.Query memory query;
        query.timestamp = uint64(pubSigs[6]);
        query.claimSchema = uint128(pubSigs[7]);
        query.slotIndex = uint8(pubSigs[8]);
        query.operator = uint8(pubSigs[9]);
        query.deterministicValue = pubSigs[10];
        query.mask = pubSigs[11];

        if (mtpValidator.verify(a, b, c, pubSigs, query)) {
            nonce++;
        }
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[12] memory pubSigs
    ) external {
        IValidator.Query memory query;
        query.timestamp = uint64(pubSigs[6]);
        query.claimSchema = uint128(pubSigs[7]);
        query.slotIndex = uint8(pubSigs[8]);
        query.operator = uint8(pubSigs[9]);
        query.deterministicValue = pubSigs[10];
        query.mask = pubSigs[11];

        if (mtpValidator.verify(a, b, c, pubSigs, query)) {
            nonce++;
        }
    }

    
}
