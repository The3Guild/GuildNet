// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// ── AgentRegistry ─────────────────────────────────────────────────────────────
event AgentRegistered(address indexed agent, string capability, uint256 price);
event AgentUpdated(address indexed agent);
event AgentDeactivated(address indexed agent);

// ── GuildPermissions ──────────────────────────────────────────────────────────
event PermissionGranted(
    uint256 indexed permId,
    address indexed granter,
    address indexed grantee,
    uint256 allowance,
    uint256 expiry
);
event PermissionUsed(uint256 indexed permId, address indexed recipient, uint256 amount);
event PermissionRevoked(uint256 indexed permId, uint256 refund);

// ── TaskCoordinator ───────────────────────────────────────────────────────────
event TaskCreated(uint256 indexed taskId, address indexed requester, uint256 budget, uint256 permId);
event AgentHired(uint256 indexed taskId, address indexed agent, uint256 amount);
event TaskCompleted(uint256 indexed taskId, address indexed requester, uint256 refund);
