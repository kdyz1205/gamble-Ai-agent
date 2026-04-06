"use client";

import React from "react";

interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: "#06060f", color: "#ff4757", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "monospace" }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Something went wrong</h1>
          <pre style={{ color: "#f0f0ff", opacity: 0.7, fontSize: 14, maxWidth: 600, overflow: "auto", whiteSpace: "pre-wrap" }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 24, padding: "12px 24px", background: "#7c5cfc", color: "white", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: "bold" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
