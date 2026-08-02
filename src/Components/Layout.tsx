import { Grid } from '@mui/material';
import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import MainNavBar from './MainNavBar';

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const root = '/';
  const location = useLocation().pathname;

  return (
    <>
      {/* render navbar if NOT title screen */}
      {location !== root ? (
        <Grid id="header">
          <MainNavBar />
        </Grid>
      ) : (
        <Grid />
      )}
      <Grid id="mainContainer">
        <Grid id="scrollableContent">{children}</Grid>
      </Grid>
      <Grid id="footer" />
    </>
  );
}
