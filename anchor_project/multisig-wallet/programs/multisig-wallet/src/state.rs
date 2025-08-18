use anchor_lang::prelude::*;
use crate::constants::MAX_OWNERS;

#[account]
pub struct MultisigWallet {
    pub owners: [Pubkey; MAX_OWNERS],
    pub owner_count: u8,
    pub threshold: u8,
    pub nonce: u8,
    pub bump: u8,
}

impl MultisigWallet {
    pub fn is_owner(&self, pubkey: &Pubkey) -> bool {
        for i in 0..self.owner_count as usize {
            if self.owners[i] == *pubkey {
                return true;
            }
        }
        false
    }

    pub fn get_owner_index(&self, pubkey: &Pubkey) -> Option<usize> {
        for i in 0..self.owner_count as usize {
            if self.owners[i] == *pubkey {
                return Some(i);
            }
        }
        None
    }

    pub fn increment_nonce(&mut self) {
        self.nonce = self.nonce.wrapping_add(1);
    }
}

#[account]
pub struct TransactionProposal {
    pub wallet: Pubkey,
    pub proposer: Pubkey,
    pub amount: u64,
    pub recipient: Pubkey,
    pub approvals: [bool; MAX_OWNERS],
    pub owner_count: u8,
    pub executed: bool,
    pub cancelled: bool,
    pub expires_at: i64,
    pub bump: u8,
}

impl TransactionProposal {
    pub fn is_expired(&self, current_timestamp: i64) -> bool {
        current_timestamp > self.expires_at
    }

    pub fn get_approval_count(&self) -> u8 {
        let mut count = 0;
        for i in 0..self.owner_count as usize {
            if self.approvals[i] {
                count += 1;
            }
        }
        count
    }
}