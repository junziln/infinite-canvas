import { createBrowserRouter, Outlet, redirectDocument } from "react-router-dom";
import { Blocks, Video } from "lucide-react";

import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ComingSoonPage from "@/pages/coming-soon";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
// import VideoPage from "@/pages/video";

export const router = createBrowserRouter([
    { path: "/brand-concepts", loader: () => redirectDocument("/brand-concepts/index.html") },
    {
        element: (
            <UserLayout>
                <Outlet />
            </UserLayout>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/image", element: <ImagePage /> },
            { path: "/video", element: <ComingSoonPage title="视频创作台" icon={Video} /> },
            { path: "/skills", element: <ComingSoonPage title="Skills" icon={Blocks} /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/prompts", element: <PromptsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
