import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Input, Button, Space, Card, message, Radio } from 'antd';
import {
  SendOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  PlusOutlined,
  EditOutlined,
  EyeOutlined
} from '@ant-design/icons';
import TaskExecutionView from './components/TaskExecutionView';
import TaskList from './components/TaskList';
import { apiService } from './services/api';
import { Task, LogEntry, CodeChange, TaskStatus, LogLevel, TaskType } from './types';
import './App.css';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('code_change');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [taskLogs, setTaskLogs] = useState<LogEntry[]>([]);
  const [taskCodeChanges, setTaskCodeChanges] = useState<CodeChange[]>([]);
  const [showResult, setShowResult] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);

  // 加载任务列表
  const loadTasks = async () => {
    try {
      const taskList = await apiService.getTasks();
      // 确保返回的是数组
      if (Array.isArray(taskList)) {
        setTasks(taskList);
      } else {
        console.error('API 返回的不是数组:', taskList);
        setTasks([]);
        message.error('加载任务列表失败：数据格式错误');
      }
    } catch (error) {
      console.error('加载任务列表失败:', error);
      message.error('加载任务列表失败');
      setTasks([]); // 确保出错时也设置为空数组
    }
  };

  // 加载任务详情
  const loadTaskDetails = async (taskId: string) => {
    try {
      const [task, logs] = await Promise.all([
        apiService.getTask(taskId),
        apiService.getTaskLogs(taskId),
      ]);

      setCurrentTask(task);
      setTaskLogs(logs);
      setTaskCodeChanges([]);
    } catch (error) {
      console.error('加载任务详情失败:', error);
      message.error('加载任务详情失败');
    }
  };

  // 轮询任务状态和日志
  const startPolling = (taskId: string) => {
    // 清除之前的轮询
    stopPolling();

    // 立即加载一次
    loadTaskDetails(taskId);

    // 每2秒轮询一次
    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const task = await apiService.getTask(taskId);
        setCurrentTask(task);

        // 如果任务已完成或失败，停止轮询
        if (task.status === TaskStatus.SUCCESS || task.status === TaskStatus.FAILED) {
          stopPolling();
          // 最后再获取一次完整的日志
          const logs = await apiService.getTaskLogs(taskId);
          setTaskLogs(logs);
          // 更新任务列表
          loadTasks();
        } else {
          // 继续获取日志更新
          const logs = await apiService.getTaskLogs(taskId);
          setTaskLogs(logs);
        }
      } catch (error) {
        console.error('轮询任务状态失败:', error);
      }
    }, 2000);
  };

  // 停止轮询
  const stopPolling = () => {
    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // 组件挂载时加载任务列表
  useEffect(() => {
    loadTasks();

    // 组件卸载时停止轮询
    return () => {
      stopPolling();
    };
  }, []);



  // 提交新任务
  const handleSubmitTask = async () => {
    if (!prompt.trim()) {
      message.warning('请输入你的需求');
      return;
    }

    // 创建乐观 UI 任务对象
    const optimisticTask: Task = {
      id: 'temp-' + Date.now(),
      prompt: prompt,
      type: taskType,
      status: TaskStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    // 立即更新 UI
    setCurrentTask(optimisticTask);
    setShowResult(true);
    setTaskLogs([{
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      source: 'system',
      message: taskType === 'code_change' ? '正在分析需求...' : '只读模式：查询中...'
    }]);
    setTaskCodeChanges([]);

    // 保持 loading 状态以防万一，虽然界面已经切换
    setIsLoading(true);

    try {
      const newTask = await apiService.createTask(prompt, taskType);

      // 设置为当前任务（更新为真实数据）
      setCurrentTask(newTask);
      setTasks(prev => [newTask, ...prev]);

      // 开始轮询任务状态和日志
      startPolling(newTask.id);

      // 清空输入框
      setPrompt('');
    } catch (error) {
      console.error('创建任务失败:', error);
      message.error(error instanceof Error ? error.message : '创建任务失败');
      // 如果失败，可能需要回退状态，但为了用户体验，暂时保留在结果页显示错误
      if (currentTask?.id === optimisticTask.id) {
        setCurrentTask({
          ...optimisticTask,
          status: TaskStatus.FAILED,
          error: error instanceof Error ? error.message : '创建任务失败'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 点击历史任务
  const handleTaskClick = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setCurrentTask(task);
      setShowResult(true);
      loadTaskDetails(taskId);

      // 如果任务还在运行中，开始轮询
      if (task.status === TaskStatus.RUNNING || task.status === TaskStatus.PENDING) {
        startPolling(taskId);
      }
    }
  };

  // 新建任务
  const handleNewTask = () => {
    stopPolling(); // 停止当前轮询
    setShowResult(false);
    setCurrentTask(null);
    setTaskLogs([]);
    setTaskCodeChanges([]);
    setPrompt('');
  };

  // 示例提示
  const examplePrompts = [
    '修改一下文案',
    '看一下页面的功能',
    '看一下某接口调用使用了哪些返回值',
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider
        width={300}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10
        }}
      >
        <div style={{ padding: '24px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 24,
            cursor: 'pointer'
          }} onClick={handleNewTask}>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
              color: '#fff'
            }}>
              <RocketOutlined />
            </div>
            <Title level={4} style={{ margin: 0, fontSize: 18 }}>前端小秘</Title>
          </div>
          <Button
            type="primary"
            block
            icon={<PlusOutlined />}
            onClick={handleNewTask}
            style={{ borderRadius: 8 }}
          >
            新对话
          </Button>
        </div>
        <div style={{ padding: '16px 0' }}>
          <TaskList
            tasks={tasks}
            onTaskClick={handleTaskClick}
            selectedTaskId={currentTask?.id}
          />
        </div>
      </Layout.Sider>

      <Layout style={{ marginLeft: 300, background: '#f0f2f5', minHeight: '100vh' }}>
        <Content style={{ padding: '24px', height: '100vh', overflow: 'auto' }}>
          {!showResult ? (
            // 主输入界面
            <div style={{
              maxWidth: 800,
              margin: '0 auto',
              paddingTop: '10vh',
              animation: 'fadeIn 0.6s ease-in'
            }}>
              <style>
                {`
                  @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                  }
                `}
              </style>

              {/* 欢迎标题 */}
              <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <Title level={1} style={{ marginBottom: 16, fontSize: 42, fontWeight: 800 }}>
                  有什么可以帮你的？
                </Title>
                <Paragraph style={{ color: '#666', fontSize: 18 }}>
                  <ThunderboltOutlined style={{ color: '#faad14' }} /> 你的智能前端开发助手
                </Paragraph>
              </div>

              {/* 输入卡片 */}
              <Card
                className="glass-card"
                style={{
                  borderRadius: 24,
                  border: 'none',
                  padding: '12px',
                  background: '#fff'
                }}
                bodyStyle={{ padding: '24px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  {/* 模式选择 */}
                  <div>
                    <div style={{ marginBottom: 12, fontWeight: 500, fontSize: 14 }}>任务模式</div>
                    <Radio.Group 
                      value={taskType} 
                      onChange={(e) => setTaskType(e.target.value)}
                      disabled={isLoading}
                      style={{ width: '100%' }}
                    >
                      <Radio.Button value="code_change" style={{ width: '50%', textAlign: 'center' }}>
                        <EditOutlined /> 编辑模式
                      </Radio.Button>
                      <Radio.Button value="query" style={{ width: '50%', textAlign: 'center' }}>
                        <EyeOutlined /> 只读模式
                      </Radio.Button>
                    </Radio.Group>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                      {taskType === 'code_change' 
                        ? '✨ 允许 AI 修改代码并创建 Merge Request' 
                        : '👀 仅查询信息，不修改代码'}
                    </div>
                  </div>

                  <div className="main-input-wrapper" style={{ borderRadius: 12, padding: '4px', background: '#f5f5f5' }}>
                    <TextArea
                      className="main-input-area"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="描述你想要的功能，例如：在首页添加一个搜索框..."
                      autoSize={{ minRows: 4, maxRows: 8 }}
                      style={{
                        fontSize: 16,
                        background: 'transparent',
                        border: 'none',
                        resize: 'none'
                      }}
                      onPressEnter={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          handleSubmitTask();
                        }
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      按 Ctrl/Cmd + Enter 发送
                    </Text>
                    <Button
                      type="primary"
                      size="large"
                      icon={<SendOutlined />}
                      onClick={handleSubmitTask}
                      loading={isLoading}
                      style={{
                        height: 48,
                        padding: '0 32px',
                        fontSize: 16,
                        borderRadius: 24,
                        background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)'
                      }}
                    >
                      {isLoading ? '正在思考...' : '发送'}
                    </Button>
                  </div>
                </Space>
              </Card>

              {/* 示例提示 */}
              <div style={{ marginTop: 48 }}>
                <Space wrap size={[12, 12]} style={{ justifyContent: 'center', width: '100%' }}>
                  {examplePrompts.map((example, index) => (
                    <Button
                      key={index}
                      style={{
                        borderRadius: 20,
                        background: '#fff',
                        border: '1px solid #eee',
                        color: '#666',
                        padding: '4px 16px',
                        height: 'auto'
                      }}
                      onClick={() => setPrompt(example)}
                    >
                      {example}
                    </Button>
                  ))}
                </Space>
              </div>
            </div>
          ) : (
            // 执行结果界面
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              <TaskExecutionView
                task={currentTask}
                logs={taskLogs}
                codeChanges={taskCodeChanges}
                isLoading={false}
              />
            </div>
          )}
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
