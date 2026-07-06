// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./lib/Events.sol";
import "./lib/Errors.sol";

/// @title GuildPermissions — ERC-7710-inspired spend permission delegation
contract GuildPermissions {

    // State 
    struct Permission {
        address granter;
        address grantee;
        uint256 allowance;
        uint256 spent;
        uint256 expiry;
        bool    revoked;
    }

    uint256 public permCount;
    mapping(uint256 => Permission) public permissions;
    mapping(address => uint256[]) public granteePerms;

    //  Views 
    function getGranteePerms(address grantee) external view returns (uint256[] memory) {
        return granteePerms[grantee];
    }

    //  Mutations 
    /// @notice Escrows ETH and creates a spend permission for `grantee`.
    function grantPermission(address grantee, uint256 allowance, uint256 duration)
        external
        payable
        returns (uint256)
    {
        if (msg.value != allowance) revert AllowanceMismatch();
        uint256 permId = permCount++;
        uint256 expiry = block.timestamp + duration;
        permissions[permId] = Permission(msg.sender, grantee, allowance, 0, expiry, false);
        granteePerms[grantee].push(permId);
        emit PermissionGranted(permId, msg.sender, grantee, allowance, expiry);
        return permId;
    }

    /// @notice Grantee spends from the permission, transferring ETH to `recipient`.
    function usePermission(uint256 permId, address payable recipient, uint256 amount) external {
        Permission storage p = permissions[permId];
        if (msg.sender != p.grantee)          revert NotGrantee();
        if (p.revoked)                         revert PermissionAlreadyRevoked();
        if (block.timestamp > p.expiry)        revert PermissionExpired();
        if (p.spent + amount > p.allowance)    revert ExceedsAllowance();

        p.spent += amount;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit PermissionUsed(permId, recipient, amount);
    }

    /// @notice Granter or grantee revokes the permission; unspent ETH returned to granter.
    function revokePermission(uint256 permId) external {
        Permission storage p = permissions[permId];
        if (msg.sender != p.granter && msg.sender != p.grantee) revert NotAuthorized();
        if (p.revoked) revert AlreadyRevoked();
        p.revoked = true;
        uint256 refund = p.allowance - p.spent;
        if (refund > 0) {
            (bool ok,) = payable(p.granter).call{value: refund}("");
            if (!ok) revert TransferFailed();
        }
        emit PermissionRevoked(permId, refund);
    }
}
