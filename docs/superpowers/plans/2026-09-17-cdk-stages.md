# CDK Stages (dev/prod) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Note: this session is an AO worker forbidden from spawning subagents, so this plan is executed inline task-by-task in the same session instead.

**Goal:** Add a CDK app to `infra/` that defines dev and prod stage stacks (DynamoDB + GSI1 + TTL, S3/CloudFront, SSM params, CloudWatch log retention), a synth-time DynamoDB capacity budget guard, a GitHub OIDC deploy role, and CI/CD workflows (auto dev deploy on merge to main, manual prod deploy with a table-replacement guard).

**Architecture:** One CDK app (`infra/src/bin/app.ts`) instantiates two independent stacks per stage — `PaycheckBalanceStack` (data/hosting) and `GithubOidcStack` (deploy role) — parameterized by a `StageConfig` from `infra/src/config/stages.ts`. A pure `validateCapacityBudget` function runs before stack construction so `cdk synth` throws if dev+prod DynamoDB capacity exceeds the 25 RCU/WCU budget. A pure `detectsTableReplacement` function parses `cdk diff` text so the prod GitHub Actions workflow can fail fast before attempting a destructive deploy.

**Tech Stack:** aws-cdk-lib v2, aws-cdk CLI, constructs, ts-node (to run the CDK app), existing Jest/ts-jest/ESLint/TypeScript workspace tooling from M1-2.

**Spec:** GitHub issue onetruemint20/paycheck-balance#3 (M1-3). Requirements OPS-2, OPS-3, 8.1, 8.3.

## Global Constraints

