// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title DeskRegistry
/// @notice Append-only, chain-stamped attestations for a desk: NAV, realized PnL and a snapshot hash per
///         epoch. Refusals and vetoes go on this record too, and nothing on it can be edited or pruned.
contract DeskRegistry {
    struct Attestation {
        uint64 epoch;
        uint64 timestamp;
        uint256 nav;
        int256 realizedPnl;
        bytes32 snapshotHash;
        string uri;
    }

    mapping(bytes32 => Attestation[]) private _log;
    mapping(bytes32 => address) public attesterOf; // subject => delegated attester (besides the owner)

    event Attested(
        bytes32 indexed subject,
        uint256 indexed index,
        uint64 epoch,
        uint256 nav,
        int256 realizedPnl,
        bytes32 snapshotHash,
        string uri
    );
    event AttesterSet(bytes32 indexed subject, address attester);

    error NotAuthorized();

    /// @notice A subject is owned by whoever derives it: keccak(owner, salt).
    function subjectFor(address owner, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(owner, salt));
    }

    /// @notice Let `attester` also write to the subject you own under `salt`.
    function setAttester(bytes32 salt, address attester) external {
        bytes32 subject = subjectFor(msg.sender, salt);
        attesterOf[subject] = attester;
        emit AttesterSet(subject, attester);
    }

    /// @notice Attest as the subject's owner.
    function attest(
        bytes32 salt,
        uint64 epoch,
        uint256 nav,
        int256 realizedPnl,
        bytes32 snapshotHash,
        string calldata uri
    ) external returns (uint256 index) {
        return _append(subjectFor(msg.sender, salt), epoch, nav, realizedPnl, snapshotHash, uri);
    }

    /// @notice Attest as a delegated attester for `subject`.
    function attestAs(
        bytes32 subject,
        uint64 epoch,
        uint256 nav,
        int256 realizedPnl,
        bytes32 snapshotHash,
        string calldata uri
    ) external returns (uint256 index) {
        if (attesterOf[subject] != msg.sender) revert NotAuthorized();
        return _append(subject, epoch, nav, realizedPnl, snapshotHash, uri);
    }

    function count(bytes32 subject) external view returns (uint256) {
        return _log[subject].length;
    }

    function at(bytes32 subject, uint256 index) external view returns (Attestation memory) {
        return _log[subject][index];
    }

    function latest(bytes32 subject) external view returns (Attestation memory a) {
        uint256 n = _log[subject].length;
        if (n != 0) a = _log[subject][n - 1];
    }

    function _append(
        bytes32 subject,
        uint64 epoch,
        uint256 nav,
        int256 realizedPnl,
        bytes32 snapshotHash,
        string calldata uri
    ) internal returns (uint256 index) {
        index = _log[subject].length;
        _log[subject].push(
            Attestation({
                epoch: epoch,
                timestamp: uint64(block.timestamp),
                nav: nav,
                realizedPnl: realizedPnl,
                snapshotHash: snapshotHash,
                uri: uri
            })
        );
        emit Attested(subject, index, epoch, nav, realizedPnl, snapshotHash, uri);
    }
}
