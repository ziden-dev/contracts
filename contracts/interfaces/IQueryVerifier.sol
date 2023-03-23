// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

interface IQueryVerifier {
    function verifyProof(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[12] memory inputs
    ) external view returns (bool);

    function verifyBatch(
        uint256[] memory in_proof, // proof itself, length is 8 * num_proofs
        uint256[] memory proof_inputs, // public inputs, length is num_inputs * num_proofs
        uint256 num_proofs
    ) external view returns (bool r);
}
