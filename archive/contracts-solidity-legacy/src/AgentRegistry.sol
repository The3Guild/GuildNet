// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./lib/Events.sol";
import "./lib/Errors.sol";

/// @title AgentRegistry — on-chain directory of agents, capabilities, and pricing
contract AgentRegistry {

    //  State 
    struct Agent {
        address payable wallet;
        string  endpoint;
        string  capability;
        uint256 pricePerTask;
        bool    active;
    }

    mapping(address => Agent) internal _agents;
    address[] public agentList;

    //  Views 
    function agents(address a) external view returns (Agent memory) {
        return _agents[a];
    }

    function totalAgents() external view returns (uint256) {
        return agentList.length;
    }

    /// @notice Returns all active agents matching a capability string.
    function findByCapability(string calldata capability) external view returns (address[] memory) {
        bytes32 cap = keccak256(bytes(capability));
        uint256 count;
        for (uint256 i; i < agentList.length; i++) {
            if (_agents[agentList[i]].active && keccak256(bytes(_agents[agentList[i]].capability)) == cap) {
                count++;
            }
        }
        address[] memory result = new address[](count);
        uint256 j;
        for (uint256 i; i < agentList.length; i++) {
            if (_agents[agentList[i]].active && keccak256(bytes(_agents[agentList[i]].capability)) == cap) {
                result[j++] = agentList[i];
            }
        }
        return result;
    }

    //  Mutations 
    function register(string calldata endpoint, string calldata capability, uint256 pricePerTask) external {
        if (bytes(capability).length == 0) revert EmptyCapability();
        if (_agents[msg.sender].wallet == address(0)) {
            agentList.push(msg.sender);
        }
        _agents[msg.sender] = Agent(payable(msg.sender), endpoint, capability, pricePerTask, true);
        emit AgentRegistered(msg.sender, capability, pricePerTask);
    }

    function update(string calldata endpoint, uint256 pricePerTask) external {
        if (!_agents[msg.sender].active) revert NotRegistered();
        _agents[msg.sender].endpoint     = endpoint;
        _agents[msg.sender].pricePerTask = pricePerTask;
        emit AgentUpdated(msg.sender);
    }

    function deactivate() external {
        _agents[msg.sender].active = false;
        emit AgentDeactivated(msg.sender);
    }
}
