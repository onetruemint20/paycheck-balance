import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { PaycheckBalanceStack } from "./paycheck-balance-stack";
import { stages } from "../config/stages";

describe("PaycheckBalanceStack (dev)", () => {
  const app = new App();
  const stack = new PaycheckBalanceStack(app, "TestPaycheckBalanceDev", { stage: stages.dev });
  const template = Template.fromStack(stack);

  it("creates a DynamoDB table with dev capacity, TTL, and GSI1", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      ProvisionedThroughput: { ReadCapacityUnits: 4, WriteCapacityUnits: 4 },
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "GSI1",
          ProvisionedThroughput: { ReadCapacityUnits: 2, WriteCapacityUnits: 2 },
        }),
      ]),
    });
  });

  it("does not enable deletion protection for dev and allows deletion", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      Properties: Match.objectLike({ DeletionProtectionEnabled: false }),
      DeletionPolicy: "Delete",
    });
  });

  it("creates exactly one CloudFront distribution and one S3 bucket", () => {
    template.resourceCountIs("AWS::CloudFront::Distribution", 1);
    template.resourceCountIs("AWS::S3::Bucket", 1);
  });

  it("creates dev-prefixed SSM parameters for table, bucket, and distribution", () => {
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/dev/paycheck-balance/table-name",
    });
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/dev/paycheck-balance/site-bucket-name",
    });
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/dev/paycheck-balance/distribution-domain",
    });
  });

  it("creates a CloudWatch log group with 7-day retention", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/paycheck-balance/dev/app",
      RetentionInDays: 7,
    });
  });
});

describe("PaycheckBalanceStack (prod)", () => {
  const app = new App();
  const stack = new PaycheckBalanceStack(app, "TestPaycheckBalanceProd", { stage: stages.prod });
  const template = Template.fromStack(stack);

  it("creates a DynamoDB table with prod capacity and GSI1 capacity", () => {
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      ProvisionedThroughput: { ReadCapacityUnits: 10, WriteCapacityUnits: 10 },
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "GSI1",
          ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
        }),
      ]),
    });
  });

  it("enables deletion protection and RETAINs the table", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      Properties: Match.objectLike({ DeletionProtectionEnabled: true }),
      DeletionPolicy: "Retain",
    });
  });

  it("uses /prod SSM parameter paths", () => {
    template.hasResourceProperties("AWS::SSM::Parameter", {
      Name: "/prod/paycheck-balance/table-name",
    });
  });

  it("creates a CloudWatch log group with 7-day retention", () => {
    template.hasResourceProperties("AWS::Logs::LogGroup", {
      LogGroupName: "/paycheck-balance/prod/app",
      RetentionInDays: 7,
    });
  });
});
