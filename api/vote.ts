import { handleVote } from "../server/routes/thread-actions";

export default {
  async fetch(request: Request) {
    return handleVote(request);
  },
};
