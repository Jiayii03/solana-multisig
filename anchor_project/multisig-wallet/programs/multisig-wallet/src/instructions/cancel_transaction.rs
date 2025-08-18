use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

pub fn cancel_transaction(ctx: Context<CancelTransaction>) -> Result<()> {
    let wallet = &ctx.accounts.wallet;
    let proposal = &mut ctx.accounts.proposal;
    
    require!(!proposal.executed, MultisigError::AlreadyExecuted);
    require!(!proposal.cancelled, MultisigError::AlreadyCancelled);
    require!(wallet.is_owner(&ctx.accounts.canceller.key()), MultisigError::OwnerNotFound);

    proposal.cancelled = true;
    Ok(())
}

#[derive(Accounts)]
pub struct CancelTransaction<'info> {
    #[account(mut)]
    pub proposal: Account<'info, TransactionProposal>,
    
    pub wallet: Account<'info, MultisigWallet>,
    
    pub canceller: Signer<'info>,
}