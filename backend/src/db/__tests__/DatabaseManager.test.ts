import { DatabaseManager, DatabaseConfig } from '../DatabaseManager';

describe('DatabaseManager', () => {
  const mockConfig: DatabaseConfig = {
    connectionString: 'postgresql://test:test@localhost:5432/test_db',
    max: 5,
    idleTimeout: 10,
    connectionTimeout: 5,
  };

  afterEach(async () => {
    // 清理：关闭连接
    if (DatabaseManager.isInitialized()) {
      await DatabaseManager.close();
    }
  });

  describe('initialization', () => {
    it('should initialize database connection', () => {
      expect(DatabaseManager.isInitialized()).toBe(false);

      DatabaseManager.initialize(mockConfig);

      expect(DatabaseManager.isInitialized()).toBe(true);
    });

    it('should throw error when getting db before initialization', () => {
      expect(() => DatabaseManager.getDb()).toThrow(
        'Database not initialized. Call DatabaseManager.initialize() first.'
      );
    });

    it('should throw error when getting client before initialization', () => {
      expect(() => DatabaseManager.getClient()).toThrow(
        'Database not initialized. Call DatabaseManager.initialize() first.'
      );
    });

    it('should return config after initialization', () => {
      DatabaseManager.initialize(mockConfig);

      const config = DatabaseManager.getConfig();

      expect(config).toEqual(mockConfig);
    });

    it('should warn and reinitialize if already initialized', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      DatabaseManager.initialize(mockConfig);
      DatabaseManager.initialize(mockConfig);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Database already initialized. Closing existing connection...'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      DatabaseManager.initialize(mockConfig);
      expect(DatabaseManager.isInitialized()).toBe(true);

      await DatabaseManager.close();

      expect(DatabaseManager.isInitialized()).toBe(false);
      expect(DatabaseManager.getConfig()).toBeNull();
    });

    it('should handle close when not initialized', async () => {
      await expect(DatabaseManager.close()).resolves.not.toThrow();
    });
  });

  describe('isInitialized', () => {
    it('should return false when not initialized', () => {
      expect(DatabaseManager.isInitialized()).toBe(false);
    });

    it('should return true when initialized', () => {
      DatabaseManager.initialize(mockConfig);

      expect(DatabaseManager.isInitialized()).toBe(true);
    });

    it('should return false after close', async () => {
      DatabaseManager.initialize(mockConfig);
      await DatabaseManager.close();

      expect(DatabaseManager.isInitialized()).toBe(false);
    });
  });
});
