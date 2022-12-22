// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

interface IValidator {
    struct Query {
        uint256 deterministicValue;
        uint256 mask;
        uint128 claimSchema;
        uint64 timestamp;
        uint8 slotIndex;
        uint8 operator;
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[12] memory inputs,
        Query memory query
    ) external view returns (bool r);

}
