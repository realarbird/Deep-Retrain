import mongoose from "mongoose";

const globalForMongoose = globalThis as unknown as {
  __mongoose?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
};

const cached = (globalForMongoose.__mongoose ??= { conn: null, promise: null });

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("MONGODB_URI is not set. Add your MongoDB Atlas connection string to the environment.");
  }
}

/** Cached connection shared across hot reloads and route invocations. */
export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new DatabaseNotConfiguredError();

  cached.promise ??= mongoose
    .connect(uri, {
      dbName: process.env.MONGODB_DB || "deepretain",
      serverSelectionTimeoutMS: 8_000,
      maxPoolSize: 10,
    })
    .catch((err) => {
      cached.promise = null;
      throw err;
    });

  cached.conn = await cached.promise;
  return cached.conn;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
