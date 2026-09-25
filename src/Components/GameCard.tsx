import { Card, CardActions, CardContent, Typography } from "@mui/material";
import Image from "next/image";
import ButtonLink from "@/Components/ButtonLink";

export interface GameCardImage {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly priority?: boolean;
}

export interface GameCardAction {
  readonly label: string;
  readonly href: string;
}

export interface GameCardProps {
  /** Stable id for the card's heading, referenced by the card's aria-labelledby. */
  readonly headingId: string;
  readonly title: string;
  readonly description: string;
  readonly image?: GameCardImage;
  /** Omit for a game with no real destination yet - the card stays a non-interactive,
   *  non-focusable presentation (issue #22's Secret Robot handling). */
  readonly action?: GameCardAction;
}

// Shared homepage game presentation (issue #22) - deliberately narrow: identity + description +
// at most one primary action. Not a catalog/registry; the two callers on "/" own their own copy.
export default function GameCard({
  headingId,
  title,
  description,
  image,
  action,
}: GameCardProps) {
  return (
    <Card
      component="section"
      aria-labelledby={headingId}
      variant="outlined"
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        textAlign: "center",
      }}
    >
      {image && (
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          priority={image.priority}
          style={{
            height: "auto",
            width: "auto",
            maxWidth: "220px",
            maxHeight: "220px",
            margin: "24px auto 0",
          }}
        />
      )}
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography id={headingId} component="h3" variant="h5" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
      {action && (
        <CardActions
          sx={{ justifyContent: "center", padding: 2, paddingTop: 0 }}
        >
          <ButtonLink href={action.href} variant="contained">
            {action.label}
          </ButtonLink>
        </CardActions>
      )}
    </Card>
  );
}
