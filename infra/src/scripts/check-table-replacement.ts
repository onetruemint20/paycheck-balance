import { execFileSync } from "node:child_process";
import { detectsTableReplacement } from "../deployment-guard";

function main(): void {
  const stackName = process.argv[2];
  if (!stackName) {
    console.error("Usage: check-table-replacement.ts <stack-name>");
    process.exit(1);
  }

  let diffOutput: string;
  try {
    diffOutput = execFileSync("npx", ["cdk", "diff", stackName], { encoding: "utf8" });
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message: string };
    diffOutput = `${execError.stdout ?? ""}${execError.stderr ?? ""}`;
    if (!diffOutput) {
      console.error("cdk diff failed to run:", execError.message);
      process.exit(1);
    }
  }

  console.log(diffOutput);

  if (detectsTableReplacement(diffOutput)) {
    console.error(
      "\nBlocked: cdk diff indicates a resource requires replacement (likely the DynamoDB table).",
    );
    console.error("Table replacement is not allowed in prod. Review the diff above and adjust the change.");
    process.exit(1);
  }

  console.log("\nNo replacement changes detected. Safe to deploy.");
}

main();
