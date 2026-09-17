import { MAX_TOTAL_CAPACITY_UNITS, validateCapacityBudget } from "./capacity-guard";

const devConfig = {
  stageName: "dev",
  tableCapacity: { readCapacity: 4, writeCapacity: 4 },
  gsi1Capacity: { readCapacity: 2, writeCapacity: 2 },
};

const prodConfig = {
  stageName: "prod",
  tableCapacity: { readCapacity: 10, writeCapacity: 10 },
  gsi1Capacity: { readCapacity: 5, writeCapacity: 5 },
};

describe("validateCapacityBudget", () => {
  it("does not throw for the default dev+prod capacity", () => {
    expect(() => validateCapacityBudget([devConfig, prodConfig])).not.toThrow();
  });

  it("does not throw when the total is exactly at the budget", () => {
    const stages = [
      { stageName: "dev", tableCapacity: { readCapacity: 10, writeCapacity: 10 }, gsi1Capacity: { readCapacity: 5, writeCapacity: 5 } },
      { stageName: "prod", tableCapacity: { readCapacity: 5, writeCapacity: 5 }, gsi1Capacity: { readCapacity: 5, writeCapacity: 5 } },
    ];
    expect(() => validateCapacityBudget(stages)).not.toThrow();
  });

  it("throws mentioning RCU when read capacity exceeds the budget", () => {
    const stages = [
      devConfig,
      { ...prodConfig, tableCapacity: { readCapacity: 20, writeCapacity: 10 } },
    ];
    expect(() => validateCapacityBudget(stages)).toThrow(/RCU/);
  });

  it("throws mentioning WCU when write capacity exceeds the budget", () => {
    const stages = [
      devConfig,
      { ...prodConfig, tableCapacity: { readCapacity: 10, writeCapacity: 20 } },
    ];
    expect(() => validateCapacityBudget(stages)).toThrow(/WCU/);
  });

  it("includes the configured budget in the error message", () => {
    const stages = [
      devConfig,
      { ...prodConfig, tableCapacity: { readCapacity: 20, writeCapacity: 20 } },
    ];
    expect(() => validateCapacityBudget(stages)).toThrow(new RegExp(String(MAX_TOTAL_CAPACITY_UNITS)));
  });
});
