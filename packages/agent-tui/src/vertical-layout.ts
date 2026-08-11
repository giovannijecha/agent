import {
  ComponentError,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { measureComponent, renderComponent } from "./component-boundary.js";
import { Frame, type Caret } from "./frame.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import { RichRow } from "./rich-row.js";
import { Viewport } from "./viewport.js";

/** Allocation policy for one component in original vertical order. */
export type VerticalSlot = Readonly<{
  component: Component;
  flex: number;
  minimumRows: number;
  preferredRows: number;
  priority: number;
}>;

type Allocation = {
  readonly index: number;
  readonly measurement: ComponentMeasurement;
  readonly slot: VerticalSlot;
  rows: number;
};

type PlannedAllocation = Readonly<{
  index: number;
  measurement: ComponentMeasurement;
  rows: number;
  slot: VerticalSlot;
}>;

/** Public immutable geometry for one component in a planned layout. */
export type VerticalAllocation = Readonly<{
  contentRows: number;
  viewportRows: number;
}>;

function validSlotNumber(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= TUI_LIMITS.slotValue
  );
}

function byPriority(left: Allocation, right: Allocation): number {
  return right.slot.priority - left.slot.priority || left.index - right.index;
}

function renderAllocations(
  allocations: readonly PlannedAllocation[],
  viewport: Viewport,
): Result<Frame, ComponentError> {
  const rows: RichRow[] = [];
  let caret: Caret | undefined;
  for (const allocation of allocations) {
    if (allocation.rows === 0) {
      continue;
    }
    const componentViewport = Viewport.create(viewport.columns, allocation.rows);
    if (!componentViewport.ok) {
      return err(new ComponentError("invalidGeometry", allocation.index));
    }
    const rendered = renderComponent(
      allocation.slot.component,
      componentViewport.value,
      allocation.index,
    );
    if (!rendered.ok) {
      return rendered;
    }
    if (rendered.value.caret !== undefined) {
      if (caret !== undefined) {
        return err(new ComponentError("multipleCarets", allocation.index));
      }
      caret = Object.freeze({
        row: rows.length + rendered.value.caret.row,
        column: rendered.value.caret.column,
      });
    }
    rows.push(...rendered.value.rows);
  }

  const frame = Frame.create(rows, caret);
  return frame.ok
    ? frame
    : err(new ComponentError("invalidFrame", frame.error.row));
}

/** Immutable measured allocation that renders through the canonical compositor. */
export interface VerticalLayoutPlan {
  allocation(position: number): Result<VerticalAllocation, ComponentError>;
  render(): Result<Frame, ComponentError>;
}

class PlannedVerticalLayout implements VerticalLayoutPlan {
  readonly #allocations: readonly PlannedAllocation[];
  readonly #viewport: Viewport;

  constructor(
    allocations: readonly PlannedAllocation[],
    viewport: Viewport,
  ) {
    this.#allocations = Object.freeze(
      allocations.map((allocation) =>
        Object.freeze({
          index: allocation.index,
          measurement: allocation.measurement,
          rows: allocation.rows,
          slot: allocation.slot,
        }),
      ),
    );
    this.#viewport = viewport;
    Object.freeze(this);
  }

  /** Returns exact measured and assigned rows for one original slot position. */
  allocation(
    position: number,
  ): Result<VerticalAllocation, ComponentError> {
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      position >= this.#allocations.length
    ) {
      return err(new ComponentError("invalidSlot", position));
    }
    const allocation = this.#allocations.at(position);
    if (allocation === undefined) {
      return err(new ComponentError("invalidSlot", position));
    }
    return ok(
      Object.freeze({
        contentRows: allocation.measurement.preferredRows,
        viewportRows: allocation.rows,
      }),
    );
  }

  /** Renders the captured plan without measuring or reallocating components. */
  render(): Result<Frame, ComponentError> {
    return renderAllocations(this.#allocations, this.#viewport);
  }
}

/** Deterministic priority/preference/flex vertical component compositor. */
export class VerticalLayout {
  readonly #slots: readonly VerticalSlot[];

