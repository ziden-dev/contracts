// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "../interfaces/IValidator.sol";

contract TestValidator {
    IValidator public mtpValidator;
    IValidator public sigValidator;

    constructor(address _mtpValidator, address _sigValidator) {
        mtpValidator = IValidator(_mtpValidator);
        sigValidator = IValidator(_sigValidator);
    }

    function verifyMTP(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory pubSigs
    ) public view returns (bool) {
        IValidator.Query memory query;
        query.compactInput = pubSigs[6];
        query.deterministicValue = pubSigs[7];
        query.mask = pubSigs[8];
        query.circuitId = "Query";
        if (mtpValidator.verify(a, b, c, pubSigs, query)) {
            return true;
        } else {
            return false;
        }
    }

    function verifyMTPInDuration(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory pubSigs,
        uint256 fromTimestamp,
        uint256 toTimestamp
    ) public view returns (bool) {
        IValidator.DurationQuery memory query;
        query.compactInput = pubSigs[6];
        query.deterministicValue = pubSigs[7];
        query.mask = pubSigs[8];
        query.circuitId = "Query";
        query.fromTimestamp = fromTimestamp;
        query.toTimestamp = toTimestamp;
        if (
            mtpValidator.verifyInDuration(
                a,
                b,
                c,
                pubSigs,
                query
            )
        ) {
            return true;
        } else {
            return false;
        }
    }

    function verifySig(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory pubSigs
    ) public view returns (bool) {
        IValidator.Query memory query;
        query.compactInput = pubSigs[6];
        query.deterministicValue = pubSigs[7];
        query.mask = pubSigs[8];
        query.circuitId = "Query";
        if (sigValidator.verify(a, b, c, pubSigs, query)) {
            return true;
        } else {
            return false;
        }
    }
}
