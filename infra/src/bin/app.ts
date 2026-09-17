import { App } from "aws-cdk-lib";
import { validateCapacityBudget } from "../capacity-guard";
import { stages as defaultStages, StageConfig, StageName } from "../config/stages";
import { GithubOidcStack } from "../stacks/github-oidc-stack";
import { PaycheckBalanceStack } from "../stacks/paycheck-balance-stack";

export function buildApp(stageOverrides?: Partial<Record<StageName, StageConfig>>): App {
  const stages: Record<StageName, StageConfig> = {
    dev: stageOverrides?.dev ?? defaultStages.dev,
    prod: stageOverrides?.prod ?? defaultStages.prod,
  };

  validateCapacityBudget([stages.dev, stages.prod]);

  const app = new App();

  for (const stage of Object.values(stages)) {
    const env = stage.account ? { account: stage.account, region: stage.region } : undefined;

    new PaycheckBalanceStack(app, `PaycheckBalance-${stage.stageName}`, { stage, env });
    new GithubOidcStack(app, `GithubOidc-${stage.stageName}`, { stage, env });
  }

  return app;
}

if (require.main === module) {
  buildApp().synth();
}
