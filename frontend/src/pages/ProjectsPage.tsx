import React, { useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  Button,
  Card,
  List,
  Input,
  Modal,
  Form,
  Select,
  Switch,
  Space,
  Tag,
  Popconfirm,
  message,
  Spin,
  Empty,
  Tooltip,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  GithubOutlined,
  BranchesOutlined,
  FolderOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Project, ProjectFilters, RepositoryStatus } from '../types/project';
import { projectService } from '../services/projectService';
import CreateProjectModal from '../components/CreateProjectModal';
import ProjectDetailModal from '../components/ProjectDetailModal';
import './ProjectsPage.css';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { Search } = Input;
const { Option } = Select;

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // 模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // 过滤和分页状态
  const [filters, setFilters] = useState<ProjectFilters>({
    isActive: true,
    search: '',
  });
  const [searchValue, setSearchValue] = useState('');

  // 加载项目列表
  const loadProjects = async (newFilters?: ProjectFilters) => {
    try {
      setLoading(true);
      const response = await projectService.getProjects(newFilters || filters);

      if (response.success && response.data) {
        setProjects(response.data);
        setTotal(response.total || 0);
      } else {
        message.error(response.error || '加载项目列表失败');
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
      message.error('加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载项目列表
  useEffect(() => {
    loadProjects();
  }, []);

  // 搜索处理
  const handleSearch = async (value: string) => {
    setSearchLoading(true);
    const newFilters = { ...filters, search: value };
    setFilters(newFilters);
    setSearchValue(value);

    try {
      await loadProjects(newFilters);
    } finally {
      setSearchLoading(false);
    }
  };

  // 项目状态切换
  const handleStatusToggle = async (project: Project) => {
    try {
      const response = await projectService.updateProject(project.id, {
        isActive: !project.isActive,
      });

      if (response.success) {
        message.success(`项目已${project.isActive ? '停用' : '启用'}`);
        loadProjects();
      } else {
        message.error(response.error || '操作失败');
      }
    } catch (error) {
      console.error('切换项目状态失败:', error);
      message.error('操作失败');
    }
  };

  // 删除项目
  const handleDeleteProject = async (projectId: string) => {
    try {
      const response = await projectService.deleteProject(projectId);

      if (response.success) {
        message.success('项目已删除');
        loadProjects();
      } else {
        message.error(response.error || '删除失败');
      }
    } catch (error) {
      console.error('删除项目失败:', error);
      message.error('删除失败');
    }
  };

  // 打开项目详情
  const handleViewProject = (project: Project) => {
    setSelectedProject(project);
    setDetailModalVisible(true);
  };

  // 打开成员管理
  // 移除成员管理功能

  // 创建项目成功回调
  const handleCreateSuccess = () => {
    setCreateModalVisible(false);
    loadProjects();
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

  // 移除角色标签功能

  // 渲染项目卡片
  const renderProjectCard = (project: Project) => (
    <List.Item>
      <Card
        key={project.id}
        className="project-card"
        hoverable
        actions={[
          <Tooltip title="查看详情">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleViewProject(project)}
            />
          </Tooltip>,
          <Tooltip title={project.isActive ? '停用项目' : '启用项目'}>
            <Switch
              size="small"
              checked={project.isActive}
              onChange={() => handleStatusToggle(project)}
            />
          </Tooltip>,
          <Tooltip title="删除项目">
            <Popconfirm
              title="确定要删除这个项目吗？"
              description="删除后将无法恢复，请谨慎操作。"
              onConfirm={() => handleDeleteProject(project.id)}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Tooltip>,
        ]}
      >
        <Card.Meta
          title={
            <Space>
              <span className="project-title">{project.name}</span>
              {!project.isActive && <Tag color="red">已停用</Tag>}
            </Space>
          }
          description={
            <div className="project-description">
              <Paragraph ellipsis={{ rows: 2 }}>
                {project.description || '暂无描述'}
              </Paragraph>
            </div>
          }
        />

        <div className="project-info">
          <div className="info-item">
            <GithubOutlined className="info-icon" />
            <Tooltip title={project.gitRepositoryUrl}>
              <Text className="info-text" ellipsis>
                {getRepoName(project.gitRepositoryUrl)}
              </Text>
            </Tooltip>
          </div>

          <div className="info-item">
            <BranchesOutlined className="info-icon" />
            <Text className="info-text">{project.gitBranch}</Text>
          </div>

          <div className="info-item">
            <FolderOutlined className="info-icon" />
            <Tooltip title={project.workDirectory}>
              <Text className="info-text" ellipsis>
                {project.workDirectory.split('/').pop()}
              </Text>
            </Tooltip>
          </div>

          <div className="info-item">
            <Text type="secondary" className="info-text">
              创建于 {new Date(project.createdAt).toLocaleDateString()}
            </Text>
          </div>
        </div>
      </Card>
    </List.Item>
  );

  return (
    <Layout className="projects-page">
      <Content className="projects-content">
        {/* 1. 顶部统计数据 */}
        <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
          <Col xs={12} sm={6} md={6} lg={6}>
            <Card bordered={false} hoverable className="stat-card">
              <Statistic
                title="总项目数"
                value={total}
                prefix={<FolderOutlined style={{ color: '#7c5cff', background: 'rgba(124, 92, 255, 0.1)', padding: 8, borderRadius: 8 }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={6} lg={6}>
            <Card bordered={false} hoverable className="stat-card">
              <Statistic
                title="活跃项目"
                value={projects.filter(p => p.isActive).length}
                prefix={<GithubOutlined style={{ color: '#52c41a', background: 'rgba(82, 196, 26, 0.1)', padding: 8, borderRadius: 8 }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={6} lg={6}>
            <Card bordered={false} hoverable className="stat-card">
              <Statistic
                title="停用项目"
                value={projects.filter(p => !p.isActive).length}
                prefix={<SettingOutlined style={{ color: '#ff4d4f', background: 'rgba(255, 77, 79, 0.1)', padding: 8, borderRadius: 8 }} />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6} md={6} lg={6}>
            <Card bordered={false} hoverable className="stat-card">
              <Statistic
                title="我的项目"
                value={projects.length}
                prefix={<GithubOutlined style={{ color: '#faad14', background: 'rgba(250, 173, 20, 0.1)', padding: 8, borderRadius: 8 }} />}
              />
            </Card>
          </Col>
        </Row>

        {/* 2. 操作工具栏 */}
        <div className="toolbar-container">
          <div className="toolbar-left">
            <Input
              placeholder="搜索项目名称或描述..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onPressEnter={(e) => handleSearch(e.currentTarget.value)}
              style={{ width: 320, borderRadius: 8 }}
              allowClear
            />
            <Select
              value={filters.isActive === undefined ? 'all' : filters.isActive.toString()}
              onChange={(value) => {
                const newFilters = {
                  ...filters,
                  isActive: value === 'all' ? undefined : value === 'true',
                };
                setFilters(newFilters);
                loadProjects(newFilters);
              }}
              style={{ width: 140 }}
              bordered={false}
              className="custom-select"
            >
              <Option value="all">全部状态</Option>
              <Option value="true">🟢 活跃中</Option>
              <Option value="false">🔴 已停用</Option>
            </Select>
          </div>

          <Space size={16}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadProjects()}
              loading={loading}
              shape="circle"
              size="large"
              style={{ border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
              size="large"
              className="btn-primary"
              style={{ padding: '0 24px', height: 40, borderRadius: 20 }}
            >
              新建项目
            </Button>
          </Space>
        </div>

        {/* 3. 项目列表网格 */}
        <div className="project-grid-container">
          {loading ? (
            <div className="loading-container">
              <Spin size="large" />
              <Text type="secondary" style={{ marginTop: 16 }}>加载项目中...</Text>
            </div>
          ) : projects.length === 0 ? (
            <Empty
              description="暂无项目"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: '80px 0', background: '#fff', borderRadius: 12 }}
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
                className="btn-primary"
              >
                创建第一个项目
              </Button>
            </Empty>
          ) : (
            <List
              grid={{
                gutter: [24, 24],
                xs: 1,
                sm: 2,
                md: 2,
                lg: 3,
                xl: 3,
                xxl: 4,
              }}
              dataSource={projects}
              renderItem={renderProjectCard}
            />
          )}
        </div>
      </Content>

      <CreateProjectModal
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onSuccess={handleCreateSuccess}
      />

      <ProjectDetailModal
        visible={detailModalVisible}
        project={selectedProject}
        onCancel={() => setDetailModalVisible(false)}
        onUpdate={() => loadProjects()}
      />
    </Layout>
  );
};

export default ProjectsPage;