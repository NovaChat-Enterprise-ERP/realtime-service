import { EVENTS, SOCKET_EVENTS, type DomainEvent, type EventType, type MessageDto } from '@novachat-enterprise-erp/contracts';
import type { RealtimeEmitter } from './realtime-emitter.js';
import { rooms } from './rooms.js';

type Data = Record<string, unknown>;

export class FanoutService {
  constructor(private readonly emitter: RealtimeEmitter) {}

  readonly handles: EventType[] = [
    EVENTS.MESSAGE_CREATED,
    EVENTS.MESSAGE_UPDATED,
    EVENTS.MESSAGE_DELETED,
    EVENTS.REACTION_ADDED,
    EVENTS.REACTION_REMOVED,
    EVENTS.CONVERSATION_CREATED,
    EVENTS.CONVERSATION_UPDATED,
    EVENTS.CONVERSATION_ARCHIVED,
    EVENTS.CONVERSATION_DELETED,
    EVENTS.CONVERSATION_MEMBER_ADDED,
    EVENTS.CONVERSATION_MEMBER_REMOVED,
    EVENTS.MEMBER_STATUS_CHANGED,
    EVENTS.MEMBER_ROLE_CHANGED,
    EVENTS.MEMBER_DEACTIVATED,
    EVENTS.MEMBER_REMOVED,
    EVENTS.MEMBER_JOINED,
    EVENTS.ROLE_UPDATED,
    EVENTS.WORKSPACE_UPDATED,
    EVENTS.NOTIFICATION_CREATED,
    EVENTS.MEETING_STARTED,
    EVENTS.MEETING_ENDED,
    EVENTS.MEETING_PARTICIPANT_JOINED,
    EVENTS.MEETING_PARTICIPANT_LEFT,
  ];

  async handle(event: DomainEvent): Promise<void> {
    const wid = event.workspaceId;
    if (!wid) return;
    const data = event.data as Data;
    const userRooms = (ids: unknown) => ((ids as string[] | undefined) ?? []).map((u) => rooms.user(wid, u));

    switch (event.type) {
      case EVENTS.MESSAGE_CREATED: {
        const message = data.message as MessageDto;
        this.emitter.emit(rooms.conversation(message.conversationId), SOCKET_EVENTS.MESSAGE_CREATED, message);
        return;
      }
      case EVENTS.MESSAGE_UPDATED: {
        const message = data.message as MessageDto;
        this.emitter.emit(rooms.conversation(message.conversationId), SOCKET_EVENTS.MESSAGE_UPDATED, message);
        return;
      }
      case EVENTS.MESSAGE_DELETED:
        this.emitter.emit(rooms.conversation(data.conversationId as string), SOCKET_EVENTS.MESSAGE_DELETED, data);
        return;
      case EVENTS.REACTION_ADDED:
      case EVENTS.REACTION_REMOVED:
        this.emitter.emit(rooms.conversation(data.conversationId as string), SOCKET_EVENTS.REACTION_UPDATED, data);
        return;
      case EVENTS.CONVERSATION_CREATED: {
        const conversationId = (data.conversation as { id: string }).id;
        await this.emitter.join(userRooms(data.memberUserIds), rooms.conversation(conversationId));
        this.emitter.emit(userRooms(data.memberUserIds), SOCKET_EVENTS.CONVERSATION_UPSERTED, { conversationId });
        return;
      }
      case EVENTS.CONVERSATION_UPDATED:
      case EVENTS.CONVERSATION_ARCHIVED: {
        const conversation = data.conversation as { id: string };
        this.emitter.emit(rooms.conversation(conversation.id), SOCKET_EVENTS.CONVERSATION_UPSERTED, {
          conversationId: conversation.id,
          conversation,
        });
        return;
      }
      case EVENTS.CONVERSATION_DELETED: {
        const room = rooms.conversation(data.conversationId as string);
        this.emitter.emit(room, SOCKET_EVENTS.CONVERSATION_REMOVED, { conversationId: data.conversationId });
        await this.emitter.leave(room, room);
        return;
      }
      case EVENTS.CONVERSATION_MEMBER_ADDED: {
        const room = rooms.conversation(data.conversationId as string);
        await this.emitter.join(userRooms(data.userIds), room);
        this.emitter.emit(room, SOCKET_EVENTS.CONVERSATION_UPSERTED, { conversationId: data.conversationId });
        return;
      }
      case EVENTS.CONVERSATION_MEMBER_REMOVED: {
        const room = rooms.conversation(data.conversationId as string);
        await this.emitter.leave(userRooms(data.userIds), room);
        this.emitter.emit(userRooms(data.userIds), SOCKET_EVENTS.CONVERSATION_REMOVED, { conversationId: data.conversationId });
        this.emitter.emit(room, SOCKET_EVENTS.CONVERSATION_UPSERTED, { conversationId: data.conversationId });
        return;
      }
      case EVENTS.MEMBER_STATUS_CHANGED:
      case EVENTS.MEMBER_JOINED:
        this.emitter.emit(rooms.workspace(wid), SOCKET_EVENTS.MEMBER_UPDATED, data);
        return;
      case EVENTS.MEMBER_ROLE_CHANGED:
        this.emitter.emit(rooms.user(wid, data.userId as string), SOCKET_EVENTS.WORKSPACE_UPDATED, { reason: 'role_changed' });
        this.emitter.emit(rooms.workspace(wid), SOCKET_EVENTS.MEMBER_UPDATED, data);
        return;
      case EVENTS.ROLE_UPDATED:
      case EVENTS.WORKSPACE_UPDATED:
        this.emitter.emit(rooms.workspace(wid), SOCKET_EVENTS.WORKSPACE_UPDATED, { reason: event.type });
        return;
      case EVENTS.MEMBER_DEACTIVATED:
      case EVENTS.MEMBER_REMOVED: {
        const room = rooms.user(wid, data.userId as string);
        this.emitter.emit(room, SOCKET_EVENTS.WORKSPACE_UPDATED, { reason: event.type });
        await this.emitter.disconnect(room);
        this.emitter.emit(rooms.workspace(wid), SOCKET_EVENTS.MEMBER_UPDATED, data);
        return;
      }
      case EVENTS.NOTIFICATION_CREATED:
        this.emitter.emit(rooms.user(wid, data.userId as string), SOCKET_EVENTS.NOTIFICATION_CREATED, data.notification);
        return;
      case EVENTS.MEETING_STARTED:
      case EVENTS.MEETING_ENDED:
      case EVENTS.MEETING_PARTICIPANT_JOINED:
      case EVENTS.MEETING_PARTICIPANT_LEFT:
        this.emitter.emit(rooms.workspace(wid), SOCKET_EVENTS.MEETING_UPDATED, { type: event.type, ...data });
        return;
    }
  }
}
