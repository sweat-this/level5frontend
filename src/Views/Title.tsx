import { Box, CardMedia, Stack } from '@mui/material';
import { Link } from 'react-router-dom';

export default function Title() {
  return (
    <Box sx={{ flexGrow: 1 }}>
      <Stack sx={{ padding: '1em 1em 0 1em', alignItems: 'center', justifyContent: 'center' }} spacing={2}>
        <Link to="/level5">
          <CardMedia component="img" height="500" image="/images/logo.png" alt="Level 5 logo" title="Level 5" sx={{ padding: 0 }} />
        </Link>
      </Stack>
    </Box>
  );
}
