import { DatabaseManager } from '../db/DatabaseManager';
import { conversationContexts, conversations, messageMetadata, messages, neovateSessions } from '../db/schema';
import { DrizzleConversationStorage } from '../storage/DrizzleConversationStorage';

const createSelectChain = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue(rows),
    }),
  }),
});

describe('DrizzleConversationStorage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when saving metadata for a non-existent message', async () => {
    const db = {
      select: jest.fn().mockImplementation(() => createSelectChain([])),
    } as any;

    jest.spyOn(DatabaseManager, 'getDb').mockReturnValue(db);

    const storage = new DrizzleConversationStorage();

    await expect(storage.saveMessageMetadata('missing-message-id', { isQuestion: true })).rejects.toThrow(
      'Message missing-message-id not found'
    );
  });

  it('deletes neovate sessions when deleting a conversation', async () => {
    const whereMock = jest.fn().mockResolvedValue(undefined);
    const deleteMock = jest.fn().mockReturnValue({ where: whereMock });
    const tx = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue('message_ids_subquery'),
        }),
      })),
      delete: deleteMock,
    };

    const db = {
      transaction: jest.fn().mockImplementation(async (callback: (trx: any) => Promise<void>) => callback(tx)),
    } as any;

    jest.spyOn(DatabaseManager, 'getDb').mockReturnValue(db);

    const storage = new DrizzleConversationStorage();
    const clearCacheSpy = jest.spyOn(storage, 'clearCache').mockResolvedValue(undefined);

    await storage.deleteSession('conversation-1');

    expect(deleteMock).toHaveBeenCalledWith(messageMetadata);
    expect(deleteMock).toHaveBeenCalledWith(messages);
    expect(deleteMock).toHaveBeenCalledWith(conversationContexts);
    expect(deleteMock).toHaveBeenCalledWith(neovateSessions);
    expect(deleteMock).toHaveBeenCalledWith(conversations);
    expect(clearCacheSpy).toHaveBeenCalledTimes(1);
  });

  it('queries own and public sessions separately for user-scoped listing', async () => {
    const ownRows = [
      {
        id: 'session-own',
        userId: 'user-1',
        visibility: 'private',
        status: 'active',
        title: 'own',
        summary: null,
        projectId: null,
        projectName: null,
        createdAt: new Date('2026-03-04T09:00:00.000Z'),
        updatedAt: new Date('2026-03-04T09:00:00.000Z'),
      },
    ];
    const publicRows = [
      {
        id: 'session-public',
        userId: 'user-2',
        visibility: 'public',
        status: 'active',
        title: 'public',
        summary: null,
        projectId: null,
        projectName: null,
        createdAt: new Date('2026-03-04T10:00:00.000Z'),
        updatedAt: new Date('2026-03-04T10:00:00.000Z'),
      },
    ];
    const contextRows = [
      {
        conversationId: 'session-own',
        mode: 'edit',
        taskDescription: 'own task',
        workDir: '/tmp/own',
        environment: 'local',
      },
      {
        conversationId: 'session-public',
        mode: 'readonly',
        taskDescription: 'public task',
        workDir: '/tmp/public',
        environment: 'local',
      },
    ];

    let selectCall = 0;
    const db = {
      select: jest.fn().mockImplementation(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue(ownRows),
              }),
            }),
          };
        }
        if (selectCall === 2) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue(publicRows),
              }),
            }),
          };
        }
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(contextRows),
          }),
        };
      }),
    } as any;

    jest.spyOn(DatabaseManager, 'getDb').mockReturnValue(db);

    const storage = new DrizzleConversationStorage();
    const sessions = await storage.listSessions({ userId: 'user-1', environment: 'local' });

    expect(db.select).toHaveBeenCalledTimes(3);
    expect(sessions.map(item => item.id)).toEqual(['session-public', 'session-own']);
  });
});
