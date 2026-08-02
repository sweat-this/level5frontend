import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import { Chip, Grid, SxProps, Table, TableBody, TableCell, tableCellClasses, TableRow, Theme, Typography } from '@mui/material';
import ButtonLink from './ButtonLink';
import useCurrentVersion from '../api/hooks/useCurrentVersion';

const style: SxProps<Theme> = {
  color: 'text.primary',
  backgroundImage: 'none',
  backgroundColor: 'background.default',
  boxShadow: 'none',
  position: 'unset',
};

function getStatusChipColor(isError: boolean): 'error' | 'success' {
  return isError ? 'error' : 'success';
}

function getServerStatusLabel(isError: boolean): 'Offline' | 'Online' {
  return isError ? 'Offline' : 'Online';
}

export default function MainNavBar() {
  const { data: currentVersion, isError, isPending } = useCurrentVersion();
  const versionLabel = currentVersion ?? (isPending ? 'Loading...' : 'Unknown');

  return (
    <AppBar sx={style}>
      <Toolbar>
        <Grid container size={12}>
          <Grid container size={6} direction="row" sx={{ justifyContent: 'left' }}>
            <ButtonLink to="/" sx={{ fontWeight: 'bolder', fontSize: '1.1em' }}>
              Title
            </ButtonLink>
            <ButtonLink to="/level5" sx={{ fontWeight: 'bolder', fontSize: '1.1em' }}>
              Scores
            </ButtonLink>
            <ButtonLink to="/level5/characters" sx={{ fontWeight: 'bolder', fontSize: '1.1em' }}>
              Characters
            </ButtonLink>
            <ButtonLink to="/level5/drblood" sx={{ fontWeight: 'bolder', fontSize: '1.1em' }}>
              Dr Blood
            </ButtonLink>
          </Grid>
          <Grid container size={6} direction="row" sx={{ justifyContent: 'right' }}>
            <Table
              sx={{
                [`& .${tableCellClasses.root}`]: {
                  borderBottom: 'none',
                },
              }}
            >
              <TableBody>
                <TableRow>
                  <TableCell align="right">
                    <Typography> Current Version</Typography>
                  </TableCell>
                  <TableCell align="left">
                    <Chip label={versionLabel} color={getStatusChipColor(isError)} />
                  </TableCell>
                  <TableCell align="right">
                    <Typography> Server Status</Typography>
                  </TableCell>
                  <TableCell align="left">
                    <Chip label={getServerStatusLabel(isError)} color={getStatusChipColor(isError)} />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>
        </Grid>
      </Toolbar>
    </AppBar>
  );
}
