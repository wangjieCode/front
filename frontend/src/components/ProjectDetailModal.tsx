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
  Descriptions,
  Tag,
  Switch,
  Row,
  Col,
} from 'antd';
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  GithubOutlined,
  LinkOutlined,
  BranchesOutlined,
  FolderOutlined,
  GitlabOutlined,
  CalendarOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Project, UpdateProjectRequest } from '../types/project';
import { projectService } from '../services/projectService';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface ProjectDetailModalProps {
  visible: boolean;
  project: Project | null;
  onCancel: () => void;
  onUpdate: () => void;
}

const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  visible,
  project,
  onCancel,
  onUpdate,
}) => {
  const [form] = Form.useForm();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  // 重置表单和状态
  const handleCancel = () => {
    form.resetFields();
    setEditing(false);
    onCancel();
  };

  // 开始编辑
  const handleEdit = () => {
    if (project) {
      form.setFieldsValue({
        name: project.name,
        description: project.description || '',
        gitRepositoryUrl: project.gitRepositoryUrl,
        gitBranch: project.gitBranch,
        gitlabProjectId: project.gitlabProjectId || '',
        gitlabUrl: project.gitlabUrl || '',
        workDirectory: project.workDirectory,
        isActive: project.isActive,
      });
      setEditing(true);
    }
  };

  // 取消编辑
  const handleEditCancel = () => {
    form.resetFields();
    setEditing(false);
  };

  // 保存更新
  const handleSave = async () => {
    if (!project) return;

    try {
      setLoading(true);
      const values = await form.validateFields();
      
      const requestData: UpdateProjectRequest = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        gitRepositoryUrl: values.gitRepositoryUrl.trim(),
        gitBranch: values.gitBranch?.trim() || 'main',
        gitlabProjectId: values.gitlabProjectId?.trim() || undefined,
        gitlabUrl: values.gitlabUrl?.trim() || undefined,
        workDirectory: values.workDirectory?.trim(),
        isActive: values.isActive,
      };

      const response = await projectService.updateProject(project.id, requestData);
      
      if (response.success) {
        message.success('项目更新成功');
        setEditing(false);
        onUpdate();
      } else {
        message.error(response.error || '更新项目失败');
      }
    } catch (error) {
      console.error('更新项目失败:', error);
      message.error('更新项目失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取Git仓库名称
  const getRepoName = (url: string) => {
    try {
      const parts = url.split('/');
      return parts[parts.length - 1].replace('.git', '');
    } catch {
      return url;
    }
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <Modal
      title={
        <Space>
          <GithubOutlined />
          <span>{editing ? '编辑项目' : '项目详情'}</span>
          {project && !project.isActive && <Tag color="red">已停用</Tag>}
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      width={700}
      footer={
        editing ? (
          <Space>
            <Button icon={<CloseOutlined />} onClick={handleEditCancel}>
              取消
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={loading}
              onClick={handleSave}
              className="btn-primary"
            >
              保存
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={handleCancel}>关闭</Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={handleEdit}
              className="btn-primary"
            >
              编辑项目
            </Button>
          </Space>
        )
      }
    >
      {project && (
        <>
          {!editing ? (
            // 查看模式
            <div>
              <Descriptions
                column={1}
                size="small"
                bordered
                labelStyle={{ width: 120, fontWeight: 500 }}
              >
                <Descriptions.Item label="项目名称">
                  <Space>
                    <Text strong>{project.name}</Text>
                    <Tag color={project.isActive ? 'green' : 'red'}>
                      {project.isActive ? '活跃' : '停用'}
                    </Tag>
                  </Space>
                </Descriptions.Item>

                <Descriptions.Item label="项目描述">
                  <Paragraph>
                    {project.description || '暂无描述'}
                  </Paragraph>
                </Descriptions.Item>

                <Descriptions.Item label="Git 仓库">
                  <Space direction="vertical" size="small">
                    <Space>
                      <GithubOutlined />
                      <Text code>{getRepoName(project.gitRepositoryUrl)}</Text>
                    </Space>
                    <Text copyable={{ text: project.gitRepositoryUrl }} type="secondary">
                      {project.gitRepositoryUrl}
                    </Text>
                  </Space>
                </Descriptions.Item>

                <Descriptions.Item label="默认分支">
                  <Space>
                    <BranchesOutlined />
                    <Text code>{project.gitBranch}</Text>
                  </Space>
                </Descriptions.Item>

                <Descriptions.Item label="工作目录">
                  <Space>
                    <FolderOutlined />
                    <Text code>{project.workDirectory}</Text>
                  </Space>
                </Descriptions.Item>

                {project.gitlabUrl && (
                  <Descriptions.Item label="GitLab 实例">
                    <Space>
                      <GitlabOutlined />
                      <a href={project.gitlabUrl} target="_blank" rel="noopener noreferrer">
                        {project.gitlabUrl}
                      </a>
                    </Space>
                  </Descriptions.Item>
                )}

                {project.gitlabProjectId && (
                  <Descriptions.Item label="GitLab 项目 ID">
                    <Text code>{project.gitlabProjectId}</Text>
                  </Descriptions.Item>
                )}

                <Descriptions.Item label="创建时间">
                  <Space>
                    <CalendarOutlined />
                    <Text>{formatDate(project.createdAt)}</Text>
                  </Space>
                </Descriptions.Item>

                <Descriptions.Item label="更新时间">
                  <Space>
                    <CalendarOutlined />
                    <Text>{formatDate(project.updatedAt)}</Text>
                  </Space>
                </Descriptions.Item>

                <Descriptions.Item label="项目 ID">
                  <Text code copyable>{project.id}</Text>
                </Descriptions.Item>

                <Descriptions.Item label="所有者 ID">
                  <Space>
                    <UserOutlined />
                    <Text code copyable>{project.ownerId}</Text>
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            </div>
          ) : (
            // 编辑模式
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
            >
              <Row gutter={16}>
                <Col span={12}>
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
                      size="large"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="isActive"
                    label="项目状态"
                    valuePropName="checked"
                  >
                    <Switch
                      checkedChildren="活跃"
                      unCheckedChildren="停用"
                    />
                  </Form.Item>
                </Col>
              </Row>

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
                label="Git 仓库 URL"
                rules={[
                  { required: true, message: '请输入 Git 仓库 URL' },
                  {
                    pattern: /^https?:\/\/.+\.git$|^git@.+:.+\.git$|^https?:\/\/.+/,
                    message: '请输入有效的 Git 仓库 URL',
                  },
                ]}
              >
                <Input
                  placeholder="https://github.com/username/repository.git"
                  prefix={<LinkOutlined />}
                  size="large"
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
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
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="workDirectory"
                    label="工作目录"
                    rules={[
                      { required: true, message: '请输入工作目录' },
                      { pattern: /^[a-zA-Z0-9\u4e00-\u9fa5/._-]+$/, message: '工作目录包含非法字符' },
                    ]}
                  >
                    <Input
                      placeholder="../front-workspace/projects/your-project"
                      prefix={<FolderOutlined />}
                      size="large"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Divider orientation="left">GitLab 配置（可选）</Divider>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="gitlabUrl"
                    label="GitLab 实例 URL"
                    rules={[
                      {
                        pattern: /^https?:\/\/.+/,
                        message: '请输入有效的 URL',
                      },
                    ]}
                  >
                    <Input
                      placeholder="https://gitlab.com"
                      prefix={<GitlabOutlined />}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="gitlabProjectId"
                    label="GitLab 项目 ID"
                    rules={[
                      { pattern: /^\d+$/, message: 'GitLab 项目 ID 只能是数字' },
                    ]}
                  >
                    <Input
                      placeholder="12345"
                      prefix={<GitlabOutlined />}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}
        </>
      )}
    </Modal>
  );
};

export default ProjectDetailModal;