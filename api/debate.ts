import { handleDebate } from "../server/routes/thread-actions";

export default {
  async fetch(request: Request) {
    return handleDebate(request);
  },
};
