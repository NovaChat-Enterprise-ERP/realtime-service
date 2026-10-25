import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EVENTS, SOCKET_EVENTS } from '@novachat-enterprise-erp/contracts';
import { CONV, WS, createHarness, nextEvent, noEvent } from './test/harness.js';

let h: Awaited<ReturnType<typeof createHarness>>;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(() => h.close());

describe('realtime-service', () => {
  it('rejects unsigned and non-member connections', async () => {
    await expect(h.connected(h.client('ada', WS, false))).rejects.toThrow('Authentication required');
    await expect(h.connected(h.client('mallory'))).rejects.toThrow('not a member');
  });

  it('fans out messages only to conversation members', async () => {
    const ada = h.client('ada');
    const grace = h.client('grace');
    const linus = h.client('linus');
    await Promise.all([h.connected(ada), h.connected(grace), h.connected(linus)]);

    const received = nextEvent<{ id: string }>(grace, SOCKET_EVENTS.MESSAGE_CREATED);
    const leaked = noEvent(linus, SOCKET_EVENTS.MESSAGE_CREATED);
    await h.events.publish({
      type: EVENTS.MESSAGE_CREATED,
      workspaceId: WS,
      data: { message: { id: 'm1', conversationId: CONV }, conversation: { id: CONV }, recipientUserIds: [] },
    });
    expect((await received).id).toBe('m1');
    expect(await leaked).toBe(true);
  });

  it('joins new members to conversation rooms', async () => {
    const linus = h.client('linus');
    await h.connected(linus);
    const upserted = nextEvent<{ conversationId: string }>(linus, SOCKET_EVENTS.CONVERSATION_UPSERTED);
    await h.events.publish({ type: EVENTS.CONVERSATION_MEMBER_ADDED, workspaceId: WS, data: { conversationId: CONV, userIds: ['linus'] } });
    expect((await upserted).conversationId).toBe(CONV);

    const message = nextEvent(linus, SOCKET_EVENTS.MESSAGE_CREATED);
    await h.events.publish({
      type: EVENTS.MESSAGE_CREATED,
      workspaceId: WS,
      data: { message: { id: 'm2', conversationId: CONV } },
    });
    await expect(message).resolves.toBeTruthy();
  });

  it('relays typing to others in the room only', async () => {
    const ada = h.client('ada');
    const grace = h.client('grace');
    const linus = h.client('linus');
    await Promise.all([h.connected(ada), h.connected(grace), h.connected(linus)]);
    const typing = nextEvent<{ userId: string }>(grace, SOCKET_EVENTS.TYPING);
    const echo = noEvent(ada, SOCKET_EVENTS.TYPING);
    const leaked = noEvent(linus, SOCKET_EVENTS.TYPING);
    ada.emit('typing', { conversationId: CONV });
    expect((await typing).userId).toBe('ada');
    expect(await echo).toBe(true);
    expect(await leaked).toBe(true);
  });

  it('tracks presence across connects and disconnects', async () => {
    const grace = h.client('grace');
    await h.connected(grace);
    const online = nextEvent<{ userId: string; online: boolean }>(grace, SOCKET_EVENTS.PRESENCE_UPDATED);
    const ada = h.client('ada');
    await h.connected(ada);
    expect(await online).toEqual({ userId: 'ada', online: true });

    const query = await grace.emitWithAck('presence:query', ['ada', 'linus']);
    expect(query).toEqual(['ada']);

    const offline = nextEvent<{ userId: string; online: boolean }>(grace, SOCKET_EVENTS.PRESENCE_UPDATED);
    ada.disconnect();
    expect(await offline).toEqual({ userId: 'ada', online: false });
  });

  it('disconnects deactivated members', async () => {
    const linus = h.client('linus');
    await h.connected(linus);
    const gone = new Promise((resolve) => linus.once('disconnect', resolve));
    await h.events.publish({ type: EVENTS.MEMBER_DEACTIVATED, workspaceId: WS, data: { userId: 'linus' } });
    await expect(gone).resolves.toBe('io server disconnect');
  });

  it('only subscribes to conversations the user belongs to', async () => {
    const linus = h.client('linus');
    await h.connected(linus);
    expect(await linus.emitWithAck('conversation:subscribe', CONV)).toBe(false);
    h.directory.conversations.set(CONV, ['ada', 'grace', 'linus']);
    expect(await linus.emitWithAck('conversation:subscribe', CONV)).toBe(true);
  });
});

describe('handshake', () => {
  it('joins conversation rooms before the client sees connect', async () => {
    const h2 = await createHarness();
    const grace = h2.client('grace');
    await new Promise<void>((resolve) => grace.once('connect', () => resolve()));
    const typing = nextEvent<{ userId: string }>(grace, SOCKET_EVENTS.TYPING);
    const ada = h2.client('ada');
    ada.once('connect', () => ada.emit('typing', { conversationId: CONV }));
    expect((await typing).userId).toBe('ada');
    await h2.close();
  });
});
