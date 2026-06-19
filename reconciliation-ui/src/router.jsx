import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/Layout";

// Enterprise pages
import OperationsCenter        from "./pages/OperationsCenter";
import ReconciliationWorkbench from "./pages/ReconciliationWorkbench";
import ExceptionManagement     from "./pages/ExceptionManagement";
import FailedPaymentsCenter    from "./pages/FailedPaymentsCenter";
import BankStatementCenter     from "./pages/BankStatementCenter";
import ReportsPage             from "./pages/ReportsPage";

// Retained pages
import ClaimsPage   from "./pages/ClaimsPage";
import BatchesPage  from "./pages/BatchesPage";
import QueuePage    from "./pages/QueuePage";
import FlowPage     from "./pages/FlowPage";

// Legacy aliases (old routes still work)
import ResultsPage  from "./pages/ResultsPage";
import FailedPage   from "./pages/FailedPage";
import UploadPage   from "./pages/UploadPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      // Operations
      { index: true,           element: <OperationsCenter /> },
      { path: "workbench",     element: <ReconciliationWorkbench /> },
      { path: "exceptions",    element: <ExceptionManagement /> },

      // Payments
      { path: "failed",        element: <FailedPaymentsCenter /> },
      { path: "retry",         element: <BatchesPage /> },        // reuses batches page for retry
      { path: "batches",       element: <BatchesPage /> },
      { path: "queue",         element: <QueuePage /> },

      // Data
      { path: "claims",        element: <ClaimsPage /> },
      { path: "statements",    element: <BankStatementCenter /> },

      // Reports
      { path: "reports",       element: <ReportsPage /> },

      // Legacy / compat routes
      { path: "dashboard",     element: <OperationsCenter /> },
      { path: "results",       element: <ReconciliationWorkbench /> },
      { path: "errors",        element: <FailedPaymentsCenter /> },
      { path: "upload",        element: <BankStatementCenter /> },
      { path: "flow",          element: <FlowPage /> },
    ],
  },
]);
