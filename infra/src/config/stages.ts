import type { StageCapacityConfig } from "../capacity-guard";

export type StageName = "dev" | "prod";

export interface StageConfig extends StageCapacityConfig {
  stageName: StageName;
  isProd: boolean;
  account?: string;
  region: string;
  githubRepo: string;
}

const githubRepo = "onetruemint20/paycheck-balance";
const region = process.env.CDK_REGION ?? "us-east-1";

export const stages: Record<StageName, StageConfig> = {
  dev: {
    stageName: "dev",
    isProd: false,
    account: process.env.CDK_DEV_ACCOUNT,
    region,
    githubRepo,
    tableCapacity: { readCapacity: 4, writeCapacity: 4 },
    gsi1Capacity: { readCapacity: 2, writeCapacity: 2 },
  },
  prod: {
    stageName: "prod",
    isProd: true,
    account: process.env.CDK_PROD_ACCOUNT,
    region,
    githubRepo,
    tableCapacity: { readCapacity: 10, writeCapacity: 10 },
    gsi1Capacity: { readCapacity: 5, writeCapacity: 5 },
  },
};
