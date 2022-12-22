// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

interface IRegister {
    struct AllowedQuery {
        uint256 issuerId;
        uint256 factor;
        uint128 claimSchema;
        uint16 from;
        uint16 to;
        uint8 slotIndex;
    }

    function allowedQueries(uint256 queryId)
        external
        view
        returns (AllowedQuery memory);

    function queryDisabled(uint256 queryId) external view returns (bool);

    function getVotingPower(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[12] memory pubSigs,
        uint256 queryId,
        uint64 fromTimestamp,
        uint64 toTimestamp
    ) external view returns (uint256);
}
