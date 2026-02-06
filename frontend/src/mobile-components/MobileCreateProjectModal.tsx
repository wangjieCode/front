import React, { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Button,
  message,
  Space,
  Typography,
  Divider,
  Alert,
} from 'antd';
import {
  GithubOutlined,
  LinkOutlined,
  BranchesOutlined,
  FolderOutlined,
  GitlabOutlined,
} from '@ant-design/icons';
import { CreateProjectRequest } from '../types/project';
import { projectService } from '../services/projectService';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface CreateProjectModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const MobileCreateProjectModal: React.FC<CreateProjectModalProps> = ({
  visible,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 重置表单
  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      
      const requestData: CreateProjectRequest = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        gitRepositoryUrl: values.gitRepositoryUrl.trim(),
        gitlab: {
          projectId: values.gitlabProjectId?.trim() || '',
          url: values.gitlabUrl?.trim() || 'https://git.dtminds.cn',
        },
      };

      const response = await projectService.createProject(requestData);
      
      if (response.success) {
        message.success('项目创建成功！仓库正在后台克隆中...');
        form.resetFields();
        onSuccess();
      } else {
        message.error(response.error || '创建项目失败');
      }
    } catch (error) {
      console.error('创建项目失败:', error);
      message.error('创建项目失败');
    } finally {
      setLoading(false);
    }
  };

  // 生成工作目录
  const generateWorkDirectory = (name: string) => {
    if (!name) return '';
    const sanitizedName = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `../front-workspace/projects/${sanitizedName}-${Date.now()}`;
  };

  // 项目名称变化时自动生成工作目录
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    if (name) {
      form.setFieldsValue({
        workDirectory: generateWorkDirectory(name),
      });
    } else {
      form.setFieldsValue({
        workDirectory: '',
      });
    }
  };

  return (
    <Modal
      title={
        <Space>
          <GithubOutlined />
          <span>创建新项目</span>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      width={600}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
          className="btn-primary"
        >
          创建项目
        </Button>,
      ]}
    >
      <Alert
        message="项目创建后将自动在后台克隆Git仓库"
        description="请确保仓库URL正确且可访问，克隆过程可能需要几分钟时间。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{
          gitBranch: 'master',
          gitlabUrl: 'https://git.dtminds.cn',
        }}
      >
        <Form.Item
          name="name"
          label="项目名称"
          rules={[
            { required: true, message: '请输入项目名称' },
            { min: 2, max: 50, message: '项目名称长度必须在 2-50 个字符之间' },
            { pattern: /^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/, message: '项目名称只能包含中英文、数字、下划线和连字符' },
          ]}
        >
          <Input
            placeholder="请输入项目名称"
            prefix={<FolderOutlined />}
            onChange={handleNameChange}
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="description"
          label="项目描述"
          rules={[
            { max: 500, message: '项目描述不能超过 500 个字符' },
          ]}
        >
          <TextArea
            placeholder="请输入项目描述（可选）"
            rows={3}
            showCount
            maxLength={500}
          />
        </Form.Item>

        <Divider orientation="left">Git 仓库配置</Divider>

<Form.Item
          name="gitRepositoryUrl"
          label="GitLab 仓库 URL"
          rules={[
            { required: true, message: '请输入 GitLab 仓库 URL' },
            {
              pattern: /^https?:\/\/git\.dtminds\.cn\/.+\/.+$/,
              message: '请输入有效的 GitLab 仓库 URL（如：https://git.dtminds.cn/username/repository.git）',
            },
          ]}
        >
          <Input
            placeholder="https://git.dtminds.cn/front-end/uni-mall-dy"
            prefix={<LinkOutlined />}
            size="large"
          />
        </Form.Item>

        <Form.Item
          name="gitBranch"
          label="默认分支"
          rules={[
            { required: true, message: '请输入默认分支' },
            { pattern: /^[a-zA-Z0-9/_-]+$/, message: '分支名称只能包含英文字母、数字、下划线、斜杠和连字符' },
          ]}
        >
          <Input
            placeholder="main"
            prefix={<BranchesOutlined />}
            size="large"
          />
        </Form.Item>

        

        <Divider orientation="left">GitLab 配置</Divider>

        <Form.Item
          name="gitlabUrl"
          label="GitLab 实例 URL（可选）"
          rules={[
            {
              pattern: /^https?:\/\/.+/,
              message: '请输入有效的 URL',
            },
          ]}
        >
          <Input
            placeholder="https://git.dtminds.cn"
            prefix={<GitlabOutlined />}
          />
        </Form.Item>

        <Form.Item
          name="gitlabProjectId"
          label="GitLab 项目 ID"
          rules={[
            { required: true, message: '请输入 GitLab 项目 ID' },
            { pattern: /^\d+$/, message: 'GitLab 项目 ID 只能是数字' },
          ]}
        >
          <Input
            placeholder="12345"
            prefix={<GitlabOutlined />}
          />
        </Form.Item>

        <Alert
          message="GitLab 配置说明"
          description="GitLab 项目 ID 可以在项目页面顶部或设置 > 通用中找到。GitLab 实例 URL 默认为你们的私有服务器，如需修改请填写。"
          type="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Form>
    </Modal>
  );
};

export default MobileCreateProjectModal;
