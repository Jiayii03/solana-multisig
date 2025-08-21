# Project Description

**Deployed Frontend URL:** https://www.buidll.xyz
                           
**Solana Program ID:** E2Qi8w3Fz3SduddbegzS1SVAjogPae6AceUGmTwkCRez

## Project Overview

### Description
A simple yet complete decentralized multisig wallet application built on Solana Devnet using the Anchor framework. This dApp enables multiple users to collectively manage shared funds through a threshold-based approval system. Each multisig wallet requires a predetermined number of owner signatures to execute transactions, and an expiry time after which the transaction can no longer be approved.

### Key Features
- **Create Multisig Wallet**: Initialize a new multisig wallet with 2-10 owners, customizable threshold and expiry time.
- **Propose Transaction**: Any owner can propose SOL transfers with expiration times
- **Approve Transaction**: Owners can approve pending proposals with visual feedback
- **Execute Transaction**: Execute approved transactions when threshold is met
- **Cancel Transaction**: Owners can cancel pending proposals before execution
- **Real-time Updates**: Live proposal tracking and wallet balance monitoring

### How to Use the dApp
1. **Connect Wallet** - Connect your Solana wallet (Phantom, Solflare, etc.)
2. **Create Multisig Wallet** - Enter owner addresses and set approval threshold (2-10 owners)
3. **Manage Wallet** - Switch to the management tab to view wallet info and pending proposals
4. **Propose Transaction** - Enter amount, recipient address, and expiration time for new transfers
5. **Approve Proposals** - Review and approve pending transactions from other owners
6. **Execute Transactions** - Execute approved proposals that meet the threshold requirement
7. **View Transaction History** - Track all transactions via integrated Solscan links

## Program Architecture
The multisig wallet leverages Anchor's powerful framework with two main account types and five core instructions. The program uses Program Derived Addresses (PDAs) for deterministic wallet and proposal addressing, ensuring security and preventing unauthorized access. The architecture supports up to 10 owners per wallet with flexible threshold configurations.

### PDA Usage
The program implements a dual-PDA system for secure and deterministic addressing.

**PDAs Used:**
- **Multisig Wallet PDA**: Derived from seeds `["multisig_wallet", payer_pubkey]` - ensures each payer can create exactly one wallet and provides deterministic addressing for wallet discovery
- **Transaction Proposal PDA**: Derived from seeds `["transaction_proposal", wallet_pubkey, nonce_bytes]` - creates unique addresses for each proposal using the wallet's incrementing nonce, preventing proposal conflicts and enabling efficient lookup

### Program Instructions
**Instructions Implemented:**
- **create_wallet**: Initializes a new multisig wallet with specified owners and threshold, validates owner count (2-10) and threshold boundaries
- **propose_transaction**: Creates a new transaction proposal with amount, recipient, and expiration time, automatically approves for proposer and increments wallet nonce
- **approve_transaction**: Allows wallet owners to approve pending proposals, validates ownership and prevents duplicate approvals
- **execute_transaction**: Executes approved transactions when threshold is met, transfers SOL and marks proposal as executed with comprehensive validation
- **cancel_transaction**: Enables owners to cancel pending proposals, prevents execution of unwanted transactions

### Account Structure
```rust
#[account]
pub struct MultisigWallet {
    pub owners: [Pubkey; MAX_OWNERS],    // Array of owner public keys (max 10)
    pub owner_count: u8,                 // Actual number of owners (2-10)
    pub threshold: u8,                   // Required approvals to execute (1-owner_count)
    pub nonce: u8,                       // Transaction counter for unique proposal PDAs
    pub bump: u8,                        // PDA bump seed for verification
}

#[account]
pub struct TransactionProposal {
    pub wallet: Pubkey,                  // Associated multisig wallet
    pub proposer: Pubkey,                // Owner who proposed the transaction
    pub amount: u64,                     // Transfer amount in lamports
    pub recipient: Pubkey,               // Destination address for transfer
    pub approvals: [bool; MAX_OWNERS],   // Approval status for each owner
    pub owner_count: u8,                 // Number of owners (copied from wallet)
    pub executed: bool,                  // Execution status
    pub cancelled: bool,                 // Cancellation status
    pub expires_at: i64,                 // Unix timestamp for proposal expiration
    pub bump: u8,                        // PDA bump seed for verification
}
```

## Testing

### Test Coverage
Comprehensive test suite covering all instructions with both successful operations and extensive error conditions to ensure program security, edge case handling, and proper validation.

**Happy Path Tests:**
- **Create Multisig Wallet**: Successfully creates wallet with valid owners (3) and threshold (2), verifies account initialization
- **Propose Transaction**: Creates valid proposals with automatic proposer approval and proper nonce incrementation
- **Approve Transaction**: Owners successfully approve pending proposals with approval tracking
- **Execute Transaction**: Executes transactions when threshold is met, transfers correct SOL amounts, validates balances
- **Cancel Transaction**: Successfully cancels pending proposals and prevents further interactions

**Unhappy Path Tests:**
- **Invalid Owner Count**: Fails creation with single owner (minimum 2 required)
- **Invalid Threshold**: Fails with threshold 0 or exceeding owner count
- **Non-Owner Proposal**: Fails when non-owners attempt to propose transactions
- **Non-Owner Approval**: Fails when non-owners attempt to approve proposals
- **Insufficient Approvals**: Fails execution when approval count below threshold
- **Already Executed**: Prevents re-execution of completed transactions
- **Already Cancelled**: Prevents approval of cancelled proposals
- **Insufficient Funds**: Handles wallet balance insufficient for proposed transfer
- **Non-Owner Cancellation**: Fails when non-owners attempt to cancel proposals

### Running Tests
```bash
cd anchor_project/multisig-wallet
yarn install          # Install dependencies
anchor test           # Run comprehensive test suite
```

### Additional Notes for Evaluators

This multisig wallet implementation represents a production-ready Solana program. The biggest technical challenges included mastering Anchor's account constraints system for PDA validation, integrating frontend with Solana program using anchor's coral-xyz typescript library.

The frontend integration was particularly complex, initially attempting manual Borsh serialization before pivoting to Anchor's client library for reliable instruction building.