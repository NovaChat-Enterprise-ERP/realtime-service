import type { Server } from 'socket.io';

export interface RealtimeEmitter {
  emit(rooms: string | string[], event: string, payload: unknown): void;
  join(sourceRooms: string | string[], room: string): Promise<void>;
  leave(sourceRooms: string | string[], room: string): Promise<void>;
  disconnect(rooms: string | string[]): Promise<void>;
  countSockets(room: string): Promise<number>;
}

export class SocketIoEmitter implements RealtimeEmitter {
  constructor(private readonly io: Server) {}

  emit(rooms: string | string[], event: string, payload: unknown) {
    if (Array.isArray(rooms) && rooms.length === 0) return;
    this.io.to(rooms).emit(event, payload);
  }

  async join(sourceRooms: string | string[], room: string) {
    if (Array.isArray(sourceRooms) && sourceRooms.length === 0) return;
    this.io.in(sourceRooms).socketsJoin(room);
  }

  async leave(sourceRooms: string | string[], room: string) {
    if (Array.isArray(sourceRooms) && sourceRooms.length === 0) return;
    this.io.in(sourceRooms).socketsLeave(room);
  }

  async disconnect(rooms: string | string[]) {
    this.io.in(rooms).disconnectSockets(true);
  }

  async countSockets(room: string) {
    return (await this.io.in(room).fetchSockets()).length;
  }
}
