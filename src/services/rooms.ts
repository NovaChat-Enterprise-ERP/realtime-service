export const rooms = {
  workspace: (workspaceId: string) => `ws:${workspaceId}`,
  user: (workspaceId: string, userId: string) => `user:${workspaceId}:${userId}`,
  conversation: (conversationId: string) => `conv:${conversationId}`,
};
