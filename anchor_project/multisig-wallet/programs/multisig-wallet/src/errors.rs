use anchor_lang::prelude::*;

#[error_code]
pub enum MultisigError {
    #[msg("Invalid threshold: must be greater than 0 and less than or equal to number of owners")]
    InvalidThreshold,
    #[msg("Owner not found in wallet")]
    OwnerNotFound,
    #[msg("Insufficient approvals")]
    InsufficientApprovals,
    #[msg("Transaction already executed")]
    AlreadyExecuted,
    #[msg("Transaction already cancelled")]
    AlreadyCancelled,
    #[msg("Transaction expired")]
    TransactionExpired,
    #[msg("Invalid owner list: must have 2-10 owners")]
    InvalidOwnerList,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}