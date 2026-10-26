import { HORIZONS, type Horizon } from "../metrics/gameweekExpectations";

/**
 * <points_horizon>: how many upcoming gameweeks an Exp. Pts column adds
 * up, picked on its own header (1 to 5, from the next gameweek). Clicking
 * or dragging it never sorts, filters or moves the column under it, as
 * with the source toggle.
 */
export function HorizonPicker({ value, onChange, figure }: { value: Horizon; onChange: (h: Horizon) => void; figure: string }) {
  const label = `${figure}: gameweeks added up, from the next one`;
  return (
    <select
      className="horizon-picker"
      value={value}
      title={label}
      aria-label={label}
      draggable={false}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(Number(e.target.value) as Horizon)}
    >
      {HORIZONS.map((h) => (
        <option key={h} value={h}>
          {h === 1 ? "1 GW" : `${h} GWs`}
        </option>
      ))}
    </select>
  );
}
