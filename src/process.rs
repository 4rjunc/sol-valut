use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, pubkey::Pubkey};

use crate::instruct::{deposite, withdraw};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum TranferInstruct {
    DepositInstruct(u64),
    WithdrawalInstruct(),
}

pub fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
    let instruct = TranferInstruct::try_from_slice(input)?;

    match instruct {
        TranferInstruct::DepositInstruct(args) => deposite(program_id, accounts, args),
        TranferInstruct::WithdrawalInstruct() => withdraw(program_id, accounts),
    }
}
