// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Harness mock for USDC on Base: ERC-20 with EIP-3009 transferWithAuthorization and the EIP-712
 * domain the runtime client signs ("USD Coin", version "2", chainId, this). It is placed at the
 * mainnet address via anvil_setCode, hence no constructor and no immutables: the domain separator
 * is computed at runtime. mint() is deliberately open.
 */
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    string public constant version = "2";

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    uint256 public totalSupply;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes(name)), keccak256(bytes(version)), block.chainid, address(this)));
    }

    function mint(address to, uint256 value) external {
        balanceOf[to] += value;
        totalSupply += value;
        emit Transfer(address(0), to, value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "insufficient allowance");
        allowance[from][msg.sender] = allowed - value;
        _transfer(from, to, value);
        return true;
    }

    function transferWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        _transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v));
    }

    function transferWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        bytes memory signature
    ) external {
        _transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, signature);
    }

    function _transferWithAuthorization(
        address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce,
        bytes memory signature
    ) internal {
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!authorizationState[from][nonce], "FiatTokenV2: authorization is used or canceled");
        bytes32 structHash = keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
        require(_recover(digest, signature) == from, "FiatTokenV2: invalid signature");
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }

    function _recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65, "ECRecover: invalid signature length");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "ECRecover: invalid signature 'v' value");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "ECRecover: invalid signature");
        return signer;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ERC20: transfer to the zero address");
        uint256 bal = balanceOf[from];
        require(bal >= value, "ERC20: transfer amount exceeds balance");
        balanceOf[from] = bal - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
