import React, { useState } from "react";
import { PositionBadge, AvailabilityFlag, availabilityTextClass } from "./primitives";
import { fmtPrice, fmtPercent, fmtDecimal, DASH } from "../utils/format";
import { fdrColor, type UpcomingFixture } from "../metrics/fixtureTicker";
import { bandForPercentile } from "../metrics/percentiles";
import { SQUAD_RULES } from "../types/team";
import type { SquadValidation } from "../metrics/squadRules";
import type { NormalizedPlayer, Position } from "../types/normalized";

const PITCH_ROW_ORDER: Position[] = ["FWD", "MID", "DEF", "GKP"];
const COMPOSITION_ORDER: Position[] = ["GKP", "DEF", "MID", "FWD"];

function FixtureTicker({ fixtures }: { fixtures: UpcomingFixture[] }) {
  if (fixtures.length === 0) return null;
  return (
    <div className="pitch-card-fixtures">
      {fixtures.map((f) => (
        <span
          key={f.fixtureId}
          className="pitch-card-fixture"
          style={{ background: fdrColor(f.difficulty) }}
          title={`${f.opponentShortName} (${f.isHome ? "H" : "A"}) — FDR ${f.difficulty}`}
        >
          {f.opponentShortName.slice(0, 3)}
        </span>
      ))}
    </div>
  );
}

/** Compact squad-status line — size, budget, composition, club violations — now living in the pitch header instead of a separate card. */
function SquadStatusLine({ validation }: { validation: SquadValidation }) {
  return (
    <div className="pitch-status-line">
      <span className={validation.squadComplete ? "value-positive" : "value-muted"}>
        {validation.squadSize}/{SQUAD_RULES.squadSize} players
      </span>
      <span className={validation.budgetOk ? "value-muted" : "value-negative"}>
        {fmtPrice(validation.budgetUsed)}/{fmtPrice(SQUAD_RULES.budget)} ({fmtPrice(validation.budgetRemaining)} left)
      </span>
      <span>
        {COMPOSITION_ORDER.map((pos) => (
          <span key={pos} className={validation.composition[pos] === SQUAD_RULES.composition[pos] ? "value-positive" : "value-muted"} style={{ marginRight: 8 }}>
            {pos} {validation.composition[pos]}/{SQUAD_RULES.composition[pos]}
          </span>
        ))}
      </span>
      {validation.clubViolations.length > 0 && (
        <span className="value-negative">
          {validation.clubViolations.map((v) => `${v.teamName} ${v.count}/${SQUAD_RULES.maxPerClub}`).join(", ")}
        </span>
      )}
    </div>
  );
}

