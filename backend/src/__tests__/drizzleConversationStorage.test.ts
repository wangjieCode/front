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
});
