import { lazy } from "react";
import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import Layout from "../Components/Layout";
import NotFound from "../Views/NotFound";

// Lazy-loaded: each pulls in its own heavy dependency (DataGrid, react-youtube, etc.) that
// shouldn't be in the initial bundle for routes the user hasn't visited yet.
const Title = lazy(() => import("../Views/Title"));
const Home = lazy(() => import("../Views/Home"));
const DrBlood = lazy(() => import("../Views/DrBlood"));
const Characters = lazy(() => import("../Views/Characters/Characters"));

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Layout>
        <App />
      </Layout>
    ),
    errorElement: (
      <Layout>
        <NotFound />
      </Layout>
    ),
    children: [
      { path: "", element: <Title /> },
      { path: "/level5", element: <Home /> },
      { path: "/level5/drblood", element: <DrBlood /> },
      { path: "/level5/characters", element: <Characters /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
