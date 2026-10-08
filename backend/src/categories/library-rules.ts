import type {
  CategoryScope,
  EntryRule,
  DeckRule,
  Truth,
} from "@spellbook/contracts/category-library.ts";
import { ValidationError } from "../mtg/validation.ts";
import { starterDefinitions } from "./rules.ts";
export type RuleFacts = {
  types?: string[] | null;
  keywords?: string[] | null;
  oracleId?: string | null;
  roots?: Record<string, string[] | undefined>;
  comboParticipants?: Record<string, Truth>;
};
export function validateRule(
  input: unknown,
  scope: CategoryScope,
): EntryRule | DeckRule {
  const stack = [{ value: input, depth: 1, scope }];
  let nodes = 0;
  let selections = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (item.depth > 8) fail("Rule depth exceeds 8");
    if (++nodes > 128) fail("Rule nodes exceed 128");
    const r = object(item.value);
    const child = (value: unknown, nextScope = item.scope) =>
      stack.push({ value, depth: item.depth + 1, scope: nextScope });
    switch (r.op) {
      case "all":
      case "any":
        keys(r, ["op", "children"]);
        if (!Array.isArray(r.children) || !r.children.length)
          fail("Rule groups require children");
        if (nodes + stack.length + r.children.length > 128)
          fail("Rule nodes exceed 128");
        for (const value of r.children) child(value);
        break;
      case "not":
        keys(r, ["op", "child"]);
        child(r.child);
        break;
      case "type":
      case "keyword":
        entry(item.scope);
        keys(r, ["op", "value"]);
        boundedText(r.value);
        break;
      case "oracleTag":
        entry(item.scope);
        keys(r, ["op", "tagId", "includeDescendants"]);
        validUuid(r.tagId);
        if (typeof r.includeDescendants !== "boolean")
          fail("Tag descendants must be explicit");
        break;
      case "mappedTrait":
        entry(item.scope);
        keys(r, ["op", "traitId", "mappingVersion"]);
        if (!starterDefinitions.some((d) => d.origin === r.traitId))
          fail("Unknown mapped trait");
        integer(r.mappingVersion, 1, 2147483647);
        break;
      case "canonicalCards":
        entry(item.scope);
        keys(r, ["op", "oracleIds"]);
        if (!Array.isArray(r.oracleIds) || !r.oracleIds.length)
          fail("Select at least one canonical card");
        selections += r.oracleIds.length;
        if (selections > 100) fail("Rule canonical selections exceed 100");
        for (const id of r.oracleIds) validUuid(id);
        if (new Set(r.oracleIds).size !== r.oracleIds.length)
          fail("Duplicate canonical selection");
        break;
      case "minimumCopies":
      case "minimumDistinct":
        deck(item.scope);
        keys(r, ["op", "predicate", "minimum"]);
        integer(r.minimum, 1, 2147483647);
        child(r.predicate, "entry");
        break;
      case "percentage":
        deck(item.scope);
        keys(r, ["op", "predicate", "basisPoints", "denominator"]);
        integer(r.basisPoints, 0, 10000);
        if (r.denominator !== "all-cards" && r.denominator !== "nonland")
          fail("Unknown percentage denominator");
        child(r.predicate, "entry");
        break;
      case "comboParticipant":
      case "comboOutcome":
        if (r.op === "comboParticipant") entry(item.scope);
        else deck(item.scope);
        keys(r, ["op", "outcomeId", "policyVersion"]);
        if (
          typeof r.outcomeId !== "string" ||
          !/^[1-9]\d{0,19}$/.test(r.outcomeId) ||
          r.policyVersion !== "ingredients-v1"
        )
          fail("Invalid documented combo identity or policy");
        break;
      default:
        fail("Unknown rule operator");
    }
  }
  return input as EntryRule | DeckRule;
}
export function evaluateEntryRule(
  rule: EntryRule,
  facts: RuleFacts,
  landAssumption?: boolean,
): Truth {
  switch (rule.op) {
    case "all":
    case "any": {
      const values = rule.children.map((r) =>
        evaluateEntryRule(r, facts, landAssumption),
      );
      if (rule.op === "all")
        return values.includes("False")
          ? "False"
          : values.includes("Unknown")
            ? "Unknown"
            : "True";
      return values.includes("True")
        ? "True"
        : values.includes("Unknown")
          ? "Unknown"
          : "False";
    }
    case "not": {
      const result = evaluateEntryRule(rule.child, facts, landAssumption);
      return result === "Unknown"
        ? result
        : result === "True"
          ? "False"
          : "True";
    }
    case "type":
      return rule.value === "Land" && landAssumption !== undefined
        ? landAssumption
          ? "True"
          : "False"
        : includes(facts.types, rule.value);
    case "keyword":
      return includes(facts.keywords, rule.value);
    case "canonicalCards":
      return !facts.oracleId
        ? "Unknown"
        : rule.oracleIds.includes(facts.oracleId)
          ? "True"
          : "False";
    case "oracleTag": {
      const matches = facts.oracleId ? facts.roots?.[rule.tagId] : undefined;
      return matches === undefined
        ? "Unknown"
        : (
              rule.includeDescendants
                ? matches.length > 0
                : matches.includes(rule.tagId)
            )
          ? "True"
          : "False";
    }
    case "mappedTrait": {
      if (rule.mappingVersion !== 1) return "Unknown";
      const definition = starterDefinitions.find(
        (d) => d.origin === rule.traitId,
      )!;
      const land =
        landAssumption ??
        (facts.types == null ? undefined : facts.types.includes("Land"));
      if (definition.origin === "lands")
        return land === undefined ? "Unknown" : land ? "True" : "False";
      if (definition.excludeLand && land === true) return "False";
      if (definition.excludeLand && land === undefined) return "Unknown";
      return evaluateEntryRule(
        {
          op: "oracleTag",
          tagId: definition.rootId!,
          includeDescendants: definition.descendants,
        },
        facts,
      );
    }
    case "comboParticipant":
      return facts.comboParticipants?.[rule.outcomeId] ?? "Unknown";
  }
}
function fail(message: string): never {
  throw new ValidationError(message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Rule must be an object");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    allowed.some((key) => !(key in value))
  )
    fail("Rule fields do not match its operator");
}
function entry(scope: CategoryScope) {
  if (scope !== "entry") fail("Entry rule requires entry scope");
}
function deck(scope: CategoryScope) {
  if (scope !== "deck") fail("Aggregate rule requires deck scope");
}
function boundedText(value: unknown) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !value.length ||
    value.length > 128
  )
    fail("Rule value must contain 1 to 128 characters");
}
function integer(value: unknown, minimum: number, maximum: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  )
    fail("Rule number is outside its allowed range");
}
function validUuid(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
  )
    fail("Invalid canonical UUID");
}
function includes(values: string[] | null | undefined, value: string): Truth {
  return values == null ? "Unknown" : values.includes(value) ? "True" : "False";
}
export function ruleRoots(rule: EntryRule): string[] {
  if (rule.op === "oracleTag") return [rule.tagId];
  if (rule.op === "mappedTrait") {
    const d = starterDefinitions.find((d) => d.origin === rule.traitId);
    return rule.mappingVersion === 1 && d?.rootId ? [d.rootId] : [];
  }
  if (rule.op === "not") return ruleRoots(rule.child);
  if (rule.op === "all" || rule.op === "any")
    return rule.children.flatMap(ruleRoots);
  return [];
}
