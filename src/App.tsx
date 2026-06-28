import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AppShell } from "./components/AppShell";
import { FullPageLoader } from "./components/ui";
import Landing from "./screens/Landing";
import AuthScreen from "./screens/AuthScreen";
import Onboarding from "./screens/Onboarding";
import ManagerHome from "./screens/ManagerHome";
import CreateModule from "./screens/CreateModule";
import ModuleDetail from "./screens/ModuleDetail";
import RepDetail from "./screens/RepDetail";
import RepHome from "./screens/RepHome";
import Practice from "./screens/Practice";
import Feedback from "./screens/Feedback";
import AllActivity from "./screens/AllActivity";
import Settings from "./screens/Settings";
import PracticeZone from "./screens/PracticeZone";
import Modules from "./screens/Modules";
import Leaderboard from "./screens/Leaderboard";
import History from "./screens/History";
import Hivemind from "./screens/Hivemind";
import Integrations from "./screens/Integrations";

/** Gate: handle auth-loading, redirect, and force onboarding before the app shell. */
function Protected() {
  const viewer = useQuery(api.users.viewer);
  if (viewer === undefined) return <FullPageLoader />;
  if (viewer && !viewer.role) return <Onboarding />;
  return <AppShell />;
}

function RoleHome() {
  const viewer = useQuery(api.users.viewer);
  if (viewer === undefined) return <FullPageLoader />;
  return viewer?.role === "manager" ? <ManagerHome /> : <RepHome />;
}

/** /join/:code — stash the invite code so onboarding joins that team, then go sign in. */
function JoinRedirect() {
  const { code } = useParams<{ code: string }>();
  if (code) localStorage.setItem("rc_invite", code.toUpperCase());
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join/:code" element={<JoinRedirect />} />
      <Route
        path="/login"
        element={
          <>
            <AuthLoading><FullPageLoader /></AuthLoading>
            <Authenticated><Navigate to="/app" replace /></Authenticated>
            <Unauthenticated><AuthScreen /></Unauthenticated>
          </>
        }
      />
      <Route
        path="/app"
        element={
          <>
            <AuthLoading><FullPageLoader /></AuthLoading>
            <Unauthenticated><Navigate to="/login" replace /></Unauthenticated>
            <Authenticated><Protected /></Authenticated>
          </>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="create" element={<CreateModule />} />
        <Route path="modules" element={<Modules />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="module/:moduleId" element={<ModuleDetail />} />
        <Route path="rep/:repId" element={<RepDetail />} />
        <Route path="activity" element={<AllActivity />} />
        <Route path="history" element={<History />} />
        <Route path="hivemind" element={<Hivemind />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="drills" element={<PracticeZone />} />
        <Route path="settings" element={<Settings />} />
        <Route path="practice/:attemptId" element={<Practice />} />
        <Route path="feedback/:attemptId" element={<Feedback />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
