import { Router, Request, Response } from 'express';
import { streamingManager } from '../streaming/StreamingResponseManager';

const router = Router();

/**
 * SSE 流式响应端点
 * GET /api/conversations/:sessionId/messages/:messageId/stream
 */
router.get('/conversations/:sessionId/messages/:messageId/stream', async (req: Request, res: Response) => {
  const { sessionId, messageId } = req.params;

  try {
    console.log(`SSE connection request for session ${sessionId}, message ${messageId}`);

    // 建立 SSE 连接
    await streamingManager.startStream(sessionId, messageId, res);

    // 处理客户端断开连接
    req.on('close', () => {
      console.log(`Client disconnected from SSE stream for message ${messageId}`);
      streamingManager.abortStream(messageId, 'Client disconnected');
    });

    // 处理错误
    req.on('error', (error) => {
      console.error(`SSE connection error for message ${messageId}:`, error);
      streamingManager.abortStream(messageId, 'Connection error');
    });
  } catch (error) {
    console.error(`Error starting SSE stream for message ${messageId}:`, error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

/**
 * 获取流式状态
 * GET /api/streaming/status/:messageId
 */
router.get('/streaming/status/:messageId', (req: Request, res: Response) => {
  const { messageId } = req.params;

  const state = streamingManager.getStreamState(messageId);

  if (!state) {
    return res.status(404).json({ error: 'Stream not found' });
  }

  res.json({
    messageId: state.messageId,
    sessionId: state.sessionId,
    contentLength: state.content.length,
    isComplete: state.isComplete,
    lastUpdateAt: state.lastUpdateAt,
  });
});

/**
 * 获取所有活跃的流
 * GET /api/streaming/active
 */
router.get('/streaming/active', (req: Request, res: Response) => {
  const activeStreams = streamingManager.getActiveStreams();

  res.json({
    count: activeStreams.length,
    streams: activeStreams,
  });
});

/**
 * 手动中断流
 * POST /api/streaming/abort/:messageId
 */
router.post('/streaming/abort/:messageId', async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { reason } = req.body;

  await streamingManager.abortStream(messageId, reason);

  res.json({ success: true, message: 'Stream aborted' });
});

export default router;
