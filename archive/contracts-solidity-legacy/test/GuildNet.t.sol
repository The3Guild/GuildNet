// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TaskCoordinator} from "../src/TaskCoordinator.sol";
import {GuildPermissions} from "../src/GuildPermissions.sol";
import "../src/lib/Errors.sol";

contract GuildNetTest is Test {
    AgentRegistry    registry;
    TaskCoordinator  coordinator;
    GuildPermissions permissions;

    address coordEOA = makeAddr("coordinator");
    address user     = makeAddr("user");
    address research = makeAddr("research");
    address risk     = makeAddr("risk");
    address report   = makeAddr("report");

    function setUp() public {
        registry    = new AgentRegistry();
        permissions = new GuildPermissions();
        coordinator = new TaskCoordinator(address(registry), address(permissions), coordEOA);

        vm.prank(research);
        registry.register("https://research.venice.ai", "research", 0.01 ether);
        vm.prank(risk);
        registry.register("https://risk.venice.ai", "risk", 0.01 ether);
        vm.prank(report);
        registry.register("https://report.venice.ai", "report", 0.01 ether);

        vm.deal(user, 10 ether);
    }

    //  AgentRegistry 

    function test_register() public view {
        AgentRegistry.Agent memory a = registry.agents(research);
        assertEq(a.capability, "research");
        assertEq(a.pricePerTask, 0.01 ether);
        assertTrue(a.active);
    }

    function test_findByCapability() public view {
        address[] memory r = registry.findByCapability("research");
        assertEq(r.length, 1);
        assertEq(r[0], research);
    }

    function test_deactivate() public {
        vm.prank(research);
        registry.deactivate();
        assertFalse(registry.agents(research).active);
        assertEq(registry.findByCapability("research").length, 0);
    }

    function test_register_emptyCapabilityReverts() public {
        vm.expectRevert(EmptyCapability.selector);
        registry.register("https://x.ai", "", 0);
    }

    function test_update_notRegisteredReverts() public {
        vm.expectRevert(NotRegistered.selector);
        registry.update("https://x.ai", 1);
    }

    //  TaskCoordinator 

    function test_createAndHire() public {
        vm.prank(user);
        uint256 taskId = coordinator.createTask{value: 0.05 ether}("market-entry report", 1 days);

        uint256 before = research.balance;
        vm.prank(coordEOA);
        coordinator.hireAgent(taskId, research);
        assertEq(research.balance - before, 0.01 ether);
    }

    function test_onlyCoordinatorCanHire() public {
        vm.prank(user);
        uint256 taskId = coordinator.createTask{value: 0.05 ether}("task", 1 days);
        // user is not coordinator and not a registered agent → NotAuthorizedAgent
        vm.prank(user);
        vm.expectRevert(NotAuthorizedAgent.selector);
        coordinator.hireAgent(taskId, research);
    }

    /// @notice A2A: an active registered agent can hire a sub-agent; payment flows via ERC-7710.
    function test_agentCanHireSubAgent() public {
        vm.prank(user);
        uint256 taskId = coordinator.createTask{value: 0.05 ether}("a2a task", 1 days);

        // research agent hires the risk sub-agent — A2A hiring
        uint256 before = risk.balance;
        vm.prank(research);
        coordinator.hireAgent(taskId, risk);
        assertEq(risk.balance - before, 0.01 ether, "sub-agent not paid");

        // verify risk is recorded as assigned
        address[] memory assigned = coordinator.getAssignedAgents(taskId);
        assertEq(assigned.length, 1);
        assertEq(assigned[0], risk);
    }

    function test_completeTaskRefund() public {
        vm.prank(user);
        uint256 taskId = coordinator.createTask{value: 0.05 ether}("report task", 1 days);

        vm.startPrank(coordEOA);
        coordinator.hireAgent(taskId, research);
        coordinator.hireAgent(taskId, risk);
        coordinator.hireAgent(taskId, report);
        vm.stopPrank();

        uint256 before = user.balance;
        vm.prank(user);
        coordinator.completeTask(taskId);
        assertEq(user.balance - before, 0.02 ether);
    }

    function test_coordinatorCanCompleteTask() public {
        vm.prank(user);
        uint256 taskId = coordinator.createTask{value: 0.05 ether}("task", 1 days);
        vm.prank(coordEOA);
        coordinator.hireAgent(taskId, research);
        vm.prank(coordEOA);
        coordinator.completeTask(taskId);
        // second call must revert — proves task is marked completed
        vm.prank(coordEOA);
        vm.expectRevert(TaskAlreadyCompleted.selector);
        coordinator.completeTask(taskId);
    }

    function test_cannotHireSameAgentTwice() public {
        vm.prank(user);
        uint256 taskId = coordinator.createTask{value: 0.05 ether}("task", 1 days);
        vm.prank(coordEOA);
        coordinator.hireAgent(taskId, research);
        vm.prank(coordEOA);
        vm.expectRevert(AgentAlreadyPaid.selector);
        coordinator.hireAgent(taskId, research);
    }

    //  GuildPermissions (ERC-7710) 

    function test_grantAndUse() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 permId = permissions.grantPermission{value: 0.1 ether}(coordEOA, 0.1 ether, 1 hours);

        uint256 before = research.balance;
        vm.prank(coordEOA);
        permissions.usePermission(permId, payable(research), 0.03 ether);
        assertEq(research.balance - before, 0.03 ether);
    }

    function test_revokeRefunds() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 permId = permissions.grantPermission{value: 0.1 ether}(coordEOA, 0.1 ether, 1 hours);

        vm.prank(coordEOA);
        permissions.usePermission(permId, payable(research), 0.03 ether);

        uint256 before = user.balance;
        vm.prank(user);
        permissions.revokePermission(permId);
        assertEq(user.balance - before, 0.07 ether);
    }

    function test_granteeCanRevoke() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 permId = permissions.grantPermission{value: 0.1 ether}(coordEOA, 0.1 ether, 1 hours);

        uint256 before = user.balance;
        vm.prank(coordEOA);
        permissions.revokePermission(permId);
        assertEq(user.balance - before, 0.1 ether);
    }

    function test_expiredPermissionReverts() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 permId = permissions.grantPermission{value: 0.1 ether}(coordEOA, 0.1 ether, 1 hours);

        skip(2 hours);
        vm.prank(coordEOA);
        vm.expectRevert(PermissionExpired.selector);
        permissions.usePermission(permId, payable(research), 0.01 ether);
    }

    function test_allowanceMismatchReverts() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(AllowanceMismatch.selector);
        permissions.grantPermission{value: 0.05 ether}(coordEOA, 0.1 ether, 1 hours);
    }

    function test_exceedsAllowanceReverts() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 permId = permissions.grantPermission{value: 0.1 ether}(coordEOA, 0.1 ether, 1 hours);

        vm.prank(coordEOA);
        vm.expectRevert(ExceedsAllowance.selector);
        permissions.usePermission(permId, payable(research), 0.2 ether);
    }
}
