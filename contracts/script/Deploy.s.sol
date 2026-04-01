// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/UsageToken.sol";
import "../src/ChallengeEscrow.sol";

contract Deploy is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        address serverWallet = vm.envAddress("SERVER_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy ERC-1155 multi-tier AI token
        UsageToken token = new UsageToken(usdc);
        console.log("UsageToken (ERC-1155) deployed at:", address(token));
        console.log("  HAIKU  (id=1): $0.01/token");
        console.log("  SONNET (id=2): $0.05/token");
        console.log("  OPUS   (id=3): $0.25/token");

        // 2. Deploy escrow for token-staked challenges
        ChallengeEscrow escrow = new ChallengeEscrow(address(token), serverWallet);
        console.log("ChallengeEscrow deployed at:", address(escrow));
        console.log("  Oracle judge wallet (onlyJudge):", serverWallet);

        // 3. Authorize server as burner; escrow pulls stakes
        token.setAuthorizedBurner(serverWallet, true);
        token.setAuthorizedBurner(address(escrow), true);

        console.log("Server authorized:", serverWallet);

        vm.stopBroadcast();
    }
}
