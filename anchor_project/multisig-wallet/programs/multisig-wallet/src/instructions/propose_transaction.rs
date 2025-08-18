use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

pub fn propose_transaction(
    ctx: Context<ProposeTransaction>,
    amount: u64,
    recipient: Pubkey,
    expires_in_hours: u64,
) -> Result<()> {
    let wallet = &mut ctx.accounts.wallet;
    require!(wallet.is_owner(&ctx.accounts.proposer.key()), MultisigError::OwnerNotFound);

    let current_timestamp = Clock::get()?.unix_timestamp;
    let expires_at = current_timestamp + (expires_in_hours * 3600) as i64;

    // Store wallet key and owner_count before borrowing proposal as mutable
    let wallet_key = wallet.key();
    let wallet_owner_count = wallet.owner_count;
    let proposer_key = ctx.accounts.proposer.key();

    let proposal = &mut ctx.accounts.proposal;
    proposal.wallet = wallet_key;
    proposal.proposer = proposer_key;
    proposal.amount = amount;
    proposal.recipient = recipient;
    proposal.owner_count = wallet_owner_count;
    proposal.executed = false;
    proposal.cancelled = false;
    proposal.expires_at = expires_at;
    proposal.bump = ctx.bumps.proposal;

    // Auto-approve by proposer
    if let Some(index) = wallet.get_owner_index(&proposer_key) {
        proposal.approvals[index] = true;
    }

    // Increment the nonce for the next proposal
    wallet.increment_nonce();

    Ok(())
}

#[derive(Accounts)]
pub struct ProposeTransaction<'info> {
    #[account(
        init,
        payer = proposer,
        space = 8 + 32 + 32 + 8 + 32 + 10 + 1 + 1 + 1 + 8 + 1,
        seeds = [b"transaction_proposal", wallet.key().as_ref(), &wallet.nonce.to_le_bytes()],
        bump
    )]
    pub proposal: Account<'info, TransactionProposal>,
    
    #[account(mut)]
    pub wallet: Account<'info, MultisigWallet>,
    
    #[account(mut)]
    pub proposer: Signer<'info>,
    pub system_program: Program<'info, System>,
}