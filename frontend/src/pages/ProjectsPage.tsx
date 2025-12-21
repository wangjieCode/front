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
  TeamOutlined,
  GithubOutlined,
  BranchesOutlined,
  FolderOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Project, ProjectFilters, MemberRole, RepositoryStatus } from '../types/project';
import { projectService } from '../services/projectService';
import CreateProjectModal from '../components/CreateProjectModal';
import ProjectDetailModal from '../components/ProjectDetailModal';
import MemberManageModal from '../components/MemberManageModal';
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
  const [memberModalVisible, setMemberModalVisible] = useState(false);
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
  const handleManageMembers = (project: Project) => {
    setSelectedProject(project);
    setMemberModalVisible(true);
  };

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

  // 获取角色标签颜色
  const getRoleTagColor = (role: MemberRole) => {
    switch (role) {
      case MemberRole.OWNER:
        return 'red';
      case MemberRole.ADMIN:
        return 'orange';
      case MemberRole.MEMBER:
        return 'blue';
      default:
        return 'default';
    }
  };

  // 渲染项目卡片
  const renderProjectCard = (project: Project) => (
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
        <Tooltip title="成员管理">
          <Button
            type="text"
            icon={<TeamOutlined />}
            onClick={() => handleManageMembers(project)}
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
  );

  return (
    <Layout className="projects-page">
      <Content className="projects-content">
        {/* 统计信息和操作按钮 */}
        <Row gutter={16} className="stats-row">
          <Col span={18}>
            <Row gutter={16}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="总项目数"
                    value={total}
                    prefix={<FolderOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="活跃项目"
                    value={projects.filter(p => p.isActive).length}
                    prefix={<GithubOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="停用项目"
                    value={projects.filter(p => !p.isActive).length}
                    prefix={<SettingOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="我的项目"
                    value={projects.length}
                    prefix={<TeamOutlined />}
                  />
                </Card>
              </Col>
            </Row>
          </Col>
          <Col span={6}>
            <Card style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => loadProjects()}
                  loading={loading}
                  block
                >
                  刷新
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateModalVisible(true)}
                  className="btn-primary"
                  block
                >
                  新建项目
                </Button>
              </Space>
            </Card>
          </Col>
        </Row>

        {/* 搜索和过滤 */}
        <Card className="filter-card">
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Search
                placeholder="搜索项目名称或描述"
                allowClear
                enterButton={<SearchOutlined />}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onSearch={handleSearch}
                loading={searchLoading}
              />
            </Col>
            <Col>
              <Space>
                <Text>状态:</Text>
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
                  style={{ width: 120 }}
                >
                  <Option value="all">全部</Option>
                  <Option value="true">活跃</Option>
                  <Option value="false">停用</Option>
                </Select>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* 项目列表 */}
        <Card className="projects-list-card">
          {loading ? (
            <div className="loading-container">
              <Spin size="large" />
              <Text type="secondary">加载项目中...</Text>
            </div>
          ) : projects.length === 0 ? (
            <Empty
              description="暂无项目"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                创建第一个项目
              </Button>
            </Empty>
          ) : (
            <List
              grid={{
                gutter: 16,
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
        </Card>
      </Content>

      {/* 创建项目模态框 */}
      <CreateProjectModal
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* 项目详情模态框 */}
      <ProjectDetailModal
        visible={detailModalVisible}
        project={selectedProject}
        onCancel={() => setDetailModalVisible(false)}
        onUpdate={() => loadProjects()}
      />

      {/* 成员管理模态框 */}
      <MemberManageModal
        visible={memberModalVisible}
        project={selectedProject}
        onCancel={() => setMemberModalVisible(false)}
        onUpdate={() => loadProjects()}
      />
    </Layout>
  );
};

export default ProjectsPage;