import { Grid } from '@mui/material';

export default function Content({
  children,
  pageName,
  headerComponentRight,
  headerComponentLeft
}: {
  children: React.ReactNode;
  pageName: string;
  headerComponentRight?: React.ReactNode;
  headerComponentLeft?: React.ReactNode;
}) {
  return (
    <Grid container sx={{ justifyContent: 'center' }} spacing={2}>
      <Grid size={10} container sx={{ alignItems: 'center' }} spacing={3}>
        <Grid size={6} container sx={{ justifyContent: 'flex-start', alignItems: 'center', gap: 5 }}>
          <h3 style={{ display: 'inline-block' }}>{pageName}</h3>
          {headerComponentLeft}
        </Grid>
        <Grid size={6} container sx={{ justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
          {headerComponentRight}
        </Grid>
      </Grid>
      <Grid container spacing={2} size={11} sx={{ justifyContent: 'center' }}>
        {children}
      </Grid>
    </Grid>
  );
}

