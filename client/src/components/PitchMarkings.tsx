/**
 * The app's pitch markings — centre circle and spot, both penalty boxes and
 * goals — drawn over a `.pitch` (its striped turf and halfway line come from
 * the class). One drawing for every pitch: Team Building's squad and the
 * Team Profile's Formations section.
 */
export function PitchMarkings() {
  return (
    <div className="pitch-markings" aria-hidden="true">
      <div className="pitch-center-circle" />
      <div className="pitch-center-spot" />
      <div className="pitch-penalty-box top" />
      <div className="pitch-goal top" />
      <div className="pitch-penalty-box bottom" />
      <div className="pitch-goal bottom" />
    </div>
  );
}
