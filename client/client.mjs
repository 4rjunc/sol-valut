import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as borsh from 'borsh';

// Replace with your program ID
const PROGRAM_ID = new PublicKey('YOUR_PROGRAM_ID_HERE');

// Define the account structure
class DepositAccount {
  balance: number;
  constructor(fields: { balance: number } | undefined = undefined) {
    this.balance = fields?.balance ?? 0;
  }
}

// Borsh schema definition for the account
const DepositAccountSchema = new Map([
  [DepositAccount, { kind: 'struct', fields: [['balance', 'u64']] }],
]);

// Helper function to create an account
async function createAccount(connection: Connection, payer: Keypair, programId: PublicKey, space: number): Promise<Keypair> {
  const newAccount = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: newAccount.publicKey,
      lamports,
      space,
      programId,
    })
  );

  await sendAndConfirmTransaction(connection, transaction, [payer, newAccount]);
  return newAccount;
}

// Initialize account
async function initializeAccount(connection: Connection, payer: Keypair, accountToInitialize: Keypair): Promise<void> {
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: accountToInitialize.publicKey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from([0]), // Instruction 0 for initialize
  });

  const transaction = new Transaction().add(instruction);
  await sendAndConfirmTransaction(connection, transaction, [payer, accountToInitialize]);
  console.log('Account initialized');
}

// Deposit SOL
async function deposit(connection: Connection, payer: Keypair, account: PublicKey, amount: number): Promise<void> {
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from([1, ...new BN(amount).toArray('le', 8)]), // Instruction 1 for deposit
  });

  const transaction = new Transaction().add(instruction);
  await sendAndConfirmTransaction(connection, transaction, [payer]);
  console.log(`Deposited ${amount} lamports`);
}

// Withdraw SOL
async function withdraw(connection: Connection, payer: Keypair, account: PublicKey): Promise<void> {
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from([2]), // Instruction 2 for withdraw
  });

  const transaction = new Transaction().add(instruction);
  await sendAndConfirmTransaction(connection, transaction, [payer]);
  console.log('Withdrawn 10% of the balance');
}

// Get account balance
async function getAccountBalance(connection: Connection, account: PublicKey): Promise<number> {
  const accountInfo = await connection.getAccountInfo(account);
  if (accountInfo === null) {
    throw new Error('Account not found');
  }
  const decodedAccount = borsh.deserialize(
    DepositAccountSchema,
    DepositAccount,
    accountInfo.data
  );
  return decodedAccount.balance;
}

// Main function to test the program
async function main() {
  const connection = new Connection('http://localhost:8899', 'confirmed');
  const payer = Keypair.generate();

  console.log('Requesting airdrop for payer...');
  await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);

  console.log('Creating new account...');
  const newAccount = await createAccount(connection, payer, PROGRAM_ID, 8);

  console.log('Initializing account...');
  await initializeAccount(connection, payer, newAccount);

  console.log('Depositing SOL...');
  await deposit(connection, payer, newAccount.publicKey, LAMPORTS_PER_SOL);

  console.log('Account balance after deposit:');
  let balance = await getAccountBalance(connection, newAccount.publicKey);
  console.log(`${balance} lamports`);

  console.log('Withdrawing 10%...');
  await withdraw(connection, payer, newAccount.publicKey);

  console.log('Account balance after withdrawal:');
  balance = await getAccountBalance(connection, newAccount.publicKey);
  console.log(`${balance} lamports`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
