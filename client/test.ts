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
    const txHash = await sendAndConfirmTransaction(connection, initializeTx, [
      payer,
      newVault,
    ]);
    console.log(`Initialize transaction: ${txHash}`);
  } catch (error) {
    console.error("Error in initialize transaction:", error);
    return;
  }
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err);
    process.exit(-1);
  }
);
