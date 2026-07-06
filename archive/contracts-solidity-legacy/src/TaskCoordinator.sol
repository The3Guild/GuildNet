// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {AgentRegistry} from "./AgentRegistry.sol";
import {GuildPermissions} from "./GuildPermissions.sol";
import "./lib/Events.sol";
import "./lib/Errors.sol";

/// @title TaskCoordinator — coordinates agent hiring and payment routing
contract TaskCoordinator {

    // ── State ─────────────────────────────────────────────────────────────────
    AgentRegistry    public immutable registry;
    GuildPermissions public immutable permissions;
    address          public immutable coordinator;

    struct Task {
        address requester;
        string  description;
        uint256 budget;
        uint256 permId;
        address[] assignedAgents;
        mapping(address => bool) paid;
        bool completed;
    }

    uint256 public taskCount;
    mapping(uint256 => Task) public tasks;

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert NotCoordinator();
        _;
    }

    /// @dev Allows the coordinator EOA or any active registered agent to hire sub-agents.
    modifier onlyCoordinatorOrAgent() {
        if (msg.sender != coordinator) {
            AgentRegistry.Agent memory caller = registry.agents(msg.sender);
            if (!caller.active) revert NotAuthorizedAgent();
        }
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _registry, address _permissions, address _coordinator) {
        registry    = AgentRegistry(_registry);
        permissions = GuildPermissions(_permissions);
        coordinator = _coordinator;
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    /// @notice User creates a task; budget is escrowed in GuildPermissions (ERC-7710).
    function createTask(string calldata description, uint256 duration) external payable returns (uint256) {
        if (msg.value == 0) revert ZeroBudget();

        // Escrow budget as an ERC-7710 spend permission granted to this contract
        uint256 permId = permissions.grantPermission{value: msg.value}(address(this), msg.value, duration);

        uint256 taskId    = taskCount++;
        Task storage t    = tasks[taskId];
        t.requester       = msg.sender;
        t.description     = description;
        t.budget          = msg.value;
        t.permId          = permId;

        emit TaskCreated(taskId, msg.sender, msg.value, permId);
        return taskId;
    }

    /// @notice Coordinator or any active registered agent hires a sub-agent (A2A hiring).
    ///         Payment flows via ERC-7710 usePermission (x402).
    function hireAgent(uint256 taskId, address agent) external onlyCoordinatorOrAgent {
        Task storage t = tasks[taskId];
        if (t.completed)      revert TaskAlreadyCompleted();
        if (t.paid[agent])    revert AgentAlreadyPaid();

        AgentRegistry.Agent memory a = registry.agents(agent);
        if (!a.active)                    revert AgentInactive();
        if (t.budget < a.pricePerTask)    revert InsufficientBudget();

        t.paid[agent] = true;
        t.assignedAgents.push(agent);
        t.budget -= a.pricePerTask;

        permissions.usePermission(t.permId, a.wallet, a.pricePerTask);

        emit AgentHired(taskId, agent, a.pricePerTask);
    }

    /// @notice Requester or coordinator completes task; revokes permission and refunds unspent budget.
    function completeTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        if (msg.sender != t.requester && msg.sender != coordinator) revert NotAuthorized();
        if (t.completed) revert TaskAlreadyCompleted();
        t.completed = true;

        uint256 refund;
        if (t.budget > 0) {
            uint256 before = address(this).balance;
            permissions.revokePermission(t.permId);
            refund   = address(this).balance - before;
            t.budget = 0;
            if (refund > 0) {
                (bool ok,) = payable(t.requester).call{value: refund}("");
                if (!ok) revert RefundFailed();
            }
        }

        emit TaskCompleted(taskId, t.requester, refund);
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function getAssignedAgents(uint256 taskId) external view returns (address[] memory) {
        return tasks[taskId].assignedAgents;
    }

    receive() external payable {}
}
