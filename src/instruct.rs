use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{clock::Clock, Sysvar},
    msg,
};

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Vault {
    pub owner: Pubkey,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Pda {
    pub signer: Pubkey,
    pub balance: u64,
    pub deposit_time: i64,
    pub done: bool,
}

pub const DELAY: i64 = 10;
pub const TAG_SOL_VAULT: &[u8; 9] = b"SOL_VAULT";

pub fn initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    msg!("Initialize instruction");
    let accounts_iter = &mut accounts.iter();

    let user = next_account_info(accounts_iter)?;
    let vault = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(std::mem::size_of::<Vault>());

    msg!("Creating vault account");
    invoke(
        &system_instruction::create_account(
            user.key,
            vault.key,
            required_lamports,
            std::mem::size_of::<Vault>() as u64,
            program_id,
        ),
        &[user.clone(), vault.clone(), system_program.clone()],
    )?;

    msg!("Initializing vault data");
    let mut vault_data = Vault::try_from_slice(&vault.data.borrow())?;
    vault_data.owner = *user.key;
    vault_data.serialize(&mut &mut vault.data.borrow_mut()[..])?;

    msg!("Initialize instruction completed");
    Ok(())
}

pub fn deposit(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
) -> ProgramResult {
    msg!("Deposit instruction");
    let accounts_iter = &mut accounts.iter();

    let user = next_account_info(accounts_iter)?;
    let user_pda = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    let (computed_pda, bump_seed) = Pubkey::find_program_address(
        &[TAG_SOL_VAULT, user.key.as_ref()],
        program_id,
    );

    if user_pda.key != &computed_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    if user_pda.data_is_empty() {
        msg!("Initializing user PDA");
        let rent = Rent::get()?;
        let required_lamports = rent.minimum_balance(std::mem::size_of::<Pda>());

        invoke_signed(
            &system_instruction::create_account(
                user.key,
                user_pda.key,
                required_lamports,
                std::mem::size_of::<Pda>() as u64,
                program_id,
            ),
            &[user.clone(), user_pda.clone(), system_program.clone()],
            &[&[TAG_SOL_VAULT, user.key.as_ref(), &[bump_seed]]],
        )?;

        let mut pda_data = Pda {
            signer: *user.key,
            balance: 0,
            deposit_time: 0,
            done: false,
        };
        pda_data.serialize(&mut &mut user_pda.data.borrow_mut()[..])?;
    }

    msg!("Updating PDA data");
    let mut pda_data = Pda::try_from_slice(&user_pda.data.borrow())?;
    if pda_data.done {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if pda_data.signer != *user.key {
        return Err(ProgramError::IllegalOwner);
    }

    pda_data.balance = pda_data.balance.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
    let clock = Clock::get()?;
    pda_data.deposit_time = clock.unix_timestamp;
    pda_data.serialize(&mut &mut user_pda.data.borrow_mut()[..])?;

    msg!("Transferring SOL to PDA");
    invoke(
        &system_instruction::transfer(user.key, user_pda.key, amount),
        &[user.clone(), user_pda.clone(), system_program.clone()],
    )?;

    msg!("Deposit instruction completed");
    Ok(())
}

pub fn partial_withdraw(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    msg!("Partial withdraw instruction");
    let accounts_iter = &mut accounts.iter();

    let user = next_account_info(accounts_iter)?;
    let user_pda = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    let (computed_pda, bump_seed) = Pubkey::find_program_address(
        &[TAG_SOL_VAULT, user.key.as_ref()],
        program_id,
    );

    if user_pda.key != &computed_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    msg!("Reading PDA data");
    let mut pda_data = Pda::try_from_slice(&user_pda.data.borrow())?;
    if pda_data.signer != *user.key {
        return Err(ProgramError::IllegalOwner);
    }
    if pda_data.done {
        return Err(ProgramError::AccountDataTooSmall);
    }

    let clock = Clock::get()?;
    let time_elapsed = clock.unix_timestamp - pda_data.deposit_time;
    if time_elapsed < DELAY {
        return Err(ProgramError::Custom(0));
    }

    msg!("Calculating withdrawal amount");
    let withdrawal_amount = pda_data.balance.checked_div(10).ok_or(ProgramError::ArithmeticOverflow)?;
    if withdrawal_amount == 0 {
        return Err(ProgramError::InsufficientFunds);
    }

    pda_data.balance = pda_data.balance.checked_sub(withdrawal_amount).ok_or(ProgramError::ArithmeticOverflow)?;
    pda_data.done = true;
    pda_data.serialize(&mut &mut user_pda.data.borrow_mut()[..])?;

    msg!("Transferring SOL from PDA to user");
    invoke_signed(
        &system_instruction::transfer(user_pda.key, user.key, withdrawal_amount),
        &[user_pda.clone(), user.clone(), system_program.clone()],
        &[&[TAG_SOL_VAULT, user.key.as_ref(), &[bump_seed]]],
    )?;

    msg!("Partial withdraw instruction completed");
    Ok(())
}
