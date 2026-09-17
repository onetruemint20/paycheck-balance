import { Aws, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import type { StageConfig } from "../config/stages";

export interface GithubOidcStackProps extends StackProps {
  stage: StageConfig;
}

const CDK_BOOTSTRAP_ROLE_PATTERNS = [
  "cdk-*-deploy-role-*",
  "cdk-*-file-publishing-role-*",
  "cdk-*-image-publishing-role-*",
  "cdk-*-lookup-role-*",
];

export class GithubOidcStack extends Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const { stage } = props;

    const provider = new iam.OpenIdConnectProvider(this, "GithubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const subCondition = stage.isProd
      ? `repo:${stage.githubRepo}:environment:prod`
      : `repo:${stage.githubRepo}:ref:refs/heads/main`;

    this.deployRole = new iam.Role(this, "GithubActionsDeployRole", {
      roleName: `github-actions-paycheck-balance-${stage.stageName}`,
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": subCondition,
        },
      }),
      maxSessionDuration: Duration.hours(1),
    });

    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        effect: iam.Effect.ALLOW,
        actions: ["sts:AssumeRole"],
        resources: CDK_BOOTSTRAP_ROLE_PATTERNS.map(
          (pattern) => `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/${pattern}`,
        ),
      }),
    );
  }
}
