import { describe, expect, it } from "bun:test";
import { cn } from "./utils";

describe("cn", () => {
  it("documents the project-specific text token pitfall", () => {
    expect(cn("text-stat text-tomato")).toBe("text-tomato");
  });
});
