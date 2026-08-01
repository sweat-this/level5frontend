import { Grid } from '@mui/material';
import YouTube from 'react-youtube';

const videoIds = ['TY44PEt4378', 'Fx3nlW8gf_Y', 'TjtovD-Sb5E', '3Y-kf_PkwZg', '8R8f5mcSj1k', 'uaMFY0477uQ', 'e2Bx2lv33Yo', 'ScO5wpZAvvY'];

export default function DrBlood() {
  return (
    <Grid>
      {videoIds.map((videoId) => (
        <YouTube key={videoId} videoId={videoId} />
      ))}
    </Grid>
  );
}
