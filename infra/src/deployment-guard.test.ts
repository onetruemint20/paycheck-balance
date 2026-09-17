import { detectsTableReplacement } from "./deployment-guard";

describe("detectsTableReplacement", () => {
  it("returns true when the diff marks a resource as requiring replacement", () => {
    const diff = [
      "Stack PaycheckBalance-prod",
      "Resources",
      "[~] AWS::DynamoDB::Table Table TableABC123",
      " └─ [~] KeySchema (requires replacement)",
      "     ├─ [-] [{...}]",
      "     └─ [+] [{...}]",
    ].join("\n");

    expect(detectsTableReplacement(diff)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(detectsTableReplacement("this change REQUIRES REPLACEMENT of the table")).toBe(true);
  });

  it("returns false for an ordinary additive diff", () => {
    const diff = [
      "Stack PaycheckBalance-prod",
      "Resources",
      "[+] AWS::SSM::Parameter NewParam NewParamABC123",
    ].join("\n");

    expect(detectsTableReplacement(diff)).toBe(false);
  });

  it("returns false for an empty diff (no changes)", () => {
    expect(detectsTableReplacement("")).toBe(false);
  });
});
