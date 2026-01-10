import { ObjectId } from "mongodb";

export interface User {
  _id: ObjectId;
  clerkId: string;
  email: string;
  name: string;
  imageUrl?: string;
  wallet?: UserWallet;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWallet {
  walletId: string;
  address: string;
  network: "base-sepolia" | "base-mainnet";
  createdAt: Date;
}

export type CreateUserInput = Omit<User, "_id" | "createdAt" | "updatedAt">;
