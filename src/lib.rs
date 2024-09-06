use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{clock::Clock, Sysvar},
};

// Structures
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

// Constants
pub const DELAY: i64 = 10; // seconds
pub const TAG_SSF_PDA: &[u8; 7] = b"SSF_PDA";

// Instruction enum
#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum NativeVaultInstruction {
    Initialize(),
    Deposit(u64),
    PartialWithdraw(),
}

// Entrypoint
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    input: &[u8],
) -> ProgramResult {
    let instruction = NativeVaultInstruction::try_from_slice(input)?;
    match instruction {
        NativeVaultInstruction::Initialize() => initialize(program_id, accounts),
        NativeVaultInstruction::Deposit(args) => deposit(program_id, accounts, args),
        NativeVaultInstruction::PartialWithdraw() => partial_withdraw(program_id, accounts),
    }
}

// Initialize function
pub fn initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo]
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let user = next_account_info(accounts_iter)?;
    let vault = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(std::mem::size_of::<Vault>());

    let ix = system_instruction::create_account(
        &user.key,
        &vault.key,
        required_lamports,
        std::mem::size_of::<Vault>() as u64,
        program_id,
    );

    invoke(
        &ix,
        &[
            user.clone(),
            vault.clone(),
            system_program.clone(),
        ]
    )?;

    let mut vault_data = Vault::try_from_slice(&vault.data.borrow())?;
    vault_data.owner = *user.key;
    vault_data.serialize(&mut &mut vault.data.borrow_mut()[..])?;

    Ok(())
}

// Deposit function
pub fn deposit(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let user = next_account_info(accounts_iter)?;
    let user_pda = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    let (computed_pda, bump_seed) = Pubkey::find_program_address(
        &[
            TAG_SSF_PDA,
            user.key.as_ref(),
        ],
        program_id
    );

    if user_pda.key != &computed_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    if user_pda.data_is_empty() {
        let rent = Rent::get()?;
        let required_lamports = rent.minimum_balance(std::mem::size_of::<Pda>());

        let ix = system_instruction::create_account(
            &user.key,
            &computed_pda,
            required_lamports,
            std::mem::size_of::<Pda>() as u64,
            program_id,
        );

        invoke(
            &ix,
            &[
                user.clone(),
                user_pda.clone(),
                system_program.clone(),
            ],
        )?;

        let mut vault_data = Pda {
            signer: *user.key,
            balance: 0,
            deposit_time: 0,
            done: false,
        };

        vault_data.serialize(&mut &mut user_pda.data.borrow_mut()[..])?;
    }

    let mut vault_data = Pda::try_from_slice(&user_pda.data.borrow())?;

    if vault_data.done == true {
        return Err(ProgramError::InvalidArgument);
    }

    if vault_data.signer != *user.key {
        return Err(ProgramError::IllegalOwner);
    }

    vault_data.balance = vault_data.balance.checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    let clock = Clock::get()?;
    vault_data.deposit_time = clock.unix_timestamp;

    vault_data.serialize(&mut &mut user_pda.data.borrow_mut()[..])?;

    invoke(
        &system_instruction::transfer(&user.key, &user_pda.key, amount),
        &[
            user.clone(),
            user_pda.clone(),
            system_program.clone(),
        ],
    )?;

    Ok(())
}

// Partial withdraw function
pub fn partial_withdraw(
    program_id: &Pubkey,
    accounts: &[AccountInfo]
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let user = next_account_info(accounts_iter)?;
    let vault = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;

    let (computed_pda, bump_seed) = Pubkey::find_program_address(
        &[
            TAG_SSF_PDA,
            user.key.as_ref()
        ],
        program_id
    );

    if vault.key != &computed_pda {
        return Err(ProgramError::InvalidAccountData);
    }

    let mut pda_data = Pda::try_from_slice(&vault.data.borrow())?;

    if pda_data.signer != *user.key {
        return Err(ProgramError::IllegalOwner);
    }

    if pda_data.done == true {
        return Err(ProgramError::Custom(1)); // Custom withdrawal already done
    }

    let withdrawal_amount = pda_data.balance.checked_div(10)
        .ok_or(ProgramError::InsufficientFunds)?;

    if withdrawal_amount == 0 || pda_data.balance < withdrawal_amount {
        return Err(ProgramError::InsufficientFunds);
    }

    pda_data.balance = pda_data.balance.checked_sub(withdrawal_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    let clock = Clock::get()?;
    let time_elapsed = clock.unix_timestamp - pda_data.deposit_time;
    if time_elapsed < DELAY {
        return Err(ProgramError::Custom(0)); // Custom error: Withdrawal too soon
    }

    pda_data.done = true;

    pda_data.serialize(&mut &mut vault.data.borrow_mut()[..])?;

    let signers_seeds: &[&[_]] = &[
        TAG_SSF_PDA,
        user.key.as_ref(),
        &[bump_seed]
    ];

    invoke_signed(
        &system_instruction::transfer(
            &vault.key,
            &user.key,
            withdrawal_amount
        ),
        &[
            vault.clone(),
            user.clone(),
            system_program.clone(),
        ],
        &[signers_seeds],
    )?;

    Ok(())
}
