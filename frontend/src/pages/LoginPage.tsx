/**
 * 登录页面
 * 简单的用户名登录界面
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';

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
      // 登录成功后跳转到项目选择页面
      navigate('/select-project');
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
    maxWidth: '400px',
    width: '100%',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '30px',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    padding: '12px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  hint: {
    fontSize: '12px',
    color: '#999',
  },
  error: {
    padding: '12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    fontSize: '14px',
    border: '1px solid #fcc',
  },
  button: {
    padding: '14px',
    fontSize: '16px',
    fontWeight: 'bold',
    color: 'white',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'transform 0.2s, opacity 0.2s',
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
