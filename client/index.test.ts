import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import * as borsh from "borsh";
import { struct, u8, nu64 } from "@solana/buffer-layout";

enum InstructionType {
  DepositInstruction = 0,
  WithdrawalInstruction = 1,
}

class VaultInstruction {
  instruction: InstructionType;
  amount: number; // Use bigint to match u64

  constructor(params: { instruction: InstructionType; amount?: number }) {
    this.instruction = params.instruction;
    this.amount = params.amount || 0;
  }

  toBuffer(): Buffer {
    const layout = struct([u8("instruction"), nu64("amount")]); // u8 for instruction type, u64 for amount

    const buffer = Buffer.alloc(layout.span);
    layout.encode(
      {
        instruction: this.instruction,
        amount: this.amount,
      },
      buffer
    );

    return buffer;
  }
}

export function createVaultInstruction(
  payerPubkey: PublicKey,
  recipientPubkey: PublicKey,
  programId: PublicKey,
  instruction: InstructionType,
  amount?: number
): TransactionInstruction {
  const instructionObject = new VaultInstruction({
    instruction,
    amount,
  });

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: payerPubkey, isSigner: true, isWritable: true },
      { pubkey: recipientPubkey, isSigner: false, isWritable: true },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId,
    data: instructionObject.toBuffer(),
  });

  return ix;
}

describe("Native", async () => {
  const programId = new PublicKey(
    "H9VvZ2SpJuh9quUEU1JyMTB8yjLJQSqiKGv2XG9WXVxg"
  );

  const connection = new Connection("http://localhost:8899", "confirmed");
  const payer = Keypair.generate();
  const vault = Keypair.generate();

  before(async () => {
    await connection.confirmTransaction(
      await connection.requestAirdrop(payer.publicKey, 100 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    await connection.sendTransaction(
      new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: vault.publicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(8),
          space: 8, // Enough for u64
          programId: programId,
        })
      ),
      [payer, vault]
    );

    console.log(
      "Balance:",
      (await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL
    );
    console.log(
      "Vault:",
      (await connection.getBalance(vault.publicKey)) / LAMPORTS_PER_SOL
    );
  });

  it("should deposit", async () => {
    try {
      const instruction = createVaultInstruction(
        payer.publicKey,
        vault.publicKey,
        programId,
        InstructionType.DepositInstruction,
        100
      );
      console.log("Instruction:", instruction);

      const transaction = new Transaction().add(instruction);
      transaction.recentBlockhash = (
        await connection.getRecentBlockhash("confirmed")
      ).blockhash;
      transaction.sign(payer);
      transaction.feePayer = payer.publicKey;
      console.log("Transaction:", transaction);

      await connection.sendRawTransaction(transaction.serialize());

      console.log(
        "Balance:",
        (await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL
      );
      console.log(
        "Vault:",
        (await connection.getBalance(vault.publicKey)) / LAMPORTS_PER_SOL
      );
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });

  it("should withdraw", async () => {
    try {
      const instruction = createVaultInstruction(
        payer.publicKey,
        vault.publicKey,
        programId,
        InstructionType.WithdrawalInstruction
      );
      console.log("Instruction:", instruction);

      const transaction = new Transaction().add(instruction);
      transaction.recentBlockhash = (
        await connection.getRecentBlockhash("confirmed")
      ).blockhash;
      transaction.sign(payer);
      transaction.feePayer = payer.publicKey;
      console.log("Transaction:", transaction);

      await connection.sendRawTransaction(transaction.serialize());

      console.log(
        "Balance:",
        (await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL
      );
      console.log(
        "Vault:",
        (await connection.getBalance(vault.publicKey)) / LAMPORTS_PER_SOL
      );
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });
});
