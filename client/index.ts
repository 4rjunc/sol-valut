import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as borsh from "borsh";

// Replace with your program ID after deployment
const PROGRAM_ID = new PublicKey(
  "H9VvZ2SpJuh9quUEU1JyMTB8yjLJQSqiKGv2XG9WXVxg",
);
const TAG_SSF_PDA = Buffer.from("SSF_PDA");

// Instruction layout
class InitializeInstruction {
  instruction = 0;
  constructor() { }
}

class DepositInstruction {
  instruction = 1;
  amount: number;
  constructor(props: { amount: number }) {
    this.amount = props.amount;
  }
}

class PartialWithdrawInstruction {
  instruction = 2;
  constructor() { }
}

// Borsh schema for instructions
const instructionSchema = new Map([
  [InitializeInstruction, { kind: "struct", fields: [["instruction", "u8"]] }],
  [
    DepositInstruction,
    {
      kind: "struct",
      fields: [
        ["instruction", "u8"],
        ["amount", "u64"],
      ],
    },
  ],
  [
    PartialWithdrawInstruction,
    { kind: "struct", fields: [["instruction", "u8"]] },
  ],
]);

// Helper function to derive PDA
async function findProgramAddress(
  userPubkey: PublicKey,
): Promise<[PublicKey, number]> {
  return await PublicKey.findProgramAddress(
    [TAG_SSF_PDA, userPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

export class NativeVaultClient {
  constructor(
    private connection: Connection,
    private payer: Keypair,
  ) { }

  async initialize(): Promise<string> {
    const vault = Keypair.generate();
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: vault.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(
        borsh.serialize(instructionSchema, new InitializeInstruction()),
      ),
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer, vault],
    );

    console.log("Vault initialized with signature:", signature);
    return signature;
  }

  async deposit(amount: number): Promise<string> {
    const [pda] = await findProgramAddress(this.payer.publicKey);
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(
        borsh.serialize(instructionSchema, new DepositInstruction({ amount })),
      ),
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer],
    );

    console.log(`Deposited ${amount} lamports with signature:`, signature);
    return signature;
  }

  async partialWithdraw(): Promise<string> {
    const [pda] = await findProgramAddress(this.payer.publicKey);
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: pda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: PROGRAM_ID,
      data: Buffer.from(
        borsh.serialize(instructionSchema, new PartialWithdrawInstruction()),
      ),
    });

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.payer],
    );

    console.log("Partial withdrawal completed with signature:", signature);
    return signature;
  }
}

// Example usage
async function main() {
  const connection = new Connection("http://localhost:8899", "confirmed");
  const payer = Keypair.generate();

  console.log("Requesting airdrop of 2 SOL...");
  await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
  console.log("Airdrop received");

  const client = new NativeVaultClient(connection, payer);

  console.log("Initializing vault...");
  await client.initialize();

  console.log("Depositing 1 SOL...");
  await client.deposit(LAMPORTS_PER_SOL);

  console.log("Waiting for 11 seconds before partial withdrawal...");
  await new Promise((resolve) => setTimeout(resolve, 11000));

  console.log("Performing partial withdrawal...");
  await client.partialWithdraw();
}

main().catch(console.error);
