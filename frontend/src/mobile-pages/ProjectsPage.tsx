import React, { useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  Button,
  Card,
  Input,
  Select,
  Switch,
  Space,
  Tag,
  Popconfirm,
  message,
  Tooltip,
  Table,
  Row,
  Col,
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
import { Project, ProjectFilters } from '../types/project';
import { projectService } from '../services/projectService';
import MobileCreateProjectModal from '../mobile-components/MobileCreateProjectModal';
import MobileProjectDetailModal from '../mobile-components/MobileProjectDetailModal';
import './ProjectsPage.css';

const { Content } = Layout;
const { Text } = Typography;
const { Option } = Select;
const { Column } = Table;

const MobileProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
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
    const newFilters = { ...filters, search: value };
    setFilters(newFilters);
    setSearchValue(value);

    try {
      await loadProjects(newFilters);
    } finally {
      // searchLoading removed
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

  // 更新项目代码
  const handlePullRepository = async (project: Project) => {
    const hide = message.loading(`正在更新 ${project.name} 的代码...`, 0);
    try {
      const response = await projectService.pullRepository(project.id);

      hide();
      if (response.success) {
        message.success('代码更新成功');
      } else {
        message.error(response.error || '更新失败');
      }
    } catch (error) {
      hide();
      console.error('更新代码失败:', error);
      message.error('更新失败');
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

  // 渲染统计卡片
  const renderStatCard = (title: string, value: number, icon: React.ReactNode, color: string, bgColor: string) => (
    <Card bordered={false} className="stat-card-new">
      <div className="stat-card-content">
        <div className="stat-card-info">
          <Text className="stat-card-title">{title}</Text>
          <div className="stat-card-value">{value}</div>
        </div>
        <div className="stat-card-icon-wrapper" style={{ backgroundColor: bgColor, color: color }}>
          {icon}
        </div>
      </div>
    </Card>
  );

  return (
    <Layout className="projects-page">
      <Content className="projects-content">
        {/* 1. 顶部统计数据 */}
        <Row gutter={[24, 24]} style={{ marginBottom: 32 }}>
          <Col xs={12} sm={12} md={6} lg={6} xl={6}>
            {renderStatCard(
              '总项目数',
              total,
              <FolderOutlined style={{ fontSize: 24 }} />,
              '#7c5cff',
              'rgba(124, 92, 255, 0.1)'
            )}
          </Col>
          <Col xs={12} sm={12} md={6} lg={6} xl={6}>
            {renderStatCard(
              '活跃项目',
              projects.filter(p => p.isActive).length,
              <GithubOutlined style={{ fontSize: 24 }} />,
              '#52c41a',
              'rgba(82, 196, 26, 0.1)'
            )}
          </Col>
          <Col xs={12} sm={12} md={6} lg={6} xl={6}>
            {renderStatCard(
              '已停用',
              projects.filter(p => !p.isActive).length,
              <SettingOutlined style={{ fontSize: 24 }} />,
              '#ff4d4f',
              'rgba(255, 77, 79, 0.1)'
            )}
          </Col>
          <Col xs={12} sm={12} md={6} lg={6} xl={6}>
            {renderStatCard(
              '我的项目',
              projects.length,
              <GithubOutlined style={{ fontSize: 24 }} />,
              '#faad14',
              'rgba(250, 173, 20, 0.1)'
            )}
          </Col>
        </Row>

        {/* 2. 操作工具栏 */}
        <div className="toolbar-container">
          <div className="toolbar-left">
            <Input
              placeholder="搜索项目..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onPressEnter={(e) => handleSearch(e.currentTarget.value)}
              style={{ width: 260, borderRadius: 10, height: 40 }}
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
              style={{ width: 120 }}
              bordered={false}
              className="custom-select"
            >
              <Option value="all">全部状态</Option>
              <Option value="true">🟢 活跃</Option>
              <Option value="false">🔴 停用</Option>
            </Select>
          </div>

          <Space size={12}>
            <Tooltip title="刷新列表">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadProjects()}
                loading={loading}
                shape="circle"
                size="large"
                style={{ border: 'none', background: '#f5f5f5' }}
              />
            </Tooltip>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
              className="btn-primary"
            >
              新建项目
            </Button>
          </Space>
        </div>

        {/* 3. 项目列表表格 */}
        <Card bordered={false} className="table-card">
          <Table
            dataSource={projects}
            loading={loading}
            rowKey="id"
            pagination={{
              total: total,
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条项目`,
            }}
            className="project-table"
          >
            <Column
              title="项目名称"
              key="name"
              render={(project: Project) => (
                <div className="table-project-info">
                  <div className="table-project-name">
                    <Text strong>{project.name}</Text>
                    {!project.isActive && <Tag color="red" style={{ marginLeft: 8 }}>已停用</Tag>}
                  </div>
                  <Text type="secondary" className="table-project-desc" ellipsis style={{ fontSize: '12px' }}>
                    {project.description || '暂无描述'}
                  </Text>
                </div>
              )}
            />
            <Column
              title="代码仓库"
              key="repo"
              render={(project: Project) => (
                <div className="table-repo-info">
                  <div className="repo-url">
                    <GithubOutlined className="icon" />
                    <Tooltip title={project.gitRepositoryUrl}>
                      <Text ellipsis style={{ maxWidth: 150 }}>{getRepoName(project.gitRepositoryUrl)}</Text>
                    </Tooltip>
                  </div>
                  <div className="repo-branch">
                    <BranchesOutlined className="icon" />
                    <Text type="secondary">{project.gitBranch}</Text>
                  </div>
                </div>
              )}
            />
            <Column
              title="工作目录"
              key="path"
              render={(project: Project) => (
                <div className="table-path-info">
                  <FolderOutlined className="icon" />
                  <Tooltip title={project.workDirectory}>
                    <Text ellipsis style={{ maxWidth: 120 }}>{project.workDirectory.split('/').pop()}</Text>
                  </Tooltip>
                </div>
              )}
            />
            <Column
              title="状态"
              key="status"
              width={100}
              render={(project: Project) => (
                <Tooltip title={project.isActive ? '运行中' : '已停止'}>
                  <Switch
                    checked={project.isActive}
                    onChange={() => handleStatusToggle(project)}
                    size="small"
                  />
                </Tooltip>
              )}
            />
            <Column
              title="更新时间"
              key="updatedAt"
              render={(project: Project) => (
                <div className="table-date-info">
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {project.lastPulledAt ? new Date(project.lastPulledAt).toLocaleString() : new Date(project.createdAt).toLocaleDateString()}
                  </Text>
                </div>
              )}
            />
            <Column
              title="操作"
              key="actions"
              width={180}
              render={(project: Project) => (
                <Space size="middle">
                  <Tooltip title="详情">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => handleViewProject(project)}
                      className="action-btn"
                    />
                  </Tooltip>
                  <Tooltip title="更新代码">
                    <Button
                      type="text"
                      icon={<ReloadOutlined />}
                      onClick={() => handlePullRepository(project)}
                      className="action-btn"
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确定要删除这个项目吗？"
                    onConfirm={() => handleDeleteProject(project.id)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="删除">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        className="action-btn danger"
                      />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              )}
            />
          </Table>
        </Card>
      </Content>

      <MobileCreateProjectModal
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onSuccess={handleCreateSuccess}
      />

      <MobileProjectDetailModal
        visible={detailModalVisible}
        project={selectedProject}
        onCancel={() => setDetailModalVisible(false)}
        onUpdate={() => loadProjects()}
      />
    </Layout>
  );
};

export default MobileProjectsPage;
