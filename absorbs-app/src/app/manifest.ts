import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dz connect — تواصل بلا حدود",
    short_name: "Dz connect",
    description: "منشورات حيّة، إعجابات فورية، ورسائل خاصة لحظية.",
    id: "/",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#EDF0FC",
    theme_color: "#6366F1",
    categories: ["social", "entertainment", "communication"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "الرسائل الخاصة", short_name: "الرسائل", url: "/messages", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "منشور جديد", short_name: "نشر", url: "/feed?compose=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
