import { ObjectId } from "mongodb";

export type TemplateCategory =
  | "task_execution"
  | "verification"
  | "planning"
  | "summarization"
  | "agent_prompt";

export interface PromptTemplate {
  _id: ObjectId;
  name: string;
  category: TemplateCategory;
  template: string;
  variables: TemplateVariable[];
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export type CreatePromptTemplateInput = Omit<
  PromptTemplate,
  "_id" | "version" | "createdAt" | "updatedAt"
> & {
  version?: number;
};
