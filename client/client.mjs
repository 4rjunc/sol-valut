import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import { getKeypairFromFile } from "@solana-developers/helpers";

const programID = new PublicKey("H9VvZ2SpJuh9quUEU1JyMTB8yjLJQSqiKGv2XG9WXVxg");
// define connection to local validators
const connection = new Connection("http://localhost:8899", "confirmed");
// load keypair
const keypair = await getKeypairFromFile("~/.config/solana/id.json");
// blockhash for all transaction
const blockhashInfo = await connection.getLatestBlockhash();

//create new transaction
const tx = new Transaction({
  ...blockhashInfo,
});

// add hello world program
tx.add(
  new TransactionInstruction({
    programId: programID,
    keys: [],
    data: Buffer.from([]),
  }),
);

// sign the tx
tx.sign(keypair);

//send transaction to solana network
const txHash = await connection.sendRawTransaction(tx.serialize());

console.log(`Transaction sent with Hash: ${txHash}`);

await connection.confirmTransaction({
  blockhash: blockhashInfo.blockhash,
  lastValidBlockHeight: blockhashInfo.lastValidBlockHeight,
  signature: txHash,
});

console.log(
  `Congratulations! Look at your ‘Hello World’ transaction in the Solana Explorer:
  https://explorer.solana.com/tx/${txHash}?cluster=custom`,
);
