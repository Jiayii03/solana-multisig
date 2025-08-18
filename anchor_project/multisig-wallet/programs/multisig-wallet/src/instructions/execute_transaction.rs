use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;

pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()> {
    let wallet = &ctx.accounts.wallet;
    let proposal = &mut ctx.accounts.proposal;
    
    require!(!proposal.executed, MultisigError::AlreadyExecuted);
    require!(!proposal.cancelled, MultisigError::AlreadyCancelled);
    require!(!proposal.is_expired(Clock::get()?.unix_timestamp), MultisigError::TransactionExpired);
    
    let approval_count = proposal.get_approval_count();
    require!(approval_count >= wallet.threshold, MultisigError::InsufficientApprovals);

    proposal.executed = true;

    // Execute SOL transfer
    let wallet_lamports = ctx.accounts.wallet_account.lamports();
    require!(wallet_lamports >= proposal.amount, MultisigError::InsufficientFunds);

    **ctx.accounts.wallet_account.to_account_info().try_borrow_mut_lamports()? -= proposal.amount;
    **ctx.accounts.recipient.try_borrow_mut_lamports()? += proposal.amount;

    msg!("Transaction executed: {} lamports to {}", proposal.amount, proposal.recipient);

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteTransaction<'info> {
    #[account(mut)]
    pub proposal: Account<'info, TransactionProposal>,
    
    #[account(mut)]
    pub wallet: Account<'info, MultisigWallet>,
    
    /// CHECK: This is the wallet's SOL account
    #[account(mut)]
    pub wallet_account: UncheckedAccount<'info>,
    
    /// CHECK: This is the recipient account
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    
    pub executor: Signer<'info>,
}