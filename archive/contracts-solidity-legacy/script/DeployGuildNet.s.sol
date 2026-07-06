// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TaskCoordinator} from "../src/TaskCoordinator.sol";
import {GuildPermissions} from "../src/GuildPermissions.sol";

contract DeployGuildNet is Script {
    function run() external {
        vm.startBroadcast();

        AgentRegistry    registry    = new AgentRegistry();
        GuildPermissions perms       = new GuildPermissions();
        // coordinator EOA = the deployer; swap for a dedicated address in production
        TaskCoordinator  coordinator = new TaskCoordinator(address(registry), address(perms), msg.sender);

        console.log("AgentRegistry:    ", address(registry));
        console.log("GuildPermissions: ", address(perms));
        console.log("TaskCoordinator:  ", address(coordinator));
        console.log("Coordinator EOA:  ", msg.sender);

        vm.stopBroadcast();
    }
}
