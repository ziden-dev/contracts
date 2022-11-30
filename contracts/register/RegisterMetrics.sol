// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "../interfaces/IValidator.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract RegisterMetrics is Ownable {
    using Counters for Counters.Counter;

    struct AllowedQuery {
        uint256 compactInput;
        uint256 mask;
        string circuitId;
        uint256 issuerId;
        uint256 factor;
    }

    constructor(
        address _mtpValidator,
        uint256 _fromTimestamp,
        uint256 _toTimestamp
    ) Ownable() {
        mtpValidator = IValidator(_mtpValidator);
        fromTimestamp = _fromTimestamp;
        toTimestamp = _toTimestamp;
    }

    uint256 public fromTimestamp;
    uint256 public toTimestamp;
    IValidator public mtpValidator;

    // query id => Allowed Query
    mapping(uint256 => AllowedQuery) private _allowedQueries;

    // query id => is query disabled
    mapping(uint256 => bool) private _queryDisabled;

    Counters.Counter private _currentAllowedQueryId;

    // userId => queryId => isRegistered;
    mapping(uint256 => mapping(uint256 => bool)) private _isRegistered;

    // voter => queryId => registered amount
    mapping(address => mapping(uint256 => uint256)) private _registeredAmount;

    // voter => voting power
    mapping(address => uint256) private _votingPower;

    uint256 public totalVotingPower;

    event NewAllowedQuery(uint256);
    event StatusUpdated(uint256, bool);
    event Registered(uint256, uint256, uint256, address indexed);

    function setMTPValidator(address _mtpValidator) external onlyOwner {
        mtpValidator = IValidator(_mtpValidator);
    }

    function setFromTimestamp(uint256 _fromTimestamp) external onlyOwner {
        fromTimestamp = _fromTimestamp;
    }

    function setToTimestamp(uint256 _toTimestamp) external onlyOwner {
        toTimestamp = _toTimestamp;
    }

    function getNumOfAllowedQueries() external view returns (uint256) {
        return _currentAllowedQueryId.current();
    }

    function isQueryDisabled(uint256 queryId) external view returns (bool) {
        return _queryDisabled[queryId];
    }

    function getAllowedQuery(uint256 queryId)
        external
        view
        returns (AllowedQuery memory)
    {
        return _allowedQueries[queryId];
    }

    function addAllowedQuery(AllowedQuery memory query) external onlyOwner {
        uint256 queryId = _currentAllowedQueryId.current();
        _allowedQueries[queryId] = query;
        _currentAllowedQueryId.increment();
        emit NewAllowedQuery(queryId);
    }

    function setAllowedQueryStatus(uint256 queryId, bool status)
        external
        onlyOwner
    {
        _queryDisabled[queryId] = status;
        emit StatusUpdated(queryId, status);
    }

    function isRegistered(uint256 userId, uint256 queryId)
        external
        view
        returns (bool)
    {
        return _isRegistered[userId][queryId];
    }

    function getRegisteredAmount(address voter, uint256 queryId)
        external
        view
        returns (uint256)
    {
        return _registeredAmount[voter][queryId];
    }

    function getVotingPower(address voter) external view returns (uint256) {
        return _votingPower[voter];
    }

    function register(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory pubSigs,
        uint256 queryId
    ) external {
        address voter = address(uint160(pubSigs[2]));
        uint256 userId = pubSigs[0];

        require(
            queryId < _currentAllowedQueryId.current(),
            "Ziden Register Metrics: queryId is out of range"
        );
        require(
            !_queryDisabled[queryId],
            "Ziden Register Metrics: query is disabled"
        );
        require(
            !_isRegistered[userId][queryId],
            "Ziden Register Metrics: query is registered"
        );

        AllowedQuery memory allowedQuery = _allowedQueries[queryId];

        uint256 issuerId = pubSigs[4];
        require(
            issuerId == allowedQuery.issuerId,
            "Ziden Register Metrics: issuerId is not matched"
        );

        IValidator.DurationQuery memory query;
        query.deterministicValue = pubSigs[7];
        query.compactInput = allowedQuery.compactInput;
        query.mask = allowedQuery.mask;
        query.circuitId = allowedQuery.circuitId;
        query.fromTimestamp = fromTimestamp;
        query.toTimestamp = toTimestamp;

        uint256 oldAmount = _registeredAmount[voter][queryId];
        _registeredAmount[voter][queryId] = query.deterministicValue;

        uint256 oldVotingPower = oldAmount * allowedQuery.factor;
        uint256 newVotingPower = query.deterministicValue * allowedQuery.factor;

        _votingPower[voter] =
            _votingPower[voter] -
            oldVotingPower +
            newVotingPower;

        totalVotingPower = totalVotingPower - oldVotingPower + newVotingPower;

        require(
            mtpValidator.verifyInDuration(a, b, c, pubSigs, query),
            "Ziden Register Metrics: Invalid query MTP proof"
        );

        _isRegistered[userId][queryId] = true;

        emit Registered(userId, queryId, query.deterministicValue, voter);
    }
}
