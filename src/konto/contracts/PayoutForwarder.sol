// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
pragma solidity ^0.8.20;

// The payout path of goals/konto/05 (docs/konto/euro.md, "Weiterleitung").
//
// A spend permission pays only its spender, and only the spender may call spend(). The spender of the second permission a
// person signs on the phone is this contract: it has no admin and no function that changes anything it was built with. Its
// only target on-chain is `destination`, the fixed payout address of the person at Bridge. `caller` is the address of the gas
// key of the control plane, so nobody else can empty the account past what the person wants to keep, and even that key can
// pay only to `destination`. Deployed with CREATE2 through 0x4e59b44847b379578588920ca78fbf26c0b4956c with salt 0, so its
// address follows from these five values (forwarderAddress in src/konto/payout.ts).

struct SpendPermission {
    address account;
    address spender;
    address token;
    uint160 allowance;
    uint48 period;
    uint48 start;
    uint48 end;
    uint256 salt;
    bytes extraData;
}

interface ISpendPermissionManager {
    function spend(SpendPermission calldata spendPermission, uint160 value) external;
    function revokeAsSpender(SpendPermission calldata spendPermission) external;
}

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

contract PayoutForwarder {
    address private immutable fixedAccount;
    address private immutable fixedDestination;
    address private immutable fixedToken;
    address private immutable fixedManager;
    address private immutable fixedCaller;

    constructor(address account, address destination, address token, address manager, address caller) {
        fixedAccount = account;
        fixedDestination = destination;
        fixedToken = token;
        fixedManager = manager;
        fixedCaller = caller;
    }

    function account() public view returns (address) {
        return fixedAccount;
    }

    function destination() public view returns (address) {
        return fixedDestination;
    }

    function token() public view returns (address) {
        return fixedToken;
    }

    function manager() public view returns (address) {
        return fixedManager;
    }

    function caller() public view returns (address) {
        return fixedCaller;
    }

    // Takes `value` from the account with the permission and sends it on to `destination` in the same call.
    function payout(SpendPermission calldata p, uint160 value) external {
        require(msg.sender == caller(), "only the fixed caller");
        require(p.account == fixedAccount, "wrong account");
        require(p.spender == address(this), "wrong spender");
        require(p.token == fixedToken, "wrong token");
        ISpendPermissionManager(fixedManager).spend(p, value);
        require(IERC20(fixedToken).transfer(fixedDestination, value), "transfer failed");
    }

    // Ends the permission, for a new bank account: after this no spend() from it goes through.
    function retire(SpendPermission calldata p) external {
        require(msg.sender == caller(), "only the fixed caller");
        ISpendPermissionManager(fixedManager).revokeAsSpender(p);
    }

    // Whatever reached this contract by any other way goes to `destination` as well; anybody may call it.
    function flush() external {
        uint256 balance = IERC20(fixedToken).balanceOf(address(this));
        if (balance > 0) require(IERC20(fixedToken).transfer(fixedDestination, balance), "transfer failed");
    }
}
