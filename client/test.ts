import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import * as borsh from "borsh";

const connection = new Connection("http://localhost:8899", "confirmed");
const TAG_SOL_VAULT = "SOL_VAULT";

const PROGRAM_ID = new PublicKey(
  "H9VvZ2SpJuh9quUEU1JyMTB8yjLJQSqiKGv2XG9WXVxg"
);

class InstructionData {
  instruction: number;
  amount?: number;

  constructor(fields: { instruction: number; amount?: number }) {
    this.instruction = fields.instruction;
    this.amount = fields.amount;
  }
}

async function main() {
  const payer = Keypair.generate();
  console.log("Payer: ", payer.publicKey.toBase58());

  const airdropSignature = await connection.requestAirdrop(
    payer.publicKey,
    2 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(airdropSignature);
  console.log(`Airdrop for ${payer.publicKey.toBase58()} is complete`);

  // Initialize
  const newVault = Keypair.generate();
  console.log(`New vault: ${newVault.publicKey.toBase58()}`);

  const instructionSchema = new Map([
    [
      InstructionData,
      {
        kind: "struct",
        fields: [
          ["instruction", "u8"],
          ["amount", { kind: "option", type: "u64" }],
        ],
      },
    ],
  ]);

  const ixIdxInitialize = 0; // initialize
  const sizeVault = 42; // (Pubkey size)

  const ixDataInitialize = Buffer.alloc(sizeVault + 8);
  ixDataInitialize.writeUInt8(ixIdxInitialize, 0);

  const ixInitialize = new TransactionInstruction({
    keys: [
      {
        pubkey: payer.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: newVault.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: PROGRAM_ID,
    data: ixDataInitialize,
  });

  const initializeTx = new Transaction().add(ixInitialize);

  try {
    console.log("sendAndConfirmTransaction");
    const txHash = await sendAndConfirmTransaction(connection, initializeTx, [
      payer,
      newVault,
    ]);
    console.log(`Initialize transaction: ${txHash}`);
  } catch (error) {
    console.error("Error in initialize transaction:", error);
    return;
  }

  // Deposit
  const [depositPda] = await PublicKey.findProgramAddress(
    [Buffer.from(TAG_SOL_VAULT), payer.publicKey.toBuffer()],
    PROGRAM_ID
  );

  const depositAmount = 0.5 * LAMPORTS_PER_SOL;
  const depositIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: depositPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(
      borsh.serialize(
        instructionSchema,
        new InstructionData({ instruction: 1, amount: depositAmount })
      )
    ),
  });

  const depositTx = new Transaction().add(depositIx);
  try {
    const txHash = await sendAndConfirmTransaction(connection, depositTx, [
      payer,
    ]);
    console.log(`Deposit transaction: ${txHash}`);
  } catch (error) {
    console.error("Error in deposit transaction:", error);
    return;
  }

  // Partial Withdraw
  const withdrawIx = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: depositPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: Buffer.from(
      borsh.serialize(
        instructionSchema,
        new InstructionData({ instruction: 2 })
      )
    ),
  });

  const withdrawTx = new Transaction().add(withdrawIx);
  try {
    const txHash = await sendAndConfirmTransaction(connection, withdrawTx, [
      payer,
    ]);
    console.log(`Withdraw transaction: ${txHash}`);
  } catch (error) {
    console.error("Error in withdraw transaction:", error);
  }
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err);
    process.exit(-1);
  }
);
