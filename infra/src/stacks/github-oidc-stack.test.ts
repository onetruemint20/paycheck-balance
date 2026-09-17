import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { GithubOidcStack } from "./github-oidc-stack";
import { stages } from "../config/stages";

const bootstrapRolePatterns = [
  "cdk-*-deploy-role-*",
  "cdk-*-file-publishing-role-*",
  "cdk-*-image-publishing-role-*",
  "cdk-*-lookup-role-*",
];

describe("GithubOidcStack (dev)", () => {
  const app = new App();
  const stack = new GithubOidcStack(app, "TestGithubOidcDev", { stage: stages.dev });
  const template = Template.fromStack(stack);

  it("creates a GitHub Actions OIDC provider", () => {
    template.hasResourceProperties("Custom::AWSCDKOpenIdConnectProvider", {
      Url: "https://token.actions.githubusercontent.com",
      ClientIDList: ["sts.amazonaws.com"],
    });
  });

  it("trusts the main branch ref for dev", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: Match.objectLike({
                "token.actions.githubusercontent.com:sub":
                  "repo:onetruemint20/paycheck-balance:ref:refs/heads/main",
              }),
            }),
          }),
        ]),
      }),
    });
  });

  it("only allows assuming CDK bootstrap roles, scoped to this account", () => {
    const json = JSON.stringify(template.toJSON());
    for (const pattern of bootstrapRolePatterns) {
      expect(json).toContain(`:role/${pattern}`);
    }
  });

  it("does not grant a wildcard action or resource", () => {
    const json = template.toJSON();
    const policies = Object.values(json.Resources).filter(
      (resource: unknown) => (resource as { Type: string }).Type === "AWS::IAM::Policy",
    );
    for (const policy of policies) {
      const statements = (
        policy as { Properties: { PolicyDocument: { Statement: Array<{ Action: unknown; Resource: unknown }> } } }
      ).Properties.PolicyDocument.Statement;
      for (const statement of statements) {
        expect(statement.Action).not.toBe("*");
        expect(statement.Resource).not.toBe("*");
      }
    }
  });
});

describe("GithubOidcStack (prod)", () => {
  const app = new App();
  const stack = new GithubOidcStack(app, "TestGithubOidcProd", { stage: stages.prod });
  const template = Template.fromStack(stack);

  it("trusts only the prod GitHub environment", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: Match.objectLike({
              StringLike: Match.objectLike({
                "token.actions.githubusercontent.com:sub":
                  "repo:onetruemint20/paycheck-balance:environment:prod",
              }),
            }),
          }),
        ]),
      }),
    });
  });
});
