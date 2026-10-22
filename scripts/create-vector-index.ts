/**
 * Creates the Atlas Vector Search index used for identity-scoped retrieval.
 *   npm run db:vector-index
 * Reads MONGODB_URI / MONGODB_DB / ATLAS_VECTOR_INDEX from .env.local or the environment.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

import mongoose from "mongoose";
import spec from "../atlas/vector-index.json" with { type: "json" };

type SearchIndexInfo = { name: string; status?: string };

const POLL_MS = 5_000;
const TIMEOUT_MS = 5 * 60_000;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const indexName = process.env.ATLAS_VECTOR_INDEX?.trim() || spec.name;

  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || "deepretain" });
  const db = mongoose.connection.db!;
  if (!(await db.listCollections({ name: spec.collection }).hasNext())) {
    await db.createCollection(spec.collection);
    console.log(`Created collection ${spec.collection}`);
  }
  const collection = db.collection(spec.collection);

  const existing = (await collection.listSearchIndexes(indexName).toArray()) as SearchIndexInfo[];
  if (existing.length) {
    console.log(`Index "${indexName}" already exists (status: ${existing[0].status}).`);
  } else {
    await collection.createSearchIndex({ name: indexName, type: "vectorSearch", definition: spec.definition });
    console.log(`Requested vector index "${indexName}" on ${spec.collection}.embedding (384 dims, cosine).`);
  }

  const started = Date.now();
  for (;;) {
    const [index] = (await collection.listSearchIndexes(indexName).toArray()) as SearchIndexInfo[];
    const status = index?.status ?? "PENDING";
    if (status === "READY") {
      console.log(`Index "${indexName}" is READY.`);
      break;
    }
    if (status === "FAILED") throw new Error(`Index build failed: ${JSON.stringify(index)}`);
    if (Date.now() - started > TIMEOUT_MS) {
      console.log(`Still ${status} after ${TIMEOUT_MS / 60_000} min; it will finish in the background.`);
      break;
    }
    console.log(`Waiting for index… (${status})`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Failed to create the vector index:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
