import { handleChat } from "../server/routes/chat";

export default {
  async fetch(request: Request) {
    return handleChat(request);
  },
};
