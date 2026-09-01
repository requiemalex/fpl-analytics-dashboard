import React from "react";
import { championshipData, promotionRouteLabel, resultBadgeClass, ordinal } from "../normalize/normalizeChampionship";
import { fmtSigned } from "../utils/format";
import type { ChampionshipSplit, PromotedTeam } from "../types/championship";

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat-row">
      <span className="stat-row-name">{label}</span>
      <span className="stat-row-value">{value}</span>
    </div>
  );
}

function FormStrip({ team }: { team: PromotedTeam }) {
  return (
    <div className="chip-row" style={{ marginTop: 6 }}>
      {team.form.matches.map((m, i) => (
        <span
          key={i}
          className={`badge ${resultBadgeClass(m.result)}`}
          title={`${m.isHome ? "vs" : "at"} ${m.opponent}: ${m.goalsFor}-${m.goalsAgainst} (${m.date})`}
          style={{ minWidth: 18, textAlign: "center" }}
        >
          {m.result}
        </span>
      ))}
    </div>
  );
}

function PromotedTeamCard({ team }: { team: PromotedTeam }) {
  return (
    <div className="card">
      <div className="card-title">{team.team}</div>
      <p className="page-subtitle" style={{ marginTop: 0 }}>
        {promotionRouteLabel(team.promotionRoute)} · Finished {ordinal(team.finalPosition)} of {championshipData.table.length}
      </p>
      <StatRow label="Points" value={team.points} />
      <StatRow label="Record" value={`${team.won}W ${team.drawn}D ${team.lost}L`} />
      <StatRow label="Goal Difference" value={fmtSigned(team.goalDifference, 0)} />
      <StatRow label="Goals For / Against" value={`${team.goalsFor} / ${team.goalsAgainst}`} />
      <StatRow label="Clean Sheets" value={team.cleanSheets} />
      <div style={{ marginTop: 10 }}>
        <span className="stat-row-name">Form (last {team.form.window})</span>
        <FormStrip team={team} />
      </div>
    </div>
  );
}

function splitCell(split: ChampionshipSplit): string {
  return `${split.won}W ${split.drawn}D ${split.lost}L (${split.points} pts)`;
}

export function Championship() {
  const { table, promotedTeams, season, division } = championshipData;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Championship — Promoted Teams</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            {season} {division} final table — the three clubs promoted to the Premier League.
          </p>
        </div>
      </div>

      <div className="card-grid">
        {promotedTeams.map((team) => (
          <PromotedTeamCard key={team.team} team={team} />
        ))}
      </div>

      <div className="section-heading">Head-to-Head Comparison</div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table compact">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Metric</th>
                {promotedTeams.map((t) => (
                  <th key={t.team}>{t.team}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: "left" }}>Final Position</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{ordinal(t.finalPosition)}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Points</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{t.points}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Goal Difference</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{fmtSigned(t.goalDifference, 0)}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Record (W-D-L)</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{`${t.won}-${t.drawn}-${t.lost}`}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Home Record</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{splitCell(t.home)}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Away Record</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{splitCell(t.away)}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Clean Sheets</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{t.cleanSheets}</td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Yellow / Red Cards</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>
                    {t.discipline.yellowCards} / {t.discipline.redCards}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ textAlign: "left" }}>Fouls Committed</td>
                {promotedTeams.map((t) => (
                  <td key={t.team}>{t.discipline.fouls}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-heading">Full {division} Table</div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table compact">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>#</th>
                <th style={{ textAlign: "left" }}>Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => {
                const promoted = promotedTeams.find((t) => t.team === row.team);
                return (
                  <tr key={row.team} style={promoted ? { background: "var(--accent-positive-dim)" } : undefined}>
                    <td style={{ textAlign: "left" }}>{row.position}</td>
                    <td style={{ textAlign: "left", fontFamily: "var(--font-body)" }}>
                      {row.team}
                      {promoted && (
                        <span className="badge" style={{ marginLeft: 6, borderColor: "var(--accent-positive)", color: "var(--accent-positive)" }}>
                          {promotionRouteLabel(promoted.promotionRoute)}
                        </span>
                      )}
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goalsFor}</td>
                    <td>{row.goalsAgainst}</td>
                    <td>{fmtSigned(row.goalDifference, 0)}</td>
                    <td>{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
