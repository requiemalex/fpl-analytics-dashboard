import React, { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { FiltersBar } from "./FiltersBar";
import { DEFAULT_FILTERS, type GlobalScoutingFilters } from "../state/scoutingFilters";

vi.mock("../state/AppStateContext", () => ({ useAppState: () => ({ teams: [] }) }));

afterEach(cleanup);

/** FiltersBar is fully controlled — this holds its state the way a page does, and exposes every value it reports. */
function Harness({ seen }: { seen: GlobalScoutingFilters[] }) {
  const [filters, setFilters] = useState<GlobalScoutingFilters>(DEFAULT_FILTERS);
  return (
    <FiltersBar
      idPrefix="t"
      filters={filters}
      onChange={(next) => {
        seen.push(next);
        setFilters(next);
      }}
      onReset={() => setFilters(DEFAULT_FILTERS)}
      analysisMode="lastSeason"
      showPrice
    />
  );
}

describe("FiltersBar — Min minutes can be typed", () => {
  it("keeps what's typed digit by digit (it used to round each keystroke to the nearest 90, so '4' became 0 and '450' was impossible)", () => {
    const seen: GlobalScoutingFilters[] = [];
    const { container } = render(<Harness seen={seen} />);
    const input = container.querySelector("#t-min-minutes") as HTMLInputElement;
    for (const typed of ["4", "45", "450"]) {
      fireEvent.change(input, { target: { value: typed } });
      expect(input.value).toBe(typed);
    }
    expect(seen.at(-1)?.minMinutes).toBe(450);
  });

  it("applies any whole number as typed, not rounded to 90", () => {
    const seen: GlobalScoutingFilters[] = [];
    const { container } = render(<Harness seen={seen} />);
    fireEvent.change(container.querySelector("#t-min-minutes")!, { target: { value: "1000" } });
    expect(seen.at(-1)?.minMinutes).toBe(1000);
  });

  it("lets the box be blank while editing (0 applied), then shows the real value when you leave it", () => {
    const seen: GlobalScoutingFilters[] = [];
    const { container } = render(<Harness seen={seen} />);
    const input = container.querySelector("#t-min-minutes") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(seen.at(-1)?.minMinutes).toBe(0);
    fireEvent.blur(input);
    expect(input.value).toBe("0");
  });
});

describe("FiltersBar — price range", () => {
  it("never goes below £0m", () => {
    const seen: GlobalScoutingFilters[] = [];
    const { container } = render(<Harness seen={seen} />);
    fireEvent.change(container.querySelector("#t-min-price")!, { target: { value: "-5" } });
    expect(seen.at(-1)?.minPrice).toBe(0);
  });

  it("blank means no bound", () => {
    const seen: GlobalScoutingFilters[] = [];
    const { container } = render(<Harness seen={seen} />);
    const input = container.querySelector("#t-max-price")!;
    fireEvent.change(input, { target: { value: "6.5" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(seen.at(-1)?.maxPrice).toBeNull();
  });
});