function PlayerCard({
  player,
  zone,
  isCaptain,
  isViceCaptain,
  isPickable,
  expectedPoints,
  reliability,
  fixtures,
  onDropOnCard,
  onRemove,
  onClick,
  onViewProfile,
}: {
  player: NormalizedPlayer;
  zone: "pitch" | "bench";
  isCaptain: boolean;
  isViceCaptain: boolean;
  isPickable: boolean;
  /** Not yet captain-doubled — this component doubles it for display when isCaptain. */
  expectedPoints: number | null;
  /** 0-1 blended reliability share, or null with neither historic nor live data. */
  reliability: number | null;
  fixtures: UpcomingFixture[];
  onDropOnCard: (draggedId: number, targetId: number, targetZone: "pitch" | "bench") => void;
  onRemove: (id: number) => void;
  onClick: (id: number) => void;
  onViewProfile: (id: number) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const displayPoints = expectedPoints !== null && isCaptain ? expectedPoints * 2 : expectedPoints;
  const reliabilityBand = reliability !== null ? bandForPercentile(reliability * 100) : null;

  return (
    <div
      className={`pitch-card ${isDragOver ? "drag-over" : ""} ${isPickable ? "pickable" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(player.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const draggedId = Number(e.dataTransfer.getData("text/plain"));
        if (draggedId && draggedId !== player.id) onDropOnCard(draggedId, player.id, zone);
      }}
      onClick={() => onClick(player.id)}
    >
      <button
        type="button"
        className="pitch-card-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(player.id);
        }}
        title="Remove from squad"
      >
        ×
      </button>
      {isCaptain && (
        <span className="pitch-card-armband" title="Captain">
          C
        </span>
      )}
      {isViceCaptain && (
        <span className="pitch-card-armband vc" title="Vice-Captain">
          V
        </span>
      )}
      <PositionBadge position={player.position} />
      <div
        className="pitch-card-name"
        onClick={(e) => {
          // A distinct reference point: viewing a profile shouldn't also
          // trigger the card's own click (captain-assign) behaviour.
          e.stopPropagation();
          onViewProfile(player.id);
        }}
        title="View profile"
      >
        <span className={availabilityTextClass(player.status)}>{player.name}</span>
        <AvailabilityFlag status={player.status} news={player.news} chanceOfPlayingNextRound={player.chanceOfPlayingNextRound} />
      </div>
      <div className="pitch-card-team">{player.teamShortName}</div>
      <div className="pitch-card-price">{fmtPrice(player.price)}</div>
      <div className="pitch-card-stats">
        <span title="Ownership">{fmtPercent(player.ownership, 1)}</span>
        <span title="Expected points for the selected window (captain doubled)">{displayPoints !== null ? fmtDecimal(displayPoints, 1) : DASH} pts</span>
      </div>
      <div className="pitch-card-reliability" title="Minutes reliability — blended historic and live playing time, adjusted for current availability">
        <span className={`reliability-dot ${reliabilityBand ?? ""}`} />
        Mins {reliability !== null ? fmtPercent(reliability * 100, 0) : DASH}
      </div>
      <FixtureTicker fixtures={fixtures} />
    </div>
  );
}

export function SquadPitch({
  squadName,
  squadValidation,
  positionGroups,
  benchPlayers,
  captainId,
  viceCaptainId,
  expectedPointsByPlayerId,
  reliabilityByPlayerId,
  fixturesByTeamId,
  captainPickMode,
  onCaptainTileClick,
  onPlayerCardClick,
  onViewProfile,
  onSwap,
  onAddToPitch,
  onBench,
  onRemove,
  onClearSquad,
  onOptimalDraft,
  warning,
}: {
  squadName: string;
  squadValidation: SquadValidation;
  positionGroups: Record<Position, NormalizedPlayer[]>;
  benchPlayers: NormalizedPlayer[];
  captainId: number | null;
  viceCaptainId: number | null;
  expectedPointsByPlayerId: Map<number, number | null>;
  reliabilityByPlayerId: Map<number, number | null>;
  fixturesByTeamId: Map<number, UpcomingFixture[]>;
  captainPickMode: "captain" | "viceCaptain" | null;
  onCaptainTileClick: (role: "captain" | "viceCaptain") => void;
  onPlayerCardClick: (playerId: number) => void;
  onViewProfile: (playerId: number) => void;
  onSwap: (draggedId: number, targetId: number, targetZone: "pitch" | "bench") => void;
  onAddToPitch: (draggedId: number) => void;
  onBench: (draggedId: number) => void;
  onRemove: (id: number) => void;
  onClearSquad: () => void;
  onOptimalDraft: () => void;
  /** A rejected drag/drop shows its reason here briefly (e.g. a club-limit breach). */
  warning: string | null;
}) {
  const [pitchDragOver, setPitchDragOver] = useState(false);
  const [benchDragOver, setBenchDragOver] = useState(false);
  const totalStarting = PITCH_ROW_ORDER.reduce((sum, pos) => sum + positionGroups[pos].length, 0);

  return (
    <div>
      <div className="pitch-view-header">
        <div>
          <div className="pitch-view-title">{squadName}</div>
          <SquadStatusLine validation={squadValidation} />
        </div>
        <div className="captain-tiles">
          <button
            type="button"
            className={`captain-tile ${captainPickMode === "captain" ? "active" : ""}`}
            onClick={() => onCaptainTileClick("captain")}
            title="Click, then click a starting player to make them captain"
          >
            C
          </button>
          <button
            type="button"
            className={`captain-tile vc ${captainPickMode === "viceCaptain" ? "active" : ""}`}
            onClick={() => onCaptainTileClick("viceCaptain")}
            title="Click, then click a starting player to make them vice-captain"
          >
            V
          </button>
          <button type="button" className="chip" onClick={onClearSquad} title="Remove every player from the squad and bench">
            Clear
          </button>
          <button
            type="button"
            className="chip"
            onClick={onOptimalDraft}
            title="Draft the best squad it can find to maximise Exp. Pts (Overall Average) — keeps any players already in your squad and only draws new ones from what's currently showing in the Add Players table below"
          >
            Optimal Draft
          </button>
        </div>
      </div>
      {captainPickMode && (
        <p className="page-subtitle" style={{ marginTop: 0, marginBottom: 8 }}>
          Click a starting player to make them {captainPickMode === "captain" ? "captain" : "vice-captain"} — or click the tile again to
          cancel. Click a player's name instead to view their profile.
        </p>
      )}
      {warning && <div className="banner error">{warning}</div>}

      <div
        className={`pitch ${pitchDragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setPitchDragOver(true);
        }}
        onDragLeave={() => setPitchDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setPitchDragOver(false);
          const draggedId = Number(e.dataTransfer.getData("text/plain"));
          if (draggedId) onAddToPitch(draggedId);
        }}
      >
        <div className="pitch-markings">
          <div className="pitch-center-circle" />
          <div className="pitch-center-spot" />
          <div className="pitch-penalty-box top" />
          <div className="pitch-goal top" />
          <div className="pitch-penalty-box bottom" />
          <div className="pitch-goal bottom" />
        </div>
        {totalStarting === 0 && <p className="pitch-empty-hint">Drag players here from the Add Players list, or from the bench.</p>}
        {PITCH_ROW_ORDER.map((pos) => {
          const players = positionGroups[pos];
          if (players.length === 0) return null;
          return (
            <div className="pitch-row" key={pos}>
              {players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  zone="pitch"
                  isCaptain={p.id === captainId}
                  isViceCaptain={p.id === viceCaptainId}
                  isPickable={captainPickMode !== null}
                  expectedPoints={expectedPointsByPlayerId.get(p.id) ?? null}
                  reliability={reliabilityByPlayerId.get(p.id) ?? null}
                  fixtures={fixturesByTeamId.get(p.teamId) ?? []}
                  onDropOnCard={onSwap}
                  onRemove={onRemove}
                  onClick={onPlayerCardClick}
                  onViewProfile={onViewProfile}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div
        className={`bench-strip ${benchDragOver ? "drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setBenchDragOver(true);
        }}
        onDragLeave={() => setBenchDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setBenchDragOver(false);
          const draggedId = Number(e.dataTransfer.getData("text/plain"));
          if (draggedId) onBench(draggedId);
        }}
      >
        <div className="bench-label">Bench</div>
        <div className="bench-row">
          {benchPlayers.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              zone="bench"
              isCaptain={false}
              isViceCaptain={false}
              isPickable={false}
              expectedPoints={expectedPointsByPlayerId.get(p.id) ?? null}
              reliability={reliabilityByPlayerId.get(p.id) ?? null}
              fixtures={fixturesByTeamId.get(p.teamId) ?? []}
              onDropOnCard={onSwap}
              onRemove={onRemove}
              onClick={onPlayerCardClick}
              onViewProfile={onViewProfile}
            />
          ))}
          {benchPlayers.length === 0 && (
            <p className="page-subtitle" style={{ margin: 0 }}>
              No bench players. Drag one here, or from the Add Players list above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
