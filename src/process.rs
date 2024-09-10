use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo,
    entrypoint::ProgramResult,
    pubkey::Pubkey,
    msg,
};

use crate::instruct::*;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum NativeVaultInstruction {
    Initialize,
    Deposit { amount: u64 },
    PartialWithdraw,
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Beginning process_instruction");
    let instruction = NativeVaultInstruction::try_from_slice(instruction_data)?;
    msg!("Instruction unpacked");

    match instruction {
        NativeVaultInstruction::Initialize => {
            msg!("Instruction: Initialize");
            initialize(program_id, accounts)
        }
        NativeVaultInstruction::Deposit { amount } => {
            msg!("Instruction: Deposit");
            deposit(program_id, accounts, amount)
        }
        NativeVaultInstruction::PartialWithdraw => {
            msg!("Instruction: PartialWithdraw");
            partial_withdraw(program_id, accounts)
        }
    }
}
