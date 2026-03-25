export const convexApi = {
  settings: {
    get: "settings:get",
    setOpenRouterKey: "settings:setOpenRouterKey",
    clearOpenRouterKey: "settings:clearOpenRouterKey",
  },
  deepDives: {
    list: "deepDives:list",
    get: "deepDives:get",
    createDeepDive: "deepDives:createDeepDive",
    createThread: "deepDives:createThread",
    addUploads: "deepDives:addUploads",
    removeUpload: "deepDives:removeUpload",
    appendUserMessage: "deepDives:appendUserMessage",
  },
  ai: {
    sendThreadMessage: "ai:sendThreadMessage",
    runVote: "ai:runVote",
    runDebate: "ai:runDebate",
  },
} as const;
