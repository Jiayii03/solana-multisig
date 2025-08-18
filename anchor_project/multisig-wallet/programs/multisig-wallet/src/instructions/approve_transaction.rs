use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

pub fn approve_transaction(ctx: Context<ApproveTransaction>) -> Result<()> {
    let wallet = &ctx.accounts.wallet;
    let proposal = &mut ctx.accounts.proposal;
    
    require!(!proposal.executed, MultisigError::AlreadyExecuted);
    require!(!proposal.cancelled, MultisigError::AlreadyCancelled);
    require!(!proposal.is_expired(Clock::get()?.unix_timestamp), MultisigError::TransactionExpired);
    require!(wallet.is_owner(&ctx.accounts.approver.key()), MultisigError::OwnerNotFound);

    if let Some(index) = wallet.get_owner_index(&ctx.accounts.approver.key()) {
        proposal.approvals[index] = true;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ApproveTransaction<'info> {
    #[account(mut)]
    pub proposal: Account<'info, TransactionProposal>,
    
    pub wallet: Account<'info, MultisigWallet>,
    
    pub approver: Signer<'info>,
}