// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

interface IValidator {
    struct Query {
        uint256 deterministicValue;
        uint256 compactInput;
        uint256 mask;
        string circuitId;
    }

    struct DurationQuery {
        uint256 deterministicValue;
        uint256 compactInput;
        uint256 mask;
        uint256 fromTimestamp;
        uint256 toTimestamp;
        string circuitId;
    }

    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory inputs,
        Query memory query
    ) external view returns (bool r);

    function verifyInDuration(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory inputs,
        DurationQuery memory query
    ) external view returns (bool r);

    function getCircuitId() external pure returns (string memory id);

    function getChallengeInputIndex() external pure returns (uint256 index);

    function getUserIdInputIndex() external pure returns (uint256 index);
}
