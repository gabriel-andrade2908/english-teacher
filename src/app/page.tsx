import { ChatAppLoader } from "@/components/ChatAppLoader";
import { isOpenAccess } from "@/server/access";

export default function Home() {
  return <ChatAppLoader canLogOut={!isOpenAccess()} />;
}
