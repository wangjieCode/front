import React, { useState } from 'react';
import { Button, Form, Input, Modal, Tabs, message } from 'antd';
import { authUtils } from '../utils/auth';

interface AccountSettingsModalProps {
  visible: boolean;
  userId: string;
  username: string;
  hasPassword: boolean;
  onCancel: () => void;
  onUserUpdated: (username: string, hasPassword: boolean) => void;
}

const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  visible,
  userId,
  username,
  hasPassword,
  onCancel,
  onUserUpdated,
}) => {
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const requestHeaders = () => ({
    'Content-Type': 'application/json',
    'x-user-id': authUtils.getUserId() || '',
    'x-username': authUtils.getUsername() || '',
  });

  const handleUpdateUsername = async () => {
    const values = await profileForm.validateFields();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/users/${userId}/username`, {
        method: 'PATCH',
        headers: requestHeaders(),
        body: JSON.stringify({ username: values.username }),
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.error || '更新用户名失败');
        return;
      }

      message.success('用户名更新成功');
      onUserUpdated(values.username, hasPassword);
    } catch (error) {
      console.error('更新用户名失败:', error);
      message.error('更新用户名失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePassword = async () => {
    const values = await passwordForm.validateFields();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/users/${userId}/password`, {
        method: 'PATCH',
        headers: requestHeaders(),
        body: JSON.stringify({ oldPassword: values.oldPassword, newPassword: values.newPassword }),
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.error || '修改密码失败');
        return;
      }

      message.success('密码更新成功');
      passwordForm.resetFields();
      onUserUpdated(username, true);
    } catch (error) {
      console.error('修改密码失败:', error);
      message.error('修改密码失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="账号管理"
      open={visible}
      onCancel={onCancel}
      onOk={undefined}
      footer={null}
      destroyOnClose
      afterOpenChange={(open) => {
        if (open) {
          profileForm.setFieldsValue({ username });
        }
      }}
    >
      <Tabs
        items={[
          {
            key: 'profile',
            label: '基本信息',
            children: (
              <Form form={profileForm} layout="vertical" onFinish={handleUpdateUsername}>
                <Form.Item
                  label="用户名"
                  name="username"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { pattern: /^[a-zA-Z]+$/, message: '用户名只能包含英文字母' },
                    { min: 2, max: 50, message: '用户名长度必须在 2-50 个字符之间' },
                  ]}
                >
                  <Input placeholder="请输入纯英文用户名" />
                </Form.Item>
                <div style={{ textAlign: 'right' }}>
                  <Button type="primary" loading={submitting} onClick={() => profileForm.submit()}>保存用户名</Button>
                </div>
              </Form>
            ),
          },
          {
            key: 'password',
            label: '密码设置',
            children: (
              <Form form={passwordForm} layout="vertical" onFinish={handleUpdatePassword}>
                {hasPassword && (
                  <Form.Item
                    label="旧密码"
                    name="oldPassword"
                    rules={[{ required: true, message: '请输入旧密码' }, { min: 6, message: '旧密码至少 6 位' }]}
                  >
                    <Input.Password placeholder="请输入旧密码" />
                  </Form.Item>
                )}
                <Form.Item
                  label="新密码"
                  name="newPassword"
                  rules={[{ required: true, message: '请输入新密码' }, { min: 6, max: 128, message: '密码长度必须在 6-128 个字符之间' }]}
                >
                  <Input.Password placeholder="请输入新密码" />
                </Form.Item>
                <Form.Item
                  label="确认密码"
                  name="confirmPassword"
                  dependencies={['newPassword']}
                  rules={[
                    { required: true, message: '请再次输入新密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('newPassword') === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(new Error('两次输入的密码不一致'));
                      },
                    }),
                  ]}
                >
                  <Input.Password placeholder="请再次输入新密码" />
                </Form.Item>
                <div style={{ textAlign: 'right' }}>
                  <Button type="primary" loading={submitting} onClick={() => passwordForm.submit()}>保存密码</Button>
                </div>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default AccountSettingsModal;
