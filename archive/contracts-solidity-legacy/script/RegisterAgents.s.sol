// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

/// @notice Registers 5 agents using derived keys (index 0-4 from the deployer mnemonic).
///         Each agent is a separate EOA so they each have a unique address in the registry.
contract RegisterAgents is Script {
    AgentRegistry constant REGISTRY = AgentRegistry(0xac36F9147F3B49c767FFf3B4082D3D08a1396bE4);

    struct AgentDef {
        string endpoint;
        string capability;
        uint256 price;
    }

    function run() external {
        AgentDef[5] memory agentDefs = [
            AgentDef("https://api.venice.ai/api/v1", "research", 0.01 ether),
            AgentDef("https://api.venice.ai/api/v1", "risk",     0.01 ether),
            AgentDef("https://api.venice.ai/api/v1", "report",   0.01 ether),
            AgentDef("https://api.venice.ai/api/v1", "coding",   0.02 ether),
            AgentDef("https://api.venice.ai/api/v1", "design",   0.01 ether)
        ];

        // Derive 5 separate agent keys from env AGENT_MNEMONIC (or fall back to indexed private keys)
        for (uint32 i = 0; i < 5; i++) {
            uint256 agentKey = vm.deriveKey(vm.envString("AGENT_MNEMONIC"), i);
            vm.startBroadcast(agentKey);
            REGISTRY.register(agentDefs[i].endpoint, agentDefs[i].capability, agentDefs[i].price);
            console.log("Registered:", agentDefs[i].capability, "->", vm.addr(agentKey));
            vm.stopBroadcast();
        }

        console.log("Total agents:", REGISTRY.totalAgents());
    }
}
