import { buildApp } from "./app";
import { stages } from "../config/stages";

describe("buildApp", () => {
  it("builds 4 stacks for the default dev+prod stages without throwing", () => {
    const app = buildApp();
    const stackIds = app.node.children.map((child) => child.node.id);
    expect(stackIds).toEqual(
      expect.arrayContaining(["PaycheckBalance-dev", "PaycheckBalance-prod", "GithubOidc-dev", "GithubOidc-prod"]),
    );
    expect(app.node.children).toHaveLength(4);
  });

  it("throws when an override pushes total capacity over budget", () => {
    expect(() =>
      buildApp({
        prod: { ...stages.prod, tableCapacity: { readCapacity: 20, writeCapacity: 20 } },
      }),
    ).toThrow(/capacity guard failed/i);
  });
});
