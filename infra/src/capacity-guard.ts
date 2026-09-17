export interface CapacityUnits {
  readCapacity: number;
  writeCapacity: number;
}

export interface StageCapacityConfig {
  stageName: string;
  tableCapacity: CapacityUnits;
  gsi1Capacity: CapacityUnits;
}

export const MAX_TOTAL_CAPACITY_UNITS = 25;

export function validateCapacityBudget(stageConfigs: StageCapacityConfig[]): void {
  const totalReadCapacity = stageConfigs.reduce(
    (sum, stage) => sum + stage.tableCapacity.readCapacity + stage.gsi1Capacity.readCapacity,
    0,
  );
  const totalWriteCapacity = stageConfigs.reduce(
    (sum, stage) => sum + stage.tableCapacity.writeCapacity + stage.gsi1Capacity.writeCapacity,
    0,
  );

  const errors: string[] = [];
  if (totalReadCapacity > MAX_TOTAL_CAPACITY_UNITS) {
    errors.push(
      `Total read capacity ${totalReadCapacity} RCU exceeds the budget of ${MAX_TOTAL_CAPACITY_UNITS} RCU across stages`,
    );
  }
  if (totalWriteCapacity > MAX_TOTAL_CAPACITY_UNITS) {
    errors.push(
      `Total write capacity ${totalWriteCapacity} WCU exceeds the budget of ${MAX_TOTAL_CAPACITY_UNITS} WCU across stages`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`DynamoDB capacity guard failed:\n${errors.join("\n")}`);
  }
}
