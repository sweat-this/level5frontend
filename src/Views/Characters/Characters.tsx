import { Grid } from "@mui/material";
import CharacterCard from "./CharacterCard";
import usePageMeta from "../../hooks/usePageMeta";

const characterData = [
  { id: 1, name: "Dr Blood", image: "/images/characters/dblood.png" },
  { id: 2, name: "Dan Russell", image: "/images/characters/danrussell.png" },
  { id: 3, name: "???", image: "/images/characters/dbloodwhite.png" },
  { id: 4, name: "Evelyn Skeleton", image: "/images/characters/eveyln.png" },
  { id: 5, name: "Executioner", image: "/images/characters/executioner.png" },
  { id: 6, name: "Jimmy Ford", image: "/images/characters/jimmyford.png" },
  {
    id: 7,
    name: "Johnny Dracula",
    image: "/images/characters/johnnydracula.png",
  },
  { id: 8, name: "Marion", image: "/images/characters/marion.png" },
  { id: 9, name: "Woody", image: "/images/characters/woody.png" },
  { id: 10, name: "Ninja", image: "/images/characters/ninja.png" },
  { id: 11, name: "Rad Tony", image: "/images/characters/radtony.png" },
  { id: 12, name: "Thom", image: "/images/characters/thom.png" },
  { id: 13, name: "Wizard", image: "/images/characters/wizard.png" },
];

export default function Characters() {
  usePageMeta({
    title: "Sweat This - Characters",
    description: "Meet the playable characters in Level 5.",
  });

  return (
    <Grid container size={12} spacing={2} columnSpacing={2}>
      {characterData.map((item) => (
        <Grid container size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={item.id}>
          <CharacterCard
            title={item.name}
            name={item.name}
            image={item.image}
          />
        </Grid>
      ))}
    </Grid>
  );
}
