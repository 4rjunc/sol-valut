pub mod instruct;
pub mod process;

use {crate::process::process_instruction, solana_program::entrypoint};

entrypoint!(process_instruction);

