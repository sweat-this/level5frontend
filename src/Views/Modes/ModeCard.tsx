import { Card, CardContent, Typography } from "@mui/material";

// Presentation-only mode card (issue #23) - name + short factual description, nothing else. See
// modeCatalog.ts for why there is no id/image/action here.
export default function ModeCard({
  headingId,
  name,
  description,
}: Readonly<{
  headingId: string;
  name: string;
  description: string;
}>) {
  return (
    <Card component="section" aria-labelledby={headingId} variant="outlined">
      <CardContent>
        <Typography id={headingId} component="h3" variant="h6" gutterBottom>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}
