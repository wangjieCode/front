/**
 * 项目选择页面
 * 用户登录后选择要使用的项目
 */


import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectService, Project } from '../services/projectService';
import { authService, User } from '../services/authService';
import './pages.css';

export const ProjectSelectPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // 检查是否已登录
    if (!authService.isAuthenticated()) {
      navigate('/');
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
    navigate('/');
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
    backgroundSize: '200% 200%',
    animation: 'gradientShift 15s ease infinite',
    padding: '20px',
    position: 'relative',
    overflow: 'hidden',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '48px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 100px rgba(102, 126, 234, 0.1)',
    maxWidth: '900px',
    width: '100%',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    animation: 'fadeInUp 0.6s ease-out',
    position: 'relative',
    zIndex: 1,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '36px',
    paddingBottom: '24px',
    borderBottom: '2px solid rgba(102, 126, 234, 0.1)',
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    marginBottom: '8px',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#6b7280',
    margin: 0,
    fontWeight: '500',
  },
  logoutButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#64748b',
    background: 'rgba(255, 255, 255, 0.8)',
    border: '2px solid #e2e8f0',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    backdropFilter: 'blur(10px)',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    padding: '60px 40px',
    color: '#6b7280',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(102, 126, 234, 0.1)',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    padding: '24px',
    background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    color: '#dc2626',
    borderRadius: '16px',
    textAlign: 'center',
    border: '1px solid #fca5a5',
    fontWeight: '500',
  },
  retryButton: {
    marginTop: '12px',
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'white',
    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
  },
  empty: {
    padding: '60px 40px',
    textAlign: 'center',
    color: '#6b7280',
  },
  projectList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
    marginBottom: '24px',
  },
  projectCard: {
    padding: '24px',
    background: 'rgba(255, 255, 255, 0.6)',
    border: '2px solid rgba(102, 126, 234, 0.15)',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    backdropFilter: 'blur(10px)',
    position: 'relative',
    overflow: 'hidden',
  },
  projectName: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: '10px',
    letterSpacing: '-0.3px',
  },
  projectDescription: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '16px',
    lineHeight: '1.6',
    fontWeight: '400',
  },
  projectMeta: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px',
    color: '#9ca3af',
    flexWrap: 'wrap',
  },
  projectKey: {
    padding: '6px 12px',
    background: 'rgba(102, 126, 234, 0.1)',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: '600',
    color: '#667eea',
    border: '1px solid rgba(102, 126, 234, 0.2)',
  },
  projectBranch: {
    padding: '6px 12px',
    background: 'rgba(16, 185, 129, 0.1)',
    borderRadius: '8px',
    fontWeight: '600',
    color: '#059669',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  info: {
    marginTop: '24px',
    padding: '16px 20px',
    background: 'linear-gradient(135deg, rgba(240, 244, 255, 0.8) 0%, rgba(224, 231, 255, 0.6) 100%)',
    borderRadius: '12px',
    border: '1px solid rgba(139, 160, 255, 0.2)',
    backdropFilter: 'blur(10px)',
  },
  infoText: {
    fontSize: '13px',
    color: '#4b5563',
    margin: 0,
    fontWeight: '500',
    lineHeight: '1.6',
  },
};
