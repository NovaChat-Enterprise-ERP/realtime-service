import { ForbiddenError, UnauthorizedError, isUuid, verifyInternalContext } from '@novachat-enterprise-erp/common';
import type { AccessDirectory } from '../providers/access-directory.js';
import { rooms } from './rooms.js';

export interface SocketIdentity {
  userId: string;
  workspaceId: string;
}

export class ConnectionService {
  constructor(
    private readonly directory: AccessDirectory,
    private readonly secret: string,
  ) {}

  async authenticate(headers: Record<string, string | string[] | undefined>, workspaceId: unknown): Promise<SocketIdentity> {
    const context = verifyInternalContext(headers, this.secret);
    if (!context?.userId) throw new UnauthorizedError();
    if (!isUuid(workspaceId)) throw new ForbiddenError('A valid workspaceId is required');
    const access = await this.directory.workspaceAccess(workspaceId, context.userId);
    if (!access || access.deactivated) throw new ForbiddenError('You are not a member of this workspace');
    return { userId: context.userId, workspaceId };
  }

  async initialRooms(identity: SocketIdentity): Promise<string[]> {
    const conversationIds = await this.directory.conversationIds(identity.workspaceId, identity.userId);
    return [
      rooms.workspace(identity.workspaceId),
      rooms.user(identity.workspaceId, identity.userId),
      ...conversationIds.map(rooms.conversation),
    ];
  }

  async canJoinConversation(identity: SocketIdentity, conversationId: string): Promise<boolean> {
    if (!isUuid(conversationId)) return false;
    const access = await this.directory.conversationAccess(conversationId, identity.userId);
    return !!access && access.workspaceId === identity.workspaceId && access.isMember;
  }
}
