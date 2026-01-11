import { MongoClient, Db } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const options = {};

let clientPromise: Promise<MongoClient> | undefined;

// Lazy initialization - read env vars at runtime, not at module evaluation time
function getClientPromise(): Promise<MongoClient> {
  if (clientPromise) {
    return clientPromise;
  }

  // Read environment variable at runtime
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not defined");
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  return clientPromise;
}

export async function getDatabase(): Promise<Db> {
  const client = await getClientPromise();
  return client.db();
}

export async function getClient(): Promise<MongoClient> {
  return getClientPromise();
}

// Don't call getClientPromise() at module evaluation time - let it be lazy
export default { getClient, getDatabase };
