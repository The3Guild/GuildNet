// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// ── AgentRegistry ─────────────────────────────────────────────────────────────
error EmptyCapability();
error NotRegistered();

// ── GuildPermissions ──────────────────────────────────────────────────────────
error AllowanceMismatch();
error NotGrantee();
error PermissionAlreadyRevoked();
error PermissionExpired();
error ExceedsAllowance();
error AlreadyRevoked();

// ── TaskCoordinator ───────────────────────────────────────────────────────────
error ZeroBudget();
error NotCoordinator();
error NotAuthorized();
error NotAuthorizedAgent();   // caller is neither coordinator nor a registered active agent
error TaskAlreadyCompleted();
error AgentAlreadyPaid();
error AgentInactive();
error InsufficientBudget();

// ── Shared ────────────────────────────────────────────────────────────────────
error TransferFailed();
error RefundFailed();
