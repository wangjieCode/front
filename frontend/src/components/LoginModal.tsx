import React, { useState } from 'react';
import { Modal, Input, Form, message, Button, Space } from 'antd';
import { EyeOutlined } from '@ant-design/icons';

interface LoginModalProps {
  visible: boolean;
  onSuccess: (userId: string, username: string) => void;
  onCancel: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ visible, onSuccess, onCancel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: values.username }),
      });

      const data = await response.json();

      if (data.success) {
        message.success('登录成功');
        onSuccess(data.data.userId, data.data.username);
        form.resetFields();
      } else {
        message.error(data.error || '登录失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      console.error('登录失败:', error);
      message.error('登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleBrowse = () => {
    window.open('/intro', '_blank');
  };

  return (
    <Modal
      title="登录"
      open={visible}
      onCancel={onCancel}
      maskClosable={false}
      footer={
        <Space>
          <Button icon={<EyeOutlined />} onClick={handleBrowse}>
            先去逛逛
          </Button>
          <Button type="primary" loading={loading} onClick={handleLogin}>
            登录
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 24 }}
      >
        <Form.Item
          name="username"
          label="用户名"
          rules={[
            { required: true, message: '请输入用户名' },
            { 
              pattern: /^[a-zA-Z]+$/, 
              message: '用户名只能包含英文字母' 
            },
            { 
              min: 2, 
              max: 50, 
              message: '用户名长度必须在 2-50 个字符之间' 
            },
          ]}
        >
          <Input 
            placeholder="请输入纯英文用户名" 
            autoComplete="off"
            onPressEnter={handleLogin}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default LoginModal;
