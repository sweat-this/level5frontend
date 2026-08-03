import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Class component is required here - React has no hook equivalent for catching render errors
// (getDerivedStateFromError/componentDidCatch have no hooks-based counterpart as of React 19).
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Only reporting mechanism this app has; no error tracking service is wired up yet.
    console.error("Uncaught render error:", error, errorInfo);
  }

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <Box sx={{ textAlign: "center", padding: "4em 1em" }}>
          <Typography variant="h4" gutterBottom>
            Something went wrong.
          </Typography>
          {/* Plain anchor via MUI's `href` prop, not react-router's Link: this boundary can wrap
          the router itself, so its fallback can't depend on router context still being intact. */}
          <Button href="/" variant="contained">
            Back home
          </Button>
        </Box>
      );
    }

    return children;
  }
}
