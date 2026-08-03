import { useState } from "react";
import { Box, Grid } from "@mui/material";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import YouTube from "react-youtube";

const videoIds = [
  "TY44PEt4378",
  "Fx3nlW8gf_Y",
  "TjtovD-Sb5E",
  "3Y-kf_PkwZg",
  "8R8f5mcSj1k",
  "uaMFY0477uQ",
  "e2Bx2lv33Yo",
  "ScO5wpZAvvY",
];

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;

export default function DrBlood() {
  // Loading all 8 players up front (each is its own iframe + the YouTube embed script) was
  // costing every visitor 8x that weight whether or not they watched anything. Only the videos
  // someone actually clicks get turned into real players.
  const [playing, setPlaying] = useState<Set<string>>(new Set());

  return (
    <Grid container spacing={2}>
      {videoIds.map((videoId) =>
        playing.has(videoId) ? (
          <Grid key={videoId}>
            <YouTube
              videoId={videoId}
              opts={{
                width: String(THUMBNAIL_WIDTH),
                height: String(THUMBNAIL_HEIGHT),
              }}
            />
          </Grid>
        ) : (
          <Grid key={videoId}>
            <Box
              component="button"
              type="button"
              onClick={() => setPlaying(new Set(playing).add(videoId))}
              aria-label="Play video"
              sx={{
                position: "relative",
                width: THUMBNAIL_WIDTH,
                height: THUMBNAIL_HEIGHT,
                padding: 0,
                border: "none",
                cursor: "pointer",
                backgroundImage: `url(https://img.youtube.com/vi/${videoId}/hqdefault.jpg)`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <PlayCircleIcon
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  fontSize: "4em",
                  color: "white",
                }}
              />
            </Box>
          </Grid>
        ),
      )}
    </Grid>
  );
}
