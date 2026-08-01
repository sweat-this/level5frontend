import { Box, CardMedia, Grid } from '@mui/material';
import { Link } from 'react-router-dom';

export default function Title() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <Grid
        container
        sx={{ padding: '1em 1em 0 1em' }}
        spacing={2}
        direction="column"
        alignItems="center"
        justifyContent="center"
      >
        <Grid item alignContent="center">
          <Link to="/level5">
            <CardMedia component="img" height="500" image="/images/logo.png" alt="Level 5 logo" title="Level 5" sx={{ padding: 0 }} />
          </Link>
        </Grid>
      </Grid>
    </Box>
  );
}