  private constructor(slots: readonly VerticalSlot[]) {
    this.#slots = Object.freeze(
      slots.map((slot) => Object.freeze({ ...slot })),
    );
    Object.freeze(this);
  }

  static create(
    slots: readonly VerticalSlot[],
  ): Result<VerticalLayout, ComponentError> {
    if (
      !Array.isArray(slots) ||
      slots.length < 1 ||
      slots.length > TUI_LIMITS.componentCount
    ) {
      return err(
        new ComponentError(
          "invalidComponentCount",
          Array.isArray(slots) ? slots.length : undefined,
        ),
      );
    }
    const validated: VerticalSlot[] = [];
    for (let index = 0; index < slots.length; index += 1) {
      try {
        const slot: unknown = slots.at(index);
        if (typeof slot !== "object" || slot === null) {
          return err(new ComponentError("invalidSlot", index));
        }
        const candidate = slot as Partial<VerticalSlot>;
        const component = candidate.component;
        const flex = candidate.flex;
        const minimumRows = candidate.minimumRows;
        const preferredRows = candidate.preferredRows;
        const priority = candidate.priority;
        if (
          (typeof component !== "object" && typeof component !== "function") ||
          component === null ||
          typeof component.measure !== "function" ||
          typeof component.render !== "function" ||
          !validSlotNumber(minimumRows ?? -1) ||
          !validSlotNumber(preferredRows ?? -1) ||
          (preferredRows ?? -1) < (minimumRows ?? 0) ||
          !validSlotNumber(flex ?? -1) ||
          !validSlotNumber(priority ?? -1)
        ) {
          return err(new ComponentError("invalidSlot", index));
        }
        validated.push(
          Object.freeze({
            component,
            flex: flex ?? 0,
            minimumRows: minimumRows ?? 0,
            preferredRows: preferredRows ?? 0,
            priority: priority ?? 0,
          }),
        );
      } catch (_cause: unknown) {
        return err(new ComponentError("invalidSlot", index));
      }
    }
    return ok(new VerticalLayout(validated));
  }

  /** Measures once and captures the exact allocation used by rendering. */
  plan(viewport: Viewport): Result<VerticalLayoutPlan, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const allocations: Allocation[] = [];
    for (let index = 0; index < this.#slots.length; index += 1) {
      const slot = this.#slots.at(index);
      if (slot === undefined) {
        return err(new ComponentError("invalidSlot", index));
      }
      const measured = measureComponent(
        slot.component,
        viewport.columns,
        index,
      );
      if (!measured.ok) {
        return measured;
      }
      allocations.push({
        index,
        measurement: Object.freeze({
          preferredRows: measured.value.preferredRows,
        }),
        rows: 0,
        slot,
      });
    }

    let remaining = viewport.rows;
    const prioritized = [...allocations].sort(byPriority);
    for (const allocation of prioritized) {
      const granted = Math.min(allocation.slot.minimumRows, remaining);
      allocation.rows = granted;
      remaining -= granted;
    }
    for (const allocation of prioritized) {
      if (remaining === 0) {
        break;
      }
      const target = Math.max(
        allocation.rows,
        Math.min(
          allocation.slot.preferredRows,
          allocation.measurement.preferredRows,
        ),
      );
      const granted = Math.min(target - allocation.rows, remaining);
      allocation.rows += granted;
      remaining -= granted;
    }

    const flexible = prioritized.filter((allocation) => allocation.slot.flex > 0);
    if (remaining > 0 && flexible.length > 0) {
      const totalFlex = flexible.reduce(
        (total, allocation) => total + allocation.slot.flex,
        0,
      );
      const distributable = remaining;
      const remainders: Readonly<{
        allocation: Allocation;
        numerator: number;
      }>[] = [];
      for (const allocation of flexible) {
        const weighted = distributable * allocation.slot.flex;
        const granted = Math.floor(weighted / totalFlex);
        allocation.rows += granted;
        remaining -= granted;
        remainders.push(
          Object.freeze({ allocation, numerator: weighted % totalFlex }),
        );
      }
      remainders.sort(
        (left, right) =>
          right.numerator - left.numerator ||
          left.allocation.index - right.allocation.index,
      );
      for (const remainder of remainders) {
        if (remaining === 0) {
          break;
        }
        remainder.allocation.rows += 1;
        remaining -= 1;
      }
    }

    return ok(new PlannedVerticalLayout(allocations, viewport));
  }

  render(viewport: Viewport): Result<Frame, ComponentError> {
    const planned = this.plan(viewport);
    return planned.ok ? planned.value.render() : planned;
  }
}
