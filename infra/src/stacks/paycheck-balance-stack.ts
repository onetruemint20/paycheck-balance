import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import type { StageConfig } from "../config/stages";

export interface PaycheckBalanceStackProps extends StackProps {
  stage: StageConfig;
}

export class PaycheckBalanceStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: PaycheckBalanceStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const removalPolicy = stage.isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    this.table = new dynamodb.Table(this, "Table", {
      tableName: `paycheck-balance-${stage.stageName}`,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: stage.tableCapacity.readCapacity,
      writeCapacity: stage.tableCapacity.writeCapacity,
      timeToLiveAttribute: "ttl",
      removalPolicy,
      deletionProtection: stage.isProd,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      readCapacity: stage.gsi1Capacity.readCapacity,
      writeCapacity: stage.gsi1Capacity.writeCapacity,
    });

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      removalPolicy,
      autoDeleteObjects: !stage.isProd,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html" },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
      ],
    });

    new ssm.StringParameter(this, "TableNameParam", {
      parameterName: `/${stage.stageName}/paycheck-balance/table-name`,
      stringValue: this.table.tableName,
    });

    new ssm.StringParameter(this, "SiteBucketNameParam", {
      parameterName: `/${stage.stageName}/paycheck-balance/site-bucket-name`,
      stringValue: siteBucket.bucketName,
    });

    new ssm.StringParameter(this, "DistributionDomainParam", {
      parameterName: `/${stage.stageName}/paycheck-balance/distribution-domain`,
      stringValue: this.distribution.distributionDomainName,
    });

    new logs.LogGroup(this, "AppLogGroup", {
      logGroupName: `/paycheck-balance/${stage.stageName}/app`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy,
    });
  }
}
