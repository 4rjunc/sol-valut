use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use borsh::{BorshDeserialize, BorshSerialize};

// Define the structure for our account
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct DepositAccount {
    pub balance: u64,
}

// Define the program ID
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = instruction_data[0];
    let accounts_iter = &mut accounts.iter();

    match instruction {
        0 => initialize_account(accounts_iter, program_id),
        1 => deposit(accounts_iter, instruction_data),
        2 => withdraw(accounts_iter),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn initialize_account(
    accounts_iter: &mut std::slice::Iter<AccountInfo>,
    program_id: &Pubkey,
) -> ProgramResult {
    let account = next_account_info(accounts_iter)?;
    let rent = &Rent::from_account_info(next_account_info(accounts_iter)?)?;

    if !rent.is_exempt(account.lamports(), account.data_len()) {
        return Err(ProgramError::AccountNotRentExempt);
    }

    let mut deposit_account = DepositAccount { balance: 0 };
    deposit_account.serialize(&mut &mut account.data.borrow_mut()[..])?;

    msg!("Account initialized");
    Ok(())
}

fn deposit(
    accounts_iter: &mut std::slice::Iter<AccountInfo>,
    instruction_data: &[u8],
) -> ProgramResult {
    let account = next_account_info(accounts_iter)?;
    let user = next_account_info(accounts_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let amount = u64::from_le_bytes(instruction_data[1..9].try_into().unwrap());

    let mut deposit_account = DepositAccount::try_from_slice(&account.data.borrow())?;
    deposit_account.balance += amount;
    deposit_account.serialize(&mut &mut account.data.borrow_mut()[..])?;

    let ix = system_instruction::transfer(user.key, account.key, amount);
    solana_program::program::invoke(
        &ix,
        &[user.clone(), account.clone()],
    )?;

    msg!("Deposited {} lamports", amount);
    Ok(())
}

fn withdraw(accounts_iter: &mut std::slice::Iter<AccountInfo>) -> ProgramResult {
    let account = next_account_info(accounts_iter)?;
    let user = next_account_info(accounts_iter)?;

    if !user.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut deposit_account = DepositAccount::try_from_slice(&account.data.borrow())?;
    let withdraw_amount = deposit_account.balance / 10; // 10% of the balance
    deposit_account.balance -= withdraw_amount;
    deposit_account.serialize(&mut &mut account.data.borrow_mut()[..])?;

    **account.try_borrow_mut_lamports()? -= withdraw_amount;
    **user.try_borrow_mut_lamports()? += withdraw_amount;

    msg!("Withdrawn {} lamports", withdraw_amount);
    Ok(())
}
