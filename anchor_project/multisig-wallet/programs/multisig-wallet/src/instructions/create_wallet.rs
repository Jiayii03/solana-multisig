use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::*;
use crate::constants::MAX_OWNERS;

pub fn create_wallet(
    ctx: Context<CreateWallet>,
    owners: Vec<Pubkey>,
    threshold: u8,
) -> Result<()> {
    require!(owners.len() >= 2, MultisigError::InvalidOwnerList);
    require!(owners.len() <= MAX_OWNERS, MultisigError::InvalidOwnerList);
    require!(threshold > 0, MultisigError::InvalidThreshold);
    require!(threshold <= owners.len() as u8, MultisigError::InvalidThreshold);

    let wallet = &mut ctx.accounts.wallet;
    
    // Initialize owners array
    for (i, owner) in owners.iter().enumerate() {
        wallet.owners[i] = *owner;
    }
    
    wallet.owner_count = owners.len() as u8;
    wallet.threshold = threshold;
    wallet.nonce = 0;
    wallet.bump = ctx.bumps.wallet;

    Ok(())
}

#[derive(Accounts)]
pub struct CreateWallet<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + 320 + 1 + 1 + 1 + 1, // 8 + owners[10*32] + owner_count + threshold + nonce + bump
        seeds = [b"multisig_wallet", payer.key().as_ref()],
        bump
    )]
    pub wallet: Account<'info, MultisigWallet>,
    
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}