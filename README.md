# contracts

## State
- This contract is incharge of storing and updating the current state of users (mostly for issuers). 
- When validators want to verify a proof, this contract is called to provide the relevant information (state of the issuer, state of the user, ...).
- To update the current state, user must send a proof to prove that the next state statisfy the state transition circuit.

## QueryMTPValidator
- Users using Merkle Tree Proof use this contract to verify their proof. 
- When verify, this contract first get the issuer and user state from State contract and compare them with the input. If they don't match then the proof is invalid. If the current state match with the input then the validator will call the QueryMTPVerifier to verify the correctness of the proof.

## QuerySigValidator
- Users using Signature Proof use this contract to verify their proof.
- Similar with the QueryMTPValidator, but instead of QueryMTPVerifier, this will call the QuerySigVerifier.

## QueryMTPVerifier
- This contract is automatically generated from the CredentialAtomicQueryMTP circuit by circom.
- It is used to verify QueryMTP zkp.

## QuerySigVerifier
- This contract is automatically generated from the CredentialAtomicQuerySig circuit by circom.
- It is used to verify QuerySig zkp.

## StateTransitionVerifier
- This contract is automatically generated from the StateTransition circuit by circom.
- It is used to verify StateTransition zkp.
