import { useState } from "react";
import Sidebar from "./components/Sidebar";
import ClaimsPage from "./pages/ClaimsPage";
import DashboardPage from "./pages/DashboardPage";
import ResultsPage from "./pages/ResultsPage";
import FailedPage from "./pages/FailedPage";
import UploadPage from "./pages/UploadPage";
import FlowPage from "./pages/FlowPage";

const PAGES = {
  dashboard: DashboardPage,
  claims:    ClaimsPage,
  results:   ResultsPage,
  failed:    FailedPage,
  upload:    UploadPage,
  flow:      FlowPage,
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const Page = PAGES[page] || DashboardPage;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar active={page} onNav={setPage} />
      <main style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
        <Page />
      </main>
    </div>
  );
}
