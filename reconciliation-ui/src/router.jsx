import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import ClaimsPage from "./pages/ClaimsPage";
import BatchesPage from "./pages/BatchesPage";
import QueuePage from "./pages/QueuePage";
import ResultsPage from "./pages/ResultsPage";
import FailedPage from "./pages/FailedPage";
import UploadPage from "./pages/UploadPage";
import FlowPage from "./pages/FlowPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true,         element: <DashboardPage /> },
      { path: "dashboard",   element: <DashboardPage /> },
      { path: "claims",      element: <ClaimsPage /> },
      { path: "batches",     element: <BatchesPage /> },
      { path: "queue",       element: <QueuePage /> },
      { path: "results",     element: <ResultsPage /> },
      { path: "errors",      element: <FailedPage /> },
      { path: "upload",      element: <UploadPage /> },
      { path: "flow",        element: <FlowPage /> },
    ],
  },
]);
