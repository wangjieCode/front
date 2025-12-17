/**
 * 登录页面
 * 简单的用户名登录界面
 */


import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import './pages.css';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }

    // 验证用户名格式
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError('用户名只能包含字母、数字、下划线和连字符');
      return;
    }

    setLoading(true);
    try {
      await authService.login(username);
      // 登录成功后直接进入根路径，由路由自动判断下一步
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Web 前端实习生助手</h1>
        <p style={styles.subtitle}>请输入您的用户名登录</p>

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label htmlFor="username" style={styles.label}>
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入用户名"
              style={styles.input}
              disabled={loading}
              autoFocus
            />
            <small style={styles.hint}>
              只能包含字母、数字、下划线和连字符
            </small>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div style={styles.info}>
          <p style={styles.infoText}>
            ℹ️ 无需密码，首次登录将自动创建账号
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
    padding: '48px 40px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3), 0 0 100px rgba(102, 126, 234, 0.1)',
    maxWidth: '420px',
    width: '100%',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    animation: 'fadeInUp 0.6s ease-out',
    position: 'relative',
    zIndex: 1,
  },
  title: {
    fontSize: '32px',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    marginBottom: '8px',
    textAlign: 'center',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#6b7280',
    marginBottom: '36px',
    textAlign: 'center',
    fontWeight: '400',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#374151',
    letterSpacing: '0.3px',
  },
  input: {
    padding: '14px 16px',
    fontSize: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '12px',
    outline: 'none',
    transition: 'all 0.3s ease',
    background: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'Inter, sans-serif',
  },
  hint: {
    fontSize: '12px',
    color: '#9ca3af',
    fontWeight: '400',
  },
  error: {
    padding: '14px 16px',
    background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    color: '#dc2626',
    borderRadius: '12px',
    fontSize: '14px',
    border: '1px solid #fca5a5',
    fontWeight: '500',
    animation: 'shake 0.4s ease',
  },
  button: {
    padding: '16px',
    fontSize: '14px',
    fontWeight: '700',
    color: 'white',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  info: {
    marginTop: '24px',
    padding: '16px',
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
