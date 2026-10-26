import { useEffect } from "react";
import { useAppState } from "../state/AppStateContext";
import { PlayerExplorerTable } from "../components/PlayerExplorerTable";

/** Player Explorer: the shared player table (<shared_player_table>), filling the page. Team Building's Add Players is the same table. */
export function PlayerExplorer() {
  const { requestHistoricData } = useAppState();
  useEffect(() => {
    requestHistoricData();
  }, [requestHistoricData]);

  return (
    <div className="page-fill">
      <div className="page-header">
        <div>
          <h1>Player Explorer</h1>
        </div>
      </div>
      <PlayerExplorerTable variant="page" searchInputId="pe-toolbar-search" csvName="player-explorer" />
    </div>
  );
}
