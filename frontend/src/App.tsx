import React, { useState, useEffect } from 'react';
import { Layout, Typography, Row, Col, message } from 'antd';
import TaskInputPanel from './components/TaskInputPanel';
import TaskList from './components/TaskList';
import TaskExecutionView from './components/TaskExecutionView';
import { apiService } from './services/api';
import { wsService } from './services/websocket';
import { Task, LogEntry, CodeChange, WSMessage, TaskStatus } from './types';
import './App.css';

const { Header, Content } = Layout;
const { Title } = Typography;

const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskLogs, setTaskLogs] = useState<LogEntry[]>([]);
  const [taskCodeChanges, setTaskCodeChanges] = useState<CodeChange[]>([]);
  const [isLoadingTaskDetails, setIsLoadingTaskDetails] = useState(false);

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
    setIsLoadingTaskDetails(true);
    try {
      const [task, logs] = await Promise.all([
        apiService.getTask(taskId),
        apiService.getTaskLogs(taskId),
      ]);
      
      setSelectedTask(task);
      setTaskLogs(logs);
      // TODO: 在任务 13 中通过 WebSocket 实时更新代码变更
      setTaskCodeChanges([]);
    } catch (error) {
      console.error('加载任务详情失败:', error);
      message.error('加载任务详情失败');
    } finally {
      setIsLoadingTaskDetails(false);
    }
  };

  // 组件挂载时加载任务列表并连接 WebSocket
  useEffect(() => {
    loadTasks();
    
    // 连接 WebSocket
    wsService.connect();
    
    // 监听 WebSocket 消息
    const unsubscribe = wsService.onMessage(handleWebSocketMessage);
    
    // 组件卸载时断开连接
    return () => {
      unsubscribe();
      wsService.disconnect();
    };
  }, []);

  // 当选中任务变化时，加载任务详情
  useEffect(() => {
    if (selectedTaskId) {
      loadTaskDetails(selectedTaskId);
    } else {
      setSelectedTask(null);
      setTaskLogs([]);
      setTaskCodeChanges([]);
    }
  }, [selectedTaskId]);

  // 提交新任务
  const handleSubmitTask = async (prompt: string) => {
    setIsLoading(true);
    try {
      const newTask = await apiService.createTask(prompt);
      message.success('任务创建成功');
      
      // 添加新任务到列表顶部
      setTasks([newTask, ...tasks]);
      setSelectedTaskId(newTask.id);
    } catch (error) {
      console.error('创建任务失败:', error);
      message.error(error instanceof Error ? error.message : '创建任务失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 点击任务
  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  // 处理 WebSocket 消息
  const handleWebSocketMessage = (wsMessage: WSMessage) => {
    console.log('收到 WebSocket 消息:', wsMessage);
    console.log('消息类型:', wsMessage.type);
    console.log('消息 payload:', wsMessage.payload);
    
    switch (wsMessage.type) {
      case 'task:status':
        // 更新任务状态
        if (wsMessage.payload.taskId && wsMessage.payload.status) {
          const newStatus = wsMessage.payload.status as TaskStatus;
          console.log('更新任务状态:', wsMessage.payload.taskId, '→', newStatus);
          setTasks(prevTasks => 
            prevTasks.map(task => 
              task.id === wsMessage.payload.taskId 
                ? { ...task, status: newStatus }
                : task
            )
          );
          
          // 如果是当前选中的任务，也更新详情
          if (selectedTask?.id === wsMessage.payload.taskId) {
            setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null);
          }
        }
        break;
        
      case 'task:log':
        // 添加新日志
        if (wsMessage.payload.taskId && wsMessage.payload.log) {
          if (selectedTask?.id === wsMessage.payload.taskId) {
            const newLog = wsMessage.payload.log;
            setTaskLogs(prevLogs => [...prevLogs, newLog]);
          }
        }
        break;
        
      case 'task:codeChange':
        // 更新代码变更
        if (wsMessage.payload.taskId && wsMessage.payload.changes) {
          if (selectedTask?.id === wsMessage.payload.taskId) {
            setTaskCodeChanges(wsMessage.payload.changes);
          }
        }
        break;
        
      case 'task:completed':
        // 任务完成
        console.log('收到任务完成消息:', wsMessage.payload);
        if (wsMessage.payload.taskId) {
          const mrUrl = wsMessage.payload.mrUrl;
          console.log('任务完成，更新状态:', wsMessage.payload.taskId, 'MR:', mrUrl);
          setTasks(prevTasks => 
            prevTasks.map(task => 
              task.id === wsMessage.payload.taskId 
                ? { 
                    ...task, 
                    status: TaskStatus.SUCCESS,
                    completedAt: new Date().toISOString(),
                    mrUrl 
                  }
                : task
            )
          );
          
          if (selectedTask?.id === wsMessage.payload.taskId) {
            console.log('更新选中任务的状态');
            setSelectedTask(prev => prev ? { 
              ...prev, 
              status: TaskStatus.SUCCESS,
              completedAt: new Date().toISOString(),
              mrUrl 
            } : null);
          }
          
          message.success('任务执行成功！');
        }
        break;
        
      case 'task:error':
        // 任务失败
        if (wsMessage.payload.taskId) {
          const errorMsg = wsMessage.payload.error;
          setTasks(prevTasks => 
            prevTasks.map(task => 
              task.id === wsMessage.payload.taskId 
                ? { ...task, status: TaskStatus.FAILED, error: errorMsg }
                : task
            )
          );
          
          if (selectedTask?.id === wsMessage.payload.taskId) {
            setSelectedTask(prev => prev ? { 
              ...prev, 
              status: TaskStatus.FAILED,
              error: errorMsg 
            } : null);
          }
          
          message.error(`任务执行失败: ${errorMsg || '未知错误'}`);
        }
        break;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <Title level={3} style={{ margin: '16px 0' }}>
          🚀 Web 前端实习生助手系统
        </Title>
      </Header>
      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
          <Row gutter={24}>
            {/* 左侧：任务输入和列表 */}
            <Col xs={24} lg={8}>
              <TaskInputPanel 
                onSubmit={handleSubmitTask} 
                isLoading={isLoading} 
              />
              <TaskList 
                tasks={tasks}
                onTaskClick={handleTaskClick}
                selectedTaskId={selectedTaskId}
              />
            </Col>
            
            {/* 右侧：任务执行视图 */}
            <Col xs={24} lg={16}>
              <TaskExecutionView
                task={selectedTask}
                logs={taskLogs}
                codeChanges={taskCodeChanges}
                isLoading={isLoadingTaskDetails}
              />
            </Col>
          </Row>
        </div>
      </Content>
    </Layout>
  );
};

export default App;
