import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export default function SearchBar({ placeHolder, onInput }: { placeHolder: string; onInput: (value: string) => void }) {
  return (
    <TextField
      placeholder={placeHolder}
      type="Search"
      margin="normal"
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
          style: { textAlign: 'center' }
        }
      }}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onInput(e.target.value)}
      sx={{ width: '100%', backgroundColor: 'TextField.background', margin: 0 }}
    />
  );
}
