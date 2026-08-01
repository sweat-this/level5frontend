import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Mode } from '../constants/Enums';

function getValueFromValueOptions(value: number): string {
  return value === 0 ? 'No' : 'Yes';
}

function getVersusFinishFromValueOptions(row: Highscore): string {
  if (row.modeid !== Mode.VersusCpu) {
    return '';
  }

  let playerFinish = 4;
  if (row.p1IsCpu === 0) playerFinish = 1;
  if (row.p2IsCpu === 0) playerFinish = 2;
  if (row.p3IsCpu === 0) playerFinish = 3;
  if (row.p4IsCpu === 0) playerFinish = 4;

  return `${playerFinish} of ${row.numPlayers}`;
}

const highscoreColumns: GridColDef<Highscore>[] = [
  { field: 'id', headerName: 'id', flex: 1 },
  { field: 'date', headerName: 'date', flex: 1 },
  { field: 'version', headerName: 'version', flex: 1 },
  { field: 'username', headerName: 'user', flex: 1 },
  { field: 'character', headerName: 'character', flex: 1 },
  { field: 'level', headerName: 'level', flex: 1 },
  { field: 'modeName', headerName: 'mode', flex: 1 },
  { field: 'totalPoints', headerName: 'points', flex: 1 },
  { field: 'time', headerName: 'time', flex: 1 },
  { field: 'longestShot', headerName: 'longest', flex: 1 },
  { field: 'totalDistance', headerName: 'total distance', flex: 1 },
  { field: 'maxShotMade', headerName: 'made', flex: 1 },
  { field: 'maxShotAtt', headerName: 'attempts', flex: 1 },
  { field: 'consecutiveShots', headerName: ' consecutive', flex: 1 },
  {
    field: 'hardcoreEnabled',
    headerName: 'hardcore',
    flex: 1,
    renderCell: (params: GridRenderCellParams<Highscore>) => getValueFromValueOptions(params.row.hardcoreEnabled),
  },
  {
    field: 'enemiesEnabled',
    headerName: 'enemies',
    flex: 1,
    renderCell: (params: GridRenderCellParams<Highscore>) => getValueFromValueOptions(params.row.enemiesEnabled),
  },
  { field: 'enemiesKilled', headerName: 'nerds bashed', flex: 1 },
  {
    field: 'trafficEnabled',
    headerName: 'traffic',
    flex: 1,
    renderCell: (params: GridRenderCellParams<Highscore>) => getValueFromValueOptions(params.row.trafficEnabled),
  },
  {
    field: 'sniperEnabled',
    headerName: 'sniper',
    flex: 1,
    renderCell: (params: GridRenderCellParams<Highscore>) => getValueFromValueOptions(params.row.sniperEnabled),
  },
  {
    field: 'p1IsCpu',
    headerName: 'Vs',
    flex: 1,
    renderCell: (params: GridRenderCellParams<Highscore>) => getVersusFinishFromValueOptions(params.row),
  },
];

export default highscoreColumns;
