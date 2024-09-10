use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
};

pub fn deposite(_program_id: &Pubkey, accounts: &[AccountInfo], amount: u64) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let payer = next_account_info(account_iter)?;
    let deposit_account = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    msg!("Deposit Amount: {}", amount);

    invoke(&system_instruction::transfer(payer.key, deposit_account.key, amount), 
        &[payer.clone(),deposit_account.clone(), system_program.clone()]);

    let mut deposit_data = deposit_account.try_borrow_mut_data()?;
    let mut total_deposited = u64::from_le_bytes(deposit_data[..8].try_into().unwrap());
    total_deposited += amount;
    deposit_data[..8].copy_from_slice(&total_deposited.to_le_bytes());

    Ok(())
}

pub fn withdraw(_program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let account_iter = &mut accounts.iter();
    let deposit_account = next_account_info(account_iter)?;
    let recipient = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    let deposit_data = deposit_account.try_borrow_mut_data()?;
    let total_deposited = u64::from_le_bytes(deposit_data[..8].try_into().unwrap());
    let withdrawal_amount = total_deposited / 10;

    msg!("Withdraw: {}", withdrawal_amount);

    if withdrawal_amount == 0 {
        return Err(ProgramError::InsufficientFunds);
    }

    invoke(&system_instruction::transfer(deposit_account.key, recipient.key, withdrawal_amount), 
        &[deposit_account.clone(), recipient.clone(), system_program.clone()]
    )?;

    let mut deposit_data = deposit_account.try_borrow_mut_data()?;
    let total_deposited = u64::from_le_bytes(deposit_data[..8].try_into().unwrap());
    let new_total_deposited = total_deposited - withdrawal_amount;
    deposit_data[..8].copy_from_slice(&new_total_deposited.to_le_bytes());
    
    Ok(())

}
