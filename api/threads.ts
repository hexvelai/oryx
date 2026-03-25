import { handleThreads } from "../server/routes/threads";

export default {
  async fetch(request: Request) {
    return handleThreads(request);
  },
};
