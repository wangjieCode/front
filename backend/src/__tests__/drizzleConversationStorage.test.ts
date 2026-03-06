import { DatabaseManager } from '../db/DatabaseManager';
import {
  conversationContexts,
  conversations,
  messageMetadata,
  messages,
  neovateSessions,
  reviewFileChanges,
  reviewRounds,
} from '../db/schema';
import { DrizzleConversationStorage } from '../storage/DrizzleConversationStorage';

const createSelectChain = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue(rows),
    }),
  }),
});

const createSelectWhereChain = (rows: any[]) => ({
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(rows),
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
    expect(deleteMock).toHaveBeenCalledWith(reviewFileChanges);
    expect(deleteMock).toHaveBeenCalledWith(reviewRounds);
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
        taskDescription: 'own task',
        workDir: '/tmp/own',
        environment: 'local',
      },
      {
        conversationId: 'session-public',
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
        if (selectCall === 3) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(contextRows),
            }),
          };
        }
        if (selectCall === 4) {
          return {
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                orderBy: jest.fn().mockResolvedValue([]),
              }),
            }),
          };
        }
        return {
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              groupBy: jest.fn().mockResolvedValue([]),
            }),
          }),
        };
      }),
    } as any;

    jest.spyOn(DatabaseManager, 'getDb').mockReturnValue(db);

    const storage = new DrizzleConversationStorage();
    const sessions = await storage.listSessions({ userId: 'user-1', environment: 'local' });

    expect(db.select).toHaveBeenCalledTimes(4);
    expect(sessions.map(item => item.id)).toEqual(['session-public', 'session-own']);
  });

  it('creates review projection rows when message metadata contains code changes', async () => {
    const insertValuesMock = jest.fn().mockResolvedValue(undefined);
    const db = {
      select: jest
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ conversationId: 'conversation-1' }]))
        .mockImplementationOnce(() => createSelectChain([]))
        .mockImplementationOnce(() => createSelectChain([]))
        .mockImplementationOnce(() => createSelectWhereChain([{ maxRound: 2 }])),
      insert: jest.fn().mockReturnValue({
        values: insertValuesMock,
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    } as any;

    jest.spyOn(DatabaseManager, 'getDb').mockReturnValue(db);

    const storage = new DrizzleConversationStorage();
    await storage.saveMessageMetadata('message-1', {
      codeChanges: [
        { filePath: 'src/a.ts', changeType: 'modified', additions: 3, deletions: 1 },
        { path: 'src/b.ts', type: 'added', additions: 5, deletions: 0 },
      ],
    });

    expect(db.insert).toHaveBeenCalledWith(messageMetadata);
    expect(db.insert).toHaveBeenCalledWith(reviewRounds);
    expect(db.insert).toHaveBeenCalledWith(reviewFileChanges);
    expect(insertValuesMock).toHaveBeenCalledTimes(3);
  });

  it('updates existing review projection when metadata is overwritten', async () => {
    const db = {
      select: jest
        .fn()
        .mockImplementationOnce(() => createSelectChain([{ conversationId: 'conversation-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ id: 'metadata-1' }]))
        .mockImplementationOnce(() => createSelectChain([{ id: 'round-1' }])),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    } as any;

    jest.spyOn(DatabaseManager, 'getDb').mockReturnValue(db);

    const storage = new DrizzleConversationStorage();
    await storage.saveMessageMetadata('message-1', {
      codeChanges: [{ filePath: 'src/a.ts', changeType: 'modified' }],
    });

    expect(db.update).toHaveBeenCalledWith(messageMetadata);
    expect(db.update).toHaveBeenCalledWith(reviewRounds);
    expect(db.delete).toHaveBeenCalledWith(reviewFileChanges);
    expect(db.insert).toHaveBeenCalledWith(reviewFileChanges);
  });
});
