import type { ConversationAccessDto, WorkspaceAccessDto } from '@novachat-enterprise-erp/contracts';
import type { InternalHttpClient } from '@novachat-enterprise-erp/common';

export interface AccessDirectory {
  workspaceAccess(workspaceId: string, userId: string): Promise<WorkspaceAccessDto | null>;
  conversationIds(workspaceId: string, userId: string): Promise<string[]>;
  conversationAccess(conversationId: string, userId: string): Promise<ConversationAccessDto | null>;
}

export class ServiceAccessDirectory implements AccessDirectory {
  constructor(
    private readonly workspaces: InternalHttpClient,
    private readonly messages: InternalHttpClient,
  ) {}

  workspaceAccess(workspaceId: string, userId: string) {
    return this.workspaces.request<WorkspaceAccessDto>(`/internal/workspaces/${workspaceId}/members/${encodeURIComponent(userId)}/access`);
  }

  async conversationIds(workspaceId: string, userId: string) {
    const result = await this.messages.request<{ items: string[] }>(
      `/internal/workspaces/${workspaceId}/users/${encodeURIComponent(userId)}/conversations`,
    );
    return result?.items ?? [];
  }

  conversationAccess(conversationId: string, userId: string) {
    return this.messages.request<ConversationAccessDto>(`/internal/conversations/${conversationId}/access/${encodeURIComponent(userId)}`);
  }
}
