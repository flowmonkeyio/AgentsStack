export { getDatabase, getClient } from "./client";
export {
  getCollection,
  getUsersCollection,
  getJobsCollection,
  getPlansCollection,
  getWorkItemsCollection,
  getAgentsCollection,
  getTransactionsCollection,
  getPromptTemplatesCollection,
} from "./collections";
export type {
  CollectionName,
  UserDocument,
  JobDocument,
  PlanDocument,
  WorkItemDocument,
  AgentDocument,
  TransactionDocument,
  PromptTemplateDocument,
} from "./collections";

// DatabaseClient interface and implementation
export type { DatabaseClient } from "./database-client";
export {
  DatabaseClientImpl,
  getDatabaseClient,
  createDatabaseClient,
} from "./database-client-impl";
