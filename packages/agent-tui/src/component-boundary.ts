import {
  ComponentError,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import type { Viewport } from "./viewport.js";

type UnknownResult = {
  readonly error?: unknown;
  readonly ok?: unknown;
  readonly value?: unknown;
};

function validMeasuredRows(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= TUI_LIMITS.frameRows
  );
}

/** Contains one untrusted component measurement behind the owned Result edge. */
export function measureComponent(
  component: Component,
  columns: number,
  position?: number,
): Result<ComponentMeasurement, ComponentError> {
  try {
    const result: unknown = component.measure(columns);
    if (typeof result !== "object" || result === null) {
      return err(new ComponentError("invalidComponent", position));
    }
    const candidate = result as UnknownResult;
    if (candidate.ok === false) {
      return candidate.error instanceof ComponentError
        ? err(candidate.error)
        : err(new ComponentError("invalidComponent", position));
    }
    if (
      candidate.ok !== true ||
      typeof candidate.value !== "object" ||
      candidate.value === null
    ) {
      return err(new ComponentError("invalidComponent", position));
    }
    const measurement = candidate.value as Partial<ComponentMeasurement>;
    const preferredRows = measurement.preferredRows ?? -1;
    return validMeasuredRows(preferredRows)
      ? ok(Object.freeze({ preferredRows }))
      : err(new ComponentError("invalidMeasurement", position));
  } catch (_cause: unknown) {
    return err(new ComponentError("unexpectedComponent", position));
  }
}

/** Contains and revalidates one untrusted component render operation. */
export function renderComponent(
  component: Component,
  viewport: Viewport,
  position?: number,
): Result<Fragment, ComponentError> {
  try {
    const result: unknown = component.render(viewport);
    if (typeof result !== "object" || result === null) {
      return err(new ComponentError("invalidComponent", position));
    }
    const candidate = result as UnknownResult;
    if (candidate.ok === false) {
      return candidate.error instanceof ComponentError
        ? err(candidate.error)
        : err(new ComponentError("invalidComponent", position));
    }
    if (candidate.ok !== true || !(candidate.value instanceof Fragment)) {
      return err(new ComponentError("invalidComponent", position));
    }
    return Fragment.create(
      viewport,
      candidate.value.lines,
      candidate.value.caret,
      candidate.value.tones,
    );
  } catch (_cause: unknown) {
    return err(new ComponentError("unexpectedComponent", position));
  }
}
