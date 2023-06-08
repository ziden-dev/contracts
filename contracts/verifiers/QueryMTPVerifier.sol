//
// Copyright 2017 Christian Reitwiessner
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// 2019 OKIMS
//      ported to solidity 0.6
//      fixed linter warnings
//      added requiere error messages
//
//
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "./SingleVerifier.sol";
import "./BatchVerifier.sol";

library Pairing {
    struct G1Point {
        uint X;
        uint Y;
    }
    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint[2] X;
        uint[2] Y;
    }
    /// @return the generator of G1
    function P1() internal pure returns (G1Point memory) {
        return G1Point(1, 2);
    }
    /// @return the generator of G2
    function P2() internal pure returns (G2Point memory) {
        // Original code point
        return G2Point(
            [11559732032986387107991004021392285783925812861821192530917403151452391805634,
             10857046999023057135944570762232829481370756359578518086990519993285655852781],
            [4082367875863433681332203403145435568316851327593401208105741076214120093531,
             8495653923123431417604973247489272438418190587263600148770280649306958101930]
        );

/*
        // Changed by Jordi point
        return G2Point(
            [10857046999023057135944570762232829481370756359578518086990519993285655852781,
             11559732032986387107991004021392285783925812861821192530917403151452391805634],
            [8495653923123431417604973247489272438418190587263600148770280649306958101930,
             4082367875863433681332203403145435568316851327593401208105741076214120093531]
        );
*/
    }
    /// @return r the negation of p, i.e. p.addition(p.negate()) should be zero.
    function negate(G1Point memory p) internal pure returns (G1Point memory r) {
        // The prime q in the base field F_q for G1
        uint q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
        if (p.X == 0 && p.Y == 0)
            return G1Point(0, 0);
        return G1Point(p.X, q - (p.Y % q));
    }
    /// @return r the sum of two points of G1
    function addition(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {
        uint[4] memory input;
        input[0] = p1.X;
        input[1] = p1.Y;
        input[2] = p2.X;
        input[3] = p2.Y;
        bool success;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }
        require(success,"pairing-add-failed");
    }
    /// @return r the product of a point on G1 and a scalar, i.e.
    /// p == p.scalar_mul(1) and p.addition(p) == p.scalar_mul(2) for all points p.
    function scalar_mul(G1Point memory p, uint s) internal view returns (G1Point memory r) {
        uint[3] memory input;
        input[0] = p.X;
        input[1] = p.Y;
        input[2] = s;
        bool success;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }
        require (success,"pairing-mul-failed");
    }
    /// @return the result of computing the pairing check
    /// e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
    /// For example pairing([P1(), P1().negate()], [P2(), P2()]) should
    /// return true.
    function pairing(G1Point[] memory p1, G2Point[] memory p2) internal view returns (bool) {
        require(p1.length == p2.length,"pairing-lengths-failed");
        uint elements = p1.length;
        uint inputSize = elements * 6;
        uint[] memory input = new uint[](inputSize);
        for (uint i = 0; i < elements; i++)
        {
            input[i * 6 + 0] = p1[i].X;
            input[i * 6 + 1] = p1[i].Y;
            input[i * 6 + 2] = p2[i].X[0];
            input[i * 6 + 3] = p2[i].X[1];
            input[i * 6 + 4] = p2[i].Y[0];
            input[i * 6 + 5] = p2[i].Y[1];
        }
        uint[1] memory out;
        bool success;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 8, add(input, 0x20), mul(inputSize, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }
        require(success,"pairing-opcode-failed");
        return out[0] != 0;
    }
    /// Convenience method for a pairing check for two pairs.
    function pairingProd2(G1Point memory a1, G2Point memory a2, G1Point memory b1, G2Point memory b2) internal view returns (bool) {
        G1Point[] memory p1 = new G1Point[](2);
        G2Point[] memory p2 = new G2Point[](2);
        p1[0] = a1;
        p1[1] = b1;
        p2[0] = a2;
        p2[1] = b2;
        return pairing(p1, p2);
    }
    /// Convenience method for a pairing check for three pairs.
    function pairingProd3(
            G1Point memory a1, G2Point memory a2,
            G1Point memory b1, G2Point memory b2,
            G1Point memory c1, G2Point memory c2
    ) internal view returns (bool) {
        G1Point[] memory p1 = new G1Point[](3);
        G2Point[] memory p2 = new G2Point[](3);
        p1[0] = a1;
        p1[1] = b1;
        p1[2] = c1;
        p2[0] = a2;
        p2[1] = b2;
        p2[2] = c2;
        return pairing(p1, p2);
    }
    /// Convenience method for a pairing check for four pairs.
    function pairingProd4(
            G1Point memory a1, G2Point memory a2,
            G1Point memory b1, G2Point memory b2,
            G1Point memory c1, G2Point memory c2,
            G1Point memory d1, G2Point memory d2
    ) internal view returns (bool) {
        G1Point[] memory p1 = new G1Point[](4);
        G2Point[] memory p2 = new G2Point[](4);
        p1[0] = a1;
        p1[1] = b1;
        p1[2] = c1;
        p1[3] = d1;
        p2[0] = a2;
        p2[1] = b2;
        p2[2] = c2;
        p2[3] = d2;
        return pairing(p1, p2);
    }
}
contract QueryMTPVerifier {
    using Pairing for *;
    using BatchVerifier for *;
    using SingleVerifier for *;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[] IC;
    }
    struct Proof {
        Pairing.G1Point A;
        Pairing.G2Point B;
        Pairing.G1Point C;
    }
    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(
            20491192805390485299153009773594534940189261866228447918068658471970481763042,
            9383485363053290200918347156157836566562967994039712273449902621266178545958
        );

        vk.beta2 = Pairing.G2Point(
            [4252822878758300859123897981450591353533073413197771768651442665752259397132,
             6375614351688725206403948262868962793625744043794305715222011528459656738731],
            [21847035105528745403288232691147584728191162732299865338377159692350059136679,
             10505242626370262277552901082094356697409835680220590971873171140371331206856]
        );
        vk.gamma2 = Pairing.G2Point(
            [11559732032986387107991004021392285783925812861821192530917403151452391805634,
             10857046999023057135944570762232829481370756359578518086990519993285655852781],
            [4082367875863433681332203403145435568316851327593401208105741076214120093531,
             8495653923123431417604973247489272438418190587263600148770280649306958101930]
        );
        vk.delta2 = Pairing.G2Point(
            [11559732032986387107991004021392285783925812861821192530917403151452391805634,
             10857046999023057135944570762232829481370756359578518086990519993285655852781],
            [4082367875863433681332203403145435568316851327593401208105741076214120093531,
             8495653923123431417604973247489272438418190587263600148770280649306958101930]
        );
        vk.IC = new Pairing.G1Point[](13);
        
        vk.IC[0] = Pairing.G1Point( 
            11017485503449351350604775315378543371474260329216770385440407516487676549634,
            11723314665405665057811075007168026666906085894566378974746841884764230181655
        );                                      
        
        vk.IC[1] = Pairing.G1Point( 
            19052156999320544858418938945773899614192724831487081691369490979728710230319,
            11043654416563268437160862937924935945303606172080548724293624394850402989668
        );                                      
        
        vk.IC[2] = Pairing.G1Point( 
            8351504180225870584757775491745857999249813907078328899527865927815447560254,
            9340514897067503712545015505563044012390654499558908453817064512228845622189
        );                                      
        
        vk.IC[3] = Pairing.G1Point( 
            19430055435097193960145198115787767407292243362079111098298426662574695749224,
            15647752308708702778449148093700087863914209224315539393212900205735403563303
        );                                      
        
        vk.IC[4] = Pairing.G1Point( 
            245367116859302809214679981269579377457604395249382654049151191265765476754,
            20347073199670761298928386073533321117478302425857492248708675245175483527631
        );                                      
        
        vk.IC[5] = Pairing.G1Point( 
            15477652944302996667822198969928131492710790056663887610773431860452749660940,
            15235341856658868611052311934488791370591157257650114757504561351996189207584
        );                                      
        
        vk.IC[6] = Pairing.G1Point( 
            9559048378850866161603650578250578255621282106709487658535758963146168432186,
            3935157042505518247314950020054546484349815663631121145481877886244807434044
        );                                      
        
        vk.IC[7] = Pairing.G1Point( 
            14974853430142397665855790018895695996025661955772163880090162859677128445758,
            18500939628626031602183479954400175119701238882120194860664709673173400953784
        );                                      
        
        vk.IC[8] = Pairing.G1Point( 
            2430352288133470648176104895749371477605223894798602992189291332901933468676,
            21519533851067553761688261585032724306580967579813725753247459330096296878902
        );                                      
        
        vk.IC[9] = Pairing.G1Point( 
            562876817334608916847298854706572451893459332755055809317806203236322002395,
            8194262028992666281090665001186376634386024195855009913385820974245480908416
        );                                      
        
        vk.IC[10] = Pairing.G1Point( 
            13806005804234147543274150638838097683941979244674288084128022110496665886859,
            5007733084408263867343529263886692843151940018823848929225654652327544222783
        );                                      
        
        vk.IC[11] = Pairing.G1Point( 
            8024900264415953694324486354316214999271989666216800492776318822880262473951,
            5850260958951631228792117548759470691891160503078459078152958783426993774679
        );                                      
        
        vk.IC[12] = Pairing.G1Point( 
            17977588295592477640791665619809662755463908332122774542671129719887045758382,
            14194775646404540541223404791727809830775665303960308562560110018476369220800
        );                                       
        
    }

        function verifyingKeyArray()
        internal
        pure
        returns (uint256[14] memory in_vk, uint256[] memory vk_gammaABC)
    {
        VerifyingKey memory vk = verifyingKey();

        in_vk[0] = vk.alfa1.X;
        in_vk[1] = vk.alfa1.Y;
        in_vk[2] = vk.beta2.X[0];
        in_vk[3] = vk.beta2.X[1];
        in_vk[4] = vk.beta2.Y[0];
        in_vk[5] = vk.beta2.Y[1];
        in_vk[6] = vk.gamma2.X[0];
        in_vk[7] = vk.gamma2.X[1];
        in_vk[8] = vk.gamma2.Y[0];
        in_vk[9] = vk.gamma2.Y[1];
        in_vk[10] = vk.delta2.X[0];
        in_vk[11] = vk.delta2.X[1];
        in_vk[12] = vk.delta2.Y[0];
        in_vk[13] = vk.delta2.Y[1];

        vk_gammaABC = new uint256[](vk.IC.length * 2);
        for (uint256 i = 0; i < vk.IC.length; i++) {
            vk_gammaABC[2 * i] = vk.IC[i].X;
            vk_gammaABC[2 * i + 1] = vk.IC[i].Y;
        }
    }

    function verify(uint[] memory input, Proof memory proof) internal view returns (uint) {
        uint256 snark_scalar_field = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
        VerifyingKey memory vk = verifyingKey();
        require(input.length + 1 == vk.IC.length,"verifier-bad-input");
        // Compute the linear combination vk_x
        Pairing.G1Point memory vk_x = Pairing.G1Point(0, 0);
        for (uint i = 0; i < input.length; i++) {
            require(input[i] < snark_scalar_field,"verifier-gte-snark-scalar-field");
            vk_x = Pairing.addition(vk_x, Pairing.scalar_mul(vk.IC[i + 1], input[i]));
        }
        vk_x = Pairing.addition(vk_x, vk.IC[0]);
        if (!Pairing.pairingProd4(
            Pairing.negate(proof.A), proof.B,
            vk.alfa1, vk.beta2,
            vk_x, vk.gamma2,
            proof.C, vk.delta2
        )) return 1;
        return 0;
    }
    /// @return r  bool true if proof is valid
    function verifyProof(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[12] memory input
        ) public view returns (bool r) {
        Proof memory proof;
        proof.A = Pairing.G1Point(a[0], a[1]);
        proof.B = Pairing.G2Point([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        proof.C = Pairing.G1Point(c[0], c[1]);
        uint[] memory inputValues = new uint[](input.length);
        for(uint i = 0; i < input.length; i++){
            inputValues[i] = input[i];
        }
        if (verify(inputValues, proof) == 0) {
            return true;
        } else {
            return false;
        }
    }

    /// @return r  bool true if proof is valid
    function verifyBatch(
        uint256[] memory in_proof, // proof itself, length is 8 * num_proofs
        uint256[] memory proof_inputs, // public inputs, length is num_inputs * num_proofs
        uint256 num_proofs
    ) public view returns (bool r) {
        (uint256[14] memory in_vk, uint256[] memory vk_gammaABC) = verifyingKeyArray();
        r = BatchVerifier.BatchVerify(in_vk, vk_gammaABC, in_proof, proof_inputs, num_proofs);
    }

    /// @return r  bool true if proof is valid
    function verifySingle(
        uint256[8] memory in_proof, uint256[] memory proof_inputs
    ) public view returns (bool r) {
        (uint256[14] memory in_vk, uint256[] memory vk_gammaABC) = verifyingKeyArray();
        r = SingleVerifier.Verify(in_vk, vk_gammaABC, in_proof, proof_inputs);
    }
}
