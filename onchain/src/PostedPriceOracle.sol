// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title PostedPriceOracle
/// @notice Prices posted by an authorized poster (the desk's price feed) with a heartbeat. A stale price
///         reverts every read, which makes the vault refuse to value or trade until a fresh one lands.
contract PostedPriceOracle is IPriceOracle, Ownable2Step {
    struct Quote {
        uint192 priceE18;
        uint64 updatedAt;
    }

    uint64 public maxAge;
    mapping(address => bool) public isPoster;
    mapping(address => Quote) public quotes;

    event PosterSet(address poster, bool allowed);
    event MaxAgeSet(uint64 maxAge);
    event Posted(address indexed token, uint256 priceE18, uint64 at);

    error NotPoster();
    error StalePrice(address token);
    error ZeroPrice();

    constructor(address owner_, uint64 maxAge_) Ownable(owner_) {
        maxAge = maxAge_;
        isPoster[owner_] = true;
    }

    function setPoster(address p, bool allowed) external onlyOwner {
        isPoster[p] = allowed;
        emit PosterSet(p, allowed);
    }

    function setMaxAge(uint64 a) external onlyOwner {
        maxAge = a;
        emit MaxAgeSet(a);
    }

    function post(address token, uint256 price) external {
        if (!isPoster[msg.sender]) revert NotPoster();
        if (price == 0) revert ZeroPrice();
        quotes[token] = Quote({priceE18: uint192(price), updatedAt: uint64(block.timestamp)});
        emit Posted(token, price, uint64(block.timestamp));
    }

    function postMany(address[] calldata tokens, uint256[] calldata prices) external {
        if (!isPoster[msg.sender]) revert NotPoster();
        for (uint256 i = 0; i < tokens.length; i++) {
            if (prices[i] == 0) revert ZeroPrice();
            quotes[tokens[i]] = Quote({priceE18: uint192(prices[i]), updatedAt: uint64(block.timestamp)});
            emit Posted(tokens[i], prices[i], uint64(block.timestamp));
        }
    }

    function priceE18(address token) external view returns (uint256) {
        Quote memory q = quotes[token];
        if (q.updatedAt == 0 || block.timestamp - q.updatedAt > maxAge) revert StalePrice(token);
        return q.priceE18;
    }
}