- Node 24, TypeScript strict mode, existing `tsconfig.base.json` (commonjs, ES2022) — do not weaken strictness.
- `core` package must stay free of AWS/Plaid deps (enforced by CI) — infra changes must not touch `core`.
- Jest via `jest.config.js` roots includes `infra` — new test files must live under `infra/src` and match existing `*.test.ts` convention.
- ESLint flat config (`eslint.config.js`) applies repo-wide — new files must pass `npm run lint`.
- Capacity budget: **25 total RCU and 25 total WCU across dev+prod table capacity** (issue's literal dev 4/4 + prod 10/10 table numbers). GSI1 capacity is also counted in the guard (real cost), using smaller per-stage defaults (dev 2/2, prod 5/5) so the default total (21/21) stays under budget with headroom to demonstrate the guard blocking an increase.
- Prod stack: DynamoDB `deletionProtection: true`, `removalPolicy: RETAIN`. Dev stack: `deletionProtection: false`, `removalPolicy: DESTROY`.
- GitHub OIDC role follows least-privilege: it may only `sts:AssumeRole` into the CDK bootstrap roles (`cdk-*-deploy-role-*`, `cdk-*-file-publishing-role-*`, `cdk-*-image-publishing-role-*`, `cdk-*-lookup-role-*`), not broad account permissions directly.
- No AWS credentials are available in this environment — verification is via `cdk synth`/unit tests only (both are environment-agnostic, no `Vpc.fromLookup`-style account calls). Real deploys are out of scope for this session; document the one-time manual bootstrap step needed before OIDC-based CI deploys can run.

---

## Task 1: Add CDK dependencies and project files to `infra`

**Files:**
- Modify: `infra/package.json`
- Create: `infra/cdk.json`
- Modify: `infra/tsconfig.json` (only if needed for `src/bin` — it already includes all of `src`, so likely no change)
- Modify: `.gitignore` (add `cdk.out/`, `infra/cdk.out/`)

**Interfaces:**
- Produces: `aws-cdk-lib`, `constructs` as runtime deps; `aws-cdk`, `ts-node` as dev deps, available to later tasks for `import * as cdk from "aws-cdk-lib"` etc.

- [ ] Step 1: `npm install aws-cdk-lib constructs --workspace=infra`
- [ ] Step 2: `npm install --save-dev aws-cdk ts-node --workspace=infra`
- [ ] Step 3: Add `infra/cdk.json`:
```json
{
  "app": "npx ts-node --prefer-ts-exts src/bin/app.ts",
  "context": {
    "@aws-cdk/core:newStyleStackSynthesis": true
  }
}
```
- [ ] Step 4: Add `cdk.out/` to `.gitignore`.
- [ ] Step 5: Add `infra/package.json` scripts: `synth`, `diff:dev`, `diff:prod`, `deploy:dev`, `deploy:prod`, `check-table-replacement` (see Task 7).
- [ ] Step 6: Commit: `chore(infra): add CDK dependencies and project config`

---

## Task 2: DynamoDB capacity budget guard (pure function + tests)

**Files:**
- Create: `infra/src/capacity-guard.ts`
- Create: `infra/src/capacity-guard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CapacityUnits { readCapacity: number; writeCapacity: number; }
  export interface StageCapacityConfig { stageName: string; tableCapacity: CapacityUnits; gsi1Capacity: CapacityUnits; }
  export const MAX_TOTAL_CAPACITY_UNITS = 25;
  export function validateCapacityBudget(stageConfigs: StageCapacityConfig[]): void; // throws Error on violation
  ```

- [ ] Step 1: Write failing tests in `infra/src/capacity-guard.test.ts` covering: (a) default dev+prod config passes, (b) RCU over budget throws with a message mentioning RCU, (c) WCU over budget throws with a message mentioning WCU, (d) exactly-25 does not throw (boundary).
- [ ] Step 2: Run `npm test --workspace=infra` — expect FAIL (module not found).
- [ ] Step 3: Implement `infra/src/capacity-guard.ts` per the interface above, summing `tableCapacity + gsi1Capacity` per stage across all stages for RCU and WCU independently, throwing a single `Error` listing every violated dimension.
- [ ] Step 4: Run `npm test --workspace=infra` — expect PASS.
- [ ] Step 5: Commit: `feat(infra): add DynamoDB capacity budget guard`

---

## Task 3: Stage configuration

**Files:**
- Create: `infra/src/config/stages.ts`

**Interfaces:**
- Consumes: `CapacityUnits`, `StageCapacityConfig` from Task 2.
- Produces:
  ```ts
  export type StageName = "dev" | "prod";
  export interface StageConfig extends StageCapacityConfig {
    stageName: StageName;
    isProd: boolean;
    account?: string;
    region: string;
    githubRepo: string; // "owner/repo" for OIDC trust condition
  }
  export const stages: Record<StageName, StageConfig>;
  ```
  Values: dev `{ tableCapacity: {4,4}, gsi1Capacity: {2,2}, account: process.env.CDK_DEV_ACCOUNT, region: process.env.CDK_REGION ?? "us-east-1" }`; prod `{ tableCapacity: {10,10}, gsi1Capacity: {5,5}, account: process.env.CDK_PROD_ACCOUNT, region: process.env.CDK_REGION ?? "us-east-1" }`. `githubRepo: "onetruemint20/paycheck-balance"` for both.

- [ ] Step 1: Implement `infra/src/config/stages.ts` per the interface (no test needed — plain data, exercised indirectly by stack tests in Task 4/5).
- [ ] Step 2: `npm run typecheck --workspace=infra` — expect PASS.
- [ ] Step 3: Commit: `feat(infra): add dev/prod stage configuration`

---

## Task 4: `PaycheckBalanceStack` (DynamoDB, S3+CloudFront, SSM, Logs)

**Files:**
- Create: `infra/src/stacks/paycheck-balance-stack.ts`
- Create: `infra/src/stacks/paycheck-balance-stack.test.ts`

**Interfaces:**
- Consumes: `StageConfig` from Task 3.
- Produces: `export class PaycheckBalanceStack extends cdk.Stack { constructor(scope: Construct, id: string, props: { stage: StageConfig } & cdk.StackProps) }`. Exposes `this.table` (dynamodb.Table) and `this.distribution` (cloudfront.Distribution) as public readonly members for later tasks/tests.

- [ ] Step 1: Write failing test in `paycheck-balance-stack.test.ts` using `aws-cdk-lib/assertions` `Template.fromStack`, asserting for a dev-stage stack: `AWS::DynamoDB::Table` has `ProvisionedThroughput` 4/4, a `GlobalSecondaryIndexes` entry named `GSI1` with 2/2 throughput, `TimeToLiveSpecification.AttributeName === "ttl"`, no `DeletionProtectionEnabled` (or `false`); for a prod-stage stack: table throughput 10/10, GSI1 5/5, `DeletionProtectionEnabled: true`, and `DeletionPolicy: "Retain"` on the table resource. Also assert one `AWS::CloudFront::Distribution`, one `AWS::S3::Bucket`, three `AWS::SSM::Parameter`, and one `AWS::Logs::LogGroup` with `RetentionInDays: 7`.
- [ ] Step 2: Run `npm test --workspace=infra` — expect FAIL (module not found).
- [ ] Step 3: Implement `PaycheckBalanceStack`:
  - DynamoDB table: partition key `PK` (string), sort key `SK` (string), `billingMode: PROVISIONED`, capacity from `props.stage.tableCapacity`, `timeToLiveAttribute: "ttl"`, `removalPolicy` RETAIN/DESTROY and `deletionProtection` true/false based on `props.stage.isProd`. Add GSI named `GSI1` with partition key `GSI1PK`, sort key `GSI1SK`, capacity from `props.stage.gsi1Capacity`.
  - S3 bucket: `blockPublicAccess: BLOCK_ALL`, SSE-S3 encryption, `removalPolicy`/`autoDeleteObjects` mirroring prod/dev like the table.
  - CloudFront distribution: `origins.S3BucketOrigin.withOriginAccessControl(bucket)`, `viewerProtocolPolicy: REDIRECT_TO_HTTPS`, `defaultRootObject: "index.html"`, SPA-style 403/404 → `/index.html` 200 error responses.
  - SSM `StringParameter`s under `/${stage.stageName}/paycheck-balance/...` for table name, site bucket name, distribution domain name.
  - CloudWatch `LogGroup` `/paycheck-balance/${stage.stageName}/app` with `retention: RetentionDays.ONE_WEEK`, removal policy mirroring prod/dev.
- [ ] Step 4: Run `npm test --workspace=infra` — expect PASS.
- [ ] Step 5: `npm run typecheck --workspace=infra` and `npm run lint` — expect PASS.
- [ ] Step 6: Commit: `feat(infra): add PaycheckBalanceStack with DynamoDB, CloudFront, SSM, logs`

---

## Task 5: `GithubOidcStack` (deploy role)

**Files:**
- Create: `infra/src/stacks/github-oidc-stack.ts`
- Create: `infra/src/stacks/github-oidc-stack.test.ts`

**Interfaces:**
- Consumes: `StageConfig` from Task 3.
- Produces: `export class GithubOidcStack extends cdk.Stack { constructor(scope: Construct, id: string, props: { stage: StageConfig } & cdk.StackProps) }`, public readonly `this.deployRole` (iam.Role).

- [ ] Step 1: Write failing test asserting: one `AWS::IAM::OIDCProvider` with `Url: https://token.actions.githubusercontent.com` and `ClientIdList: ["sts.amazonaws.com"]`; one `AWS::IAM::Role` whose `AssumeRolePolicyDocument` contains a `StringLike` condition on `token.actions.githubusercontent.com:sub` referencing `stage.githubRepo`, differing between dev (`ref:refs/heads/main`) and prod (`environment:prod`); an inline/managed policy statement allowing `sts:AssumeRole` only on `cdk-*-deploy-role-*` / `cdk-*-file-publishing-role-*` / `cdk-*-image-publishing-role-*` / `cdk-*-lookup-role-*` resource patterns (no `*` or account-wide admin action).
- [ ] Step 2: Run `npm test --workspace=infra` — expect FAIL.
- [ ] Step 3: Implement `GithubOidcStack` using `iam.OpenIdConnectProvider` + `iam.Role` with `iam.WebIdentityPrincipal`, trust conditions per stage (`ref:refs/heads/main` for dev, `environment:prod` for prod), and a policy statement scoped to the four CDK bootstrap role ARN patterns under `this.account`.
- [ ] Step 4: Run `npm test --workspace=infra` — expect PASS.
- [ ] Step 5: `npm run typecheck --workspace=infra` and `npm run lint` — expect PASS.
- [ ] Step 6: Commit: `feat(infra): add GitHub OIDC deploy role stack`

---

## Task 6: CDK app entrypoint wiring the capacity guard

**Files:**
- Create: `infra/src/bin/app.ts`
- Create: `infra/src/bin/app.test.ts`

**Interfaces:**
- Consumes: `validateCapacityBudget` (Task 2), `stages` (Task 3), `PaycheckBalanceStack` (Task 4), `GithubOidcStack` (Task 5).
- Produces: side-effecting CDK app script; also exports `buildApp(stageOverrides?: Partial<Record<StageName, StageConfig>>): cdk.App` so the guard-triggering behavior is testable without shelling out to the CDK CLI.

- [ ] Step 1: Write failing test in `app.test.ts`: `buildApp()` with default stages does not throw and produces 4 stacks (`PaycheckBalanceStack`/`GithubOidcStack` × dev/prod); `buildApp({ prod: { ...stages.prod, tableCapacity: { readCapacity: 20, writeCapacity: 20 } } })` throws (budget exceeded).
- [ ] Step 2: Run `npm test --workspace=infra` — expect FAIL.
- [ ] Step 3: Implement `app.ts`: `buildApp` calls `validateCapacityBudget` on `[stages.dev, stages.prod]` (merged with overrides) before constructing any stack, then instantiates `PaycheckBalanceStack` (`PaycheckBalance-dev`, `PaycheckBalance-prod`) and `GithubOidcStack` (`GithubOidc-dev`, `GithubOidc-prod`) with `env: { account: stage.account, region: stage.region }`. Module-level code calls `buildApp().synth()` only when run as the CDK CLI entrypoint (guard with `require.main === module`) so importing for tests doesn't double-synth.
- [ ] Step 4: Run `npm test --workspace=infra` — expect PASS.
- [ ] Step 5: `cd infra && npx cdk synth` (no AWS creds needed, env-agnostic) — expect success, prints 4 stack templates.
- [ ] Step 6: `npm run typecheck --workspace=infra` and `npm run lint` — expect PASS.
- [ ] Step 7: Commit: `feat(infra): wire CDK app entrypoint with capacity guard`

---

## Task 7: Table-replacement detection for the prod deploy guard

**Files:**
- Create: `infra/src/deployment-guard.ts`
- Create: `infra/src/deployment-guard.test.ts`
- Create: `infra/scripts/check-table-replacement.ts`

**Interfaces:**
- Produces: `export function detectsTableReplacement(cdkDiffOutput: string): boolean` (pure — matches `/requires replacement/i`). `scripts/check-table-replacement.ts` is a CLI wrapper: takes a stack name argv, shells to `npx cdk diff <stack>`, prints output, calls `detectsTableReplacement`, exits 1 with an explanatory message if true, else exits 0.

- [ ] Step 1: Write failing tests in `deployment-guard.test.ts`: sample diff text containing `"requires replacement"` (case-insensitive, e.g. `"[~] AWS::DynamoDB::Table ... KeySchema (requires replacement)"`) → `true`; ordinary additive diff text with no such phrase → `false`; empty string → `false`.
- [ ] Step 2: Run `npm test --workspace=infra` — expect FAIL.
- [ ] Step 3: Implement `detectsTableReplacement` in `deployment-guard.ts`.
- [ ] Step 4: Implement `scripts/check-table-replacement.ts` per the interface (uses `child_process.execSync`, catches non-zero exit from `cdk diff` and still inspects captured stdout/stderr).
- [ ] Step 5: Run `npm test --workspace=infra` — expect PASS (only the pure function is unit-tested; the CLI wrapper is exercised manually/in the workflow since it needs AWS creds).
- [ ] Step 6: Add `infra/package.json` script: `"check-table-replacement": "ts-node scripts/check-table-replacement.ts"`.
- [ ] Step 7: `npm run typecheck --workspace=infra` and `npm run lint` — expect PASS.
- [ ] Step 8: Commit: `feat(infra): add prod table-replacement deploy guard`

---

## Task 8: CI synth check + GitHub Actions deploy workflows

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-dev.yml`
- Create: `.github/workflows/deploy-prod.yml`

**Interfaces:**
- Consumes: `infra` package scripts from Tasks 1/6/7.

- [ ] Step 1: Add a `Synth infra (capacity guard)` step to `ci.yml` after the existing `Test` step: `run: npm run synth --workspace=infra`. This exercises the real guard (Task 2/6) on every push/PR without needing AWS credentials.
- [ ] Step 2: Run the updated CI step locally: `npm run synth --workspace=infra` — expect success.
- [ ] Step 3: Create `.github/workflows/deploy-dev.yml`: trigger `push: branches: [main]`; `permissions: id-token: write, contents: read`; steps: checkout, setup-node@24, `npm ci`, `aws-actions/configure-aws-credentials@v4` with `role-to-assume: ${{ secrets.AWS_DEV_DEPLOY_ROLE_ARN }}`, then `npm run deploy:dev --workspace=infra` with `CDK_DEV_ACCOUNT`/`CDK_REGION` env from secrets/vars.
- [ ] Step 4: Create `.github/workflows/deploy-prod.yml`: trigger `workflow_dispatch: {}` only (manual); same auth steps against `secrets.AWS_PROD_DEPLOY_ROLE_ARN`; a `Check for DynamoDB table replacement` step running `npm run check-table-replacement --workspace=infra -- PaycheckBalance-prod` **before** the deploy step; then `npm run deploy:prod --workspace=infra`.
- [ ] Step 5: Commit: `ci(infra): add capacity-guard synth check and dev/prod deploy workflows`

---

## Self-Review Checklist (run after all tasks)

- [ ] Every "What to build" bullet from issue #3 maps to a task: CDK stacks dev/prod → Tasks 4–6; DynamoDB + GSI1 + TTL + capacity → Task 4; capacity guard >25 → Task 2/6; prod deletion protection + RETAIN → Task 4; CloudFront/S3 → Task 4; SSM paths per stage → Task 4; CloudWatch 7-day retention → Task 4; GitHub OIDC role → Task 5; auto-deploy dev on merge → Task 8; manual prod workflow + replacement guard → Tasks 7–8.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all pass at the repo root.
- [ ] `cd infra && npx cdk synth` succeeds and produces 4 templates.
- [ ] PR description documents the one-time manual bootstrap step (creating the OIDC role the first time, before OIDC-based CI can deploy) and the required repo secrets/vars.
