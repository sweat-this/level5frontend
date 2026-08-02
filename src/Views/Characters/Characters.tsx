import { Grid } from '@mui/material';
import CharacterCard from './CharacterCard';

const characterData = [
  { id: 1, name: 'Dr Blood', description: '', image: '/images/characters/dblood.png' },
  { id: 2, name: 'Dan Russell', description: '', image: '/images/characters/danrussell.png' },
  { id: 3, name: '???', description: '', image: '/images/characters/dbloodwhite.png' },
  { id: 4, name: 'Evelyn Skeleton', description: '', image: '/images/characters/eveyln.png' },
  { id: 5, name: 'Executioner', description: '', image: '/images/characters/executioner.png' },
  { id: 6, name: 'Jimmy Ford', description: '', image: '/images/characters/jimmyford.png' },
  { id: 7, name: 'Johnny Dracula', description: '', image: '/images/characters/johnnydracula.png' },
  { id: 8, name: 'Marion', description: '', image: '/images/characters/marion.png' },
  { id: 9, name: 'Woody', description: '', image: '/images/characters/woody.png' },
  { id: 10, name: 'Ninja', description: '', image: '/images/characters/ninja.png' },
  { id: 11, name: 'Rad Tony', description: '', image: '/images/characters/radtony.png' },
  { id: 12, name: 'Thom', description: '', image: '/images/characters/thom.png' },
  { id: 13, name: 'Wizard', description: '', image: '/images/characters/wizard.png' }
];

export default function Characters() {
  return (
    <Grid container size={12} spacing={2} columnSpacing={2}>
      {characterData.map((item) => (
        <Grid container size={3} key={item.id}>
          <CharacterCard title={item.name} name={item.name} description={item.description} image={item.image} />
        </Grid>
      ))}
    </Grid>
  );
}
