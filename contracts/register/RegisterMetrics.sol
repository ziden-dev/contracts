// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "../interfaces/IValidator.sol";
import "../interfaces/IState.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract RegisterMetrics is Ownable {
    using Counters for Counters.Counter;

    struct AllowedQuery {
        uint256 issuerId;
        uint256 factor;
        uint128 claimSchema;
        uint16 from;
        uint16 to;
        uint8 slotIndex;
    }

    constructor(address _mtpValidator, address _state) Ownable() {
        mtpValidator = IValidator(_mtpValidator);
        state = IState(_state);
    }

    IValidator public mtpValidator;
    IState public state;

    // query id => Allowed Query
    mapping(uint256 => AllowedQuery) public allowedQueries;

    // query id => is query disabled
    mapping(uint256 => bool) public queryDisabled;

    Counters.Counter private _currentAllowedQueryId;

    event NewAllowedQuery(uint256);
    event StatusUpdated(uint256, bool);

    function setMTPValidator(address _mtpValidator) external onlyOwner {
        mtpValidator = IValidator(_mtpValidator);
    }

    function setState(address _state) external onlyOwner {
        state = IState(_state);
    }

    function addAllowedQueries(AllowedQuery memory query) external onlyOwner {
        uint256 queryId = _currentAllowedQueryId.current();
        allowedQueries[queryId] = query;
        _currentAllowedQueryId.increment();
        emit NewAllowedQuery(queryId);
    }

    function toggleAllowedQueries(uint256 queryId) external onlyOwner {
        require(
            queryId < _currentAllowedQueryId.current(),
            "Ziden Register Metrics: queryId is out of range"
        );
        queryDisabled[queryId] = !queryDisabled[queryId];
        emit StatusUpdated(queryId, queryDisabled[queryId]);
    }

    function getNumOfAllowedQueries() external view returns (uint256) {
        return _currentAllowedQueryId.current();
    }

    function getVotingPower(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[12] memory pubSigs,
        uint256 queryId,
        uint64 fromTimestamp,
        uint64 toTimestamp
    ) external view returns (uint256) {

        require(
            queryId < _currentAllowedQueryId.current(),
            "Ziden Register Metrics: queryId is out of range"
        );
        require(
            !queryDisabled[queryId],
            "Ziden Register Metrics: query is disabled"
        );

        AllowedQuery memory allowedQuery = allowedQueries[queryId];

        uint256 issuerId = pubSigs[4];
        require(
            issuerId == allowedQuery.issuerId,
            "Ziden Register Metrics: issuerId is not matched"
        );

        IValidator.Query memory query;
        query.deterministicValue = pubSigs[10];
        query.timestamp = uint64(pubSigs[6]);
        query.mask = getMask(allowedQuery.from, allowedQuery.to);
        query.slotIndex = allowedQuery.slotIndex;
        query.claimSchema = allowedQuery.claimSchema;

        require(
            pubSigs[9] == 3,
            "register contract only supports GREATER_THAN operator"
        );
        query.operator = 3;

        (, uint256 createAtTimestamp, , , , ) = state.getTransitionInfo(
            pubSigs[3]
        );
        if (createAtTimestamp > fromTimestamp) {
            return 0;
        }
        if (query.timestamp < toTimestamp) {
            return 0;
        }
        (uint256 replaceAtTimestamp, , , , , ) = state.getTransitionInfo(
            pubSigs[5]
        );
        if (replaceAtTimestamp != 0 && replaceAtTimestamp < toTimestamp) {
            return 0;
        }

        require(
            mtpValidator.verify(a, b, c, pubSigs, query),
            "Ziden Register Metrics: Invalid query MTP proof"
        );

        return (query.deterministicValue >> allowedQuery.from) * allowedQuery.factor;
    }

    function getMask(uint16 from, uint16 to) internal pure returns(uint256){
        require(to > from && to < 256, "invalid offsets");
        return ((1 << (to - from)) - 1) << from;
    }
}
