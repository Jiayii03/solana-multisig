use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

use instructions::*;
use state::*;
use errors::*;

declare_id!("E2Qi8w3Fz3SduddbegzS1SVAjogPae6AceUGmTwkCRez");

#[program]
pub mod multisig_wallet {
    use super::*;

    pub fn create_wallet(
        ctx: Context<CreateWallet>,
        owners: Vec<Pubkey>,
        threshold: u8,
    ) -> Result<()> {
        instructions::create_wallet(ctx, owners, threshold)
    }

    pub fn propose_transaction(
        ctx: Context<ProposeTransaction>,
        amount: u64,
        recipient: Pubkey,
        expires_in_hours: u64,
    ) -> Result<()> {
        instructions::propose_transaction(ctx, amount, recipient, expires_in_hours)
    }

    pub fn approve_transaction(ctx: Context<ApproveTransaction>) -> Result<()> {
        instructions::approve_transaction(ctx)
    }

    pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
        instructions::execute_transaction(ctx)
    }

    pub fn cancel_transaction(ctx: Context<CancelTransaction>) -> Result<()> {
        instructions::cancel_transaction(ctx)
    }
}