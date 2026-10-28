import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/ui/theme/ThemeProvider";
import { StandaloneScratchpadPoc } from "@/ui/components/scratchpad_poc/StandaloneScratchpadPoc";
import "@/index.css";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="dark">
        <StandaloneScratchpadPoc />
      </ThemeProvider>
    </React.StrictMode>
  );
}
