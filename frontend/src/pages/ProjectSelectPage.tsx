/**
 * 项目选择页面
 * 用户登录后选择要使用的项目
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectService, Project } from '../services/projectService';
import { authService, User } from '../services/authService';

export const ProjectSelectPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // 检查是否已登录
    if (!authService.isAuthenticated()) {
      navigate('/login');
      return;
    }

    // 获取用户信息
    const currentUser = authService.getUser();
    setUser(currentUser);

    // 加载项目列表
    loadProjects();
  }, [navigate]);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const projectList = await projectService.getActiveProjects();
      setProjects(projectList);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = (project: Project) => {
    // 保存选中的项目
    projectService.setSelectedProject(project);

    // 跳转到对话测试页面
    navigate('/conversation-test');
  };

  const handleLogout = () => {
    authService.logout();
    projectService.clearSelectedProject();
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>选择项目</h1>
            {user && (
              <p style={styles.subtitle}>
                欢迎，{user.displayName || user.username}
              </p>
            )}
          </div>
          <button onClick={handleLogout} style={styles.logoutButton}>
            退出登录
          </button>
        </div>

        {loading && (
          <div style={styles.loading}>
            <div style={styles.spinner}></div>
            <p>加载项目列表中...</p>
          </div>
        )}

        {error && (
          <div style={styles.error}>
            <p>{error}</p>
            <button onClick={loadProjects} style={styles.retryButton}>
              重试
            </button>
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div style={styles.empty}>
            <p>暂无可用项目</p>
            <small>请联系管理员配置项目</small>
          </div>
        )}

        {!loading && !error && projects.length > 0 && (
          <div style={styles.projectList}>
            {projects.map((project) => (
              <div
                key={project.id}
                style={styles.projectCard}
                onClick={() => handleSelectProject(project)}
              >
                <h3 style={styles.projectName}>{project.projectName}</h3>
                {project.description && (
                  <p style={styles.projectDescription}>{project.description}</p>
                )}
                <div style={styles.projectMeta}>
                  <span style={styles.projectKey}>{project.projectKey}</span>
                  <span style={styles.projectBranch}>
                    📝 {project.gitDefaultBranch}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={styles.info}>
          <p style={styles.infoText}>
            ℹ️ 每个对话会话绑定一个项目，切换项目需要创建新对话
          </p>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
    maxWidth: '800px',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '30px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  logoutButton: {
    padding: '8px 16px',
    fontSize: '14px',
    color: '#666',
    background: 'white',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '40px',
    color: '#666',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    padding: '20px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: '10px',
    padding: '8px 16px',
    fontSize: '14px',
    color: 'white',
    background: '#c33',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: '#666',
  },
  projectList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  projectCard: {
    padding: '20px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  projectName: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
  },
  projectDescription: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '12px',
  },
  projectMeta: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px',
    color: '#999',
  },
  projectKey: {
    padding: '4px 8px',
    background: '#f5f5f5',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  projectBranch: {
    padding: '4px 8px',
  },
  info: {
    marginTop: '20px',
    padding: '12px',
    background: '#f0f4ff',
    borderRadius: '6px',
    border: '1px solid #d0e0ff',
  },
  infoText: {
    fontSize: '13px',
    color: '#4a5568',
    margin: 0,
  },
};
