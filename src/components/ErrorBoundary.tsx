import React from "react";

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div className="min-h-screen bg-background p-6 text-foreground">Something went wrong.</div>;
    }
    return this.props.children;
  }
}