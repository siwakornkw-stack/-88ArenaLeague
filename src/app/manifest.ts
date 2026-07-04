import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "88ArenaLeague - ระบบจัดการลีกฟุตบอล",
    short_name: "88ArenaLeague",
    description: "จัดตารางแข่ง บันทึกผลสด ตารางคะแนน สำหรับลีกฟุตบอลสมัครเล่น",
    start_url: "/",
    display: "standalone",
    background_color: "#101410",
    theme_color: "#101410",
    lang: "th",
    categories: ["sports", "productivity"],
    icons: [{ src: "/icon", sizes: "32x32", type: "image/png" }],
  };
}
