import { Box, Typography } from '@mui/material';
import ButtonLink from '../Components/ButtonLink';

export default function NotFound() {
  return (
    <Box sx={{ textAlign: 'center', padding: '4em 1em' }}>
      <Typography variant="h4" gutterBottom>
        Page not found
      </Typography>
      <ButtonLink to="/" variant="contained">
        Back home
      </ButtonLink>
    </Box>
  );
}
