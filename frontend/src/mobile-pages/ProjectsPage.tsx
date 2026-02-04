import React, { useMemo, useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  Button,
  Input,
  Select,
  Tag,
  message,
  Card,
  Switch,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  FolderOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { Project, ProjectFilters } from '../types/project';
import { projectService } from '../services/projectService';
import './ProjectsPage.css';

const { Content } = Layout;
const { Title, Text } = Typography;

const MobileProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');


  const [filters, setFilters] = useState<ProjectFilters>({
    isActive: true,
    search: '',
  });

  const activeCount = useMemo(
    () => projects.filter((project) => project.isActive).length,
    [projects]
  );
  const inactiveCount = useMemo(
    () => projects.filter((project) => !project.isActive).length,
    [projects]
  );

  const loadProjects = async (newFilters?: ProjectFilters) => {
    try {
      setLoading(true);
      const response = await projectService.getProjects(newFilters || filters);

      if (response.success && response.data) {
        setProjects(response.data);
        setTotal(response.total || response.data.length || 0);
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

  useEffect(() => {
    loadProjects();
  }, []);

  const handleSearch = async (value: string) => {
    const nextFilters = { ...filters, search: value };
    setFilters(nextFilters);
    await loadProjects(nextFilters);
  };

  const handleStatusChange = async (value: 'all' | 'active' | 'inactive') => {
    setStatusFilter(value);
    const nextFilters: ProjectFilters = {
      ...filters,
      isActive: value === 'all' ? undefined : value === 'active',
    };
    setFilters(nextFilters);
    await loadProjects(nextFilters);
  };

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

  const getRepoName = (url: string) => {
    try {
      const parts = url.split('/');
      return parts[parts.length - 1].replace('.git', '');
    } catch {
      return url;
    }
  };

  return (
    <Layout className="mobile-projects">
      <Content className="mobile-projects-content">
        <div className="mobile-projects-header">
          <div>
            <Title level={4}>项目管理</Title>
            <Text type="secondary">共 {total} 个项目</Text>
          </div>
        </div>

        <div className="mobile-projects-stats">
          <Card className="stat-card" size="small">
            <Text type="secondary">全部</Text>
            <div className="stat-value">{total}</div>
          </Card>
          <Card className="stat-card" size="small">
            <Text type="secondary">启用</Text>
            <div className="stat-value">{activeCount}</div>
          </Card>
          <Card className="stat-card" size="small">
            <Text type="secondary">停用</Text>
            <div className="stat-value">{inactiveCount}</div>
          </Card>
        </div>

        <div className="mobile-projects-filters">
          <Input.Search
            placeholder="搜索项目名称"
            allowClear
            enterButton={<SearchOutlined />}
            onSearch={handleSearch}
          />
          <Select
            value={statusFilter}
            onChange={handleStatusChange}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'active', label: '仅启用' },
              { value: 'inactive', label: '仅停用' },
            ]}
          />
        </div>

        <div className="mobile-projects-list">
          {projects.map((project) => (
            <Card key={project.id} loading={loading} className="project-card" size="small">
              <div className="project-card-header">
                <div>
                  <Text strong>{project.name}</Text>
                  <div className="project-card-meta">
                    <FolderOutlined />
                    <span>{getRepoName(project.gitRepositoryUrl)}</span>
                  </div>
                </div>
                <Tag color={project.isActive ? 'green' : 'default'}>
                  {project.isActive ? '启用' : '停用'}
                </Tag>
              </div>

              {project.description ? (
                <Paragraph className="project-card-desc">{project.description}</Paragraph>
              ) : null}

              <div className="project-card-info">
                <div>
                  <BranchesOutlined />
                  <span>{project.gitBranch}</span>
                </div>
                {project.lastPulledAt ? (
                  <span>更新于 {new Date(project.lastPulledAt).toLocaleDateString()}</span>
                ) : (
                  <span>未更新</span>
                )}
              </div>

              <div className="project-card-actions">
                <Button size="small" icon={<ReloadOutlined />} onClick={() => handlePullRepository(project)}>
                  更新
                </Button>
                <div className="project-card-right">
                  <Switch
                    size="small"
                    checked={project.isActive}
                    onChange={() => handleStatusToggle(project)}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Content>
    </Layout>
  );
};

export default MobileProjectsPage;
